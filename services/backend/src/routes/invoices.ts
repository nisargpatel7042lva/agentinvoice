import { AddressSchema, AmountSchema, Hash32Schema, InvoiceListSchema, InvoiceSchema, StatusSchema, type Invoice } from "@invoiceagent/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { InvoiceIssuer } from "../chain/issuer.js";
import { errorMessage } from "../errors.js";
import { upsertChainInvoice } from "../indexer.js";

interface InvoiceRow {
  id: string;
  supplier: string;
  buyer_vault: string;
  face_amount: string;
  price: string;
  due_date: number;
  status: string;
  bond: string | null;
  holder: string | null;
  evidence_hash: string;
  description: string;
}

const toInvoice = (r: InvoiceRow): Invoice =>
  InvoiceSchema.parse({
    id: r.id,
    supplier: r.supplier,
    buyerVault: r.buyer_vault,
    faceAmount: r.face_amount,
    price: r.price,
    dueDate: r.due_date,
    status: r.status,
    bond: r.bond,
    holder: r.holder,
    evidenceHash: r.evidence_hash,
    description: r.description,
  });

const listQuery = z.object({
  status: StatusSchema.optional(),
  supplier: AddressSchema.optional(),
  buyer: AddressSchema.optional(),
});
const idParams = z.object({ id: z.string().regex(/^\d+$/, "id must be a non-negative integer") });

// GET /api/invoices and GET /api/invoices/:id from spec v2 section 3. Seed rows are included and carry "DEMO" in their
// description, so the UI can tell them apart from rows indexed from the chain.
export function invoiceRoutes(app: FastifyInstance) {
  app.get("/api/invoices", async (req, reply) => {
    const q = listQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid_query", issues: q.error.issues });

    const where: string[] = [];
    const args: string[] = [];
    const filter = (clause: string, value: string | undefined) => {
      if (value === undefined) return;
      where.push(clause);
      args.push(value);
    };
    filter("status = ?", q.data.status);
    filter("lower(supplier) = lower(?)", q.data.supplier);
    filter("lower(buyer_vault) = lower(?)", q.data.buyer);

    const rows = app.db
      .prepare(`SELECT * FROM invoices ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY CAST(id AS INTEGER) DESC`)
      .all(...args) as InvoiceRow[];
    return InvoiceListSchema.parse(rows.map(toInvoice));
  });

  app.get("/api/invoices/:id", async (req, reply) => {
    const p = idParams.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "invalid_id", issues: p.error.issues });

    const row = app.db.prepare("SELECT * FROM invoices WHERE id = ?").get(p.data.id) as InvoiceRow | undefined;
    if (!row) return reply.code(404).send({ error: "not_found" });
    return toInvoice(row);
  });
}

const MAX_UINT256 = 2n ** 256n - 1n;
const inUint256Range = (v: string) => {
  if (!/^\d+$/.test(v)) return false; // BigInt() would throw on "1.5"; the format error is reported by AmountSchema
  const n = BigInt(v);
  return n > 0n && n <= MAX_UINT256;
};
const amount = AmountSchema.refine(inUint256Range, "must be greater than 0 and fit in uint256");

// Body of POST /api/invoices (spec v2 section 3): the invoice terms plus the off-chain description and evidence hash.
const createBody = z
  .object({
    buyerVault: AddressSchema,
    faceAmount: amount,
    price: amount,
    dueDate: z.number().int().positive(),
    description: z.string().trim().min(1).max(500),
    evidenceHash: Hash32Schema,
  })
  .refine((b) => !inUint256Range(b.price) || !inUint256Range(b.faceAmount) || BigInt(b.price) <= BigInt(b.faceAmount), { message: "price cannot exceed faceAmount", path: ["price"] });

export interface CreateInvoiceOptions {
  issuer?: InvoiceIssuer;
  now?: () => number; // unix seconds
}

// POST /api/invoices: creates the invoice on-chain from the configured issuer wallet, stores it (source "chain") with its
// description, and returns it as a Pending invoice. The issuer wallet becomes the invoice's supplier (demo mode, see
// chain/issuer.ts). The evidence hash identifies an invoice, so a second request with the same hash is refused.
export function invoiceCreateRoutes(app: FastifyInstance, opts: CreateInvoiceOptions, maxPerMinute: number) {
  const inFlight = new Set<string>(); // evidence hashes being created right now
  const now = () => opts.now?.() ?? Math.floor(Date.now() / 1000);

  app.post("/api/invoices", { config: { rateLimit: { max: maxPerMinute, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!opts.issuer) return reply.code(503).send({ error: "issuer_not_configured" });
    const body = createBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body", issues: body.error.issues });
    const b = body.data;
    if (b.dueDate <= now()) return reply.code(400).send({ error: "invalid_body", issues: [{ path: ["dueDate"], message: "must be in the future" }] });

    const key = b.evidenceHash.toLowerCase();
    const existing = app.db.prepare("SELECT id FROM invoices WHERE lower(evidence_hash) = ?").get(key) as { id: string } | undefined;
    if (existing) return reply.code(409).send({ error: "duplicate_evidence", invoiceId: existing.id });
    if (inFlight.has(key)) return reply.code(409).send({ error: "in_progress" });

    inFlight.add(key);
    try {
      const issued = await opts.issuer.createInvoice({
        buyerVault: b.buyerVault,
        faceAmount: BigInt(b.faceAmount),
        price: BigInt(b.price),
        dueDate: BigInt(b.dueDate),
        evidenceHash: b.evidenceHash,
      });
      upsertChainInvoice(app.db, issued.id, issued.invoice, now());
      app.db.prepare("UPDATE invoices SET description = ? WHERE id = ? AND source = 'chain'").run(b.description, issued.id);
      app.audit({ type: "invoice.created", invoiceId: issued.id, data: { status: "Pending" } });

      const row = app.db.prepare("SELECT * FROM invoices WHERE id = ?").get(issued.id) as InvoiceRow;
      return reply.code(201).send(toInvoice(row));
    } catch (err) {
      req.log.warn({ message: errorMessage(err) }, "create invoice failed"); // message only, never the key
      return reply.code(502).send({ error: "chain_error" });
    } finally {
      inFlight.delete(key);
    }
  });
}
