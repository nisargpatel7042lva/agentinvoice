import {
  AddressSchema,
  calculateBuyerCibilScore,
  calculateDualPartyCibilScore,
  calculateSupplierCibilScore,
  InvoiceSchema,
  type Address,
  type Invoice,
} from "@agentinvoice/shared";
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

const addressParams = z.object({ address: AddressSchema });
const idParams = z.object({ id: z.string().regex(/^\d+$/, "id must be an integer string") });

export function cibilRoutes(app: FastifyInstance) {
  // Query supplier CIBIL score
  app.get("/api/cibil/supplier/:address", async (req, reply) => {
    const p = addressParams.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "invalid_address", issues: p.error.issues });

    const rows = app.db
      .prepare(
        "SELECT id, supplier, buyer_vault, face_amount, price, due_date, status, bond, holder, evidence_hash, description FROM invoices"
      )
      .all() as InvoiceRow[];
    const invoices = rows.map(toInvoice);

    const score = calculateSupplierCibilScore(p.data.address as Address, invoices);
    return reply.send(score);
  });

  // Query buyer CIBIL score
  app.get("/api/cibil/buyer/:address", async (req, reply) => {
    const p = addressParams.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "invalid_address", issues: p.error.issues });

    const rows = app.db
      .prepare(
        "SELECT id, supplier, buyer_vault, face_amount, price, due_date, status, bond, holder, evidence_hash, description FROM invoices"
      )
      .all() as InvoiceRow[];
    const invoices = rows.map(toInvoice);

    const score = calculateBuyerCibilScore(p.data.address as Address, invoices);
    return reply.send(score);
  });

  // Query dual-party CIBIL score for a specific invoice
  app.get("/api/invoices/:id/cibil", async (req, reply) => {
    const p = idParams.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "invalid_id", issues: p.error.issues });

    const targetRow = app.db
      .prepare(
        "SELECT id, supplier, buyer_vault, face_amount, price, due_date, status, bond, holder, evidence_hash, description FROM invoices WHERE id = ?"
      )
      .get(p.data.id) as InvoiceRow | undefined;

    if (!targetRow) return reply.code(404).send({ error: "not_found" });

    const targetInvoice = toInvoice(targetRow);

    const allRows = app.db
      .prepare(
        "SELECT id, supplier, buyer_vault, face_amount, price, due_date, status, bond, holder, evidence_hash, description FROM invoices"
      )
      .all() as InvoiceRow[];
    const allInvoices = allRows.map(toInvoice);

    const dual = calculateDualPartyCibilScore(targetInvoice, allInvoices);
    return reply.send(dual);
  });
}

