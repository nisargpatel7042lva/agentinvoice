import { AddressSchema, InvoiceListSchema, InvoiceSchema, StatusSchema, type Invoice } from "@agentinvoice/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

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
