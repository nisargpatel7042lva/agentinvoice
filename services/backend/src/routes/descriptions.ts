import { AddressSchema } from "@invoiceagent/shared";
import type { FastifyInstance } from "fastify";
import { getAddress, verifyMessage } from "viem";
import { z } from "zod";

export const descriptionMessage = (id: string, description: string, supplier: string) =>
  `Describe invoice #${id} on Invoice Agent. Supplier ${getAddress(supplier)}. Text: ${description}`;

const params = z.object({ id: z.string().regex(/^\d+$/) });
const body = z.object({ description: z.string().trim().min(1).max(500), owner: AddressSchema, signature: z.string().regex(/^0x[0-9a-fA-F]+$/) });

/**
 * A seller who created an invoice from their own wallet attaches the off-chain description afterwards.
 * Only the invoice's on-chain supplier can set it, proven by a signature, and only while it is still empty.
 * 404 until the indexer has seen the invoice, so the caller retries for a few seconds.
 */
export function descriptionRoutes(app: FastifyInstance, perMinute: number) {
  app.put("/api/invoices/:id/description", { config: { rateLimit: { max: perMinute, timeWindow: "1 minute" } } }, async (req, reply) => {
    const p = params.safeParse(req.params);
    const b = body.safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: "bad_request" });
    const row = app.db.prepare("SELECT supplier, description, source FROM invoices WHERE id = ?").get(p.data.id) as { supplier: string; description: string; source: string } | undefined;
    if (!row || row.source !== "chain") return reply.code(404).send({ error: "not_indexed_yet" });
    if (getAddress(row.supplier) !== getAddress(b.data.owner)) return reply.code(403).send({ error: "not_supplier" });
    const ok = await verifyMessage({ address: getAddress(b.data.owner), message: descriptionMessage(p.data.id, b.data.description, b.data.owner), signature: b.data.signature as `0x${string}` }).catch(() => false);
    if (!ok) return reply.code(401).send({ error: "bad_signature" });
    if (row.description) return reply.code(409).send({ error: "already_described" });
    app.db.prepare("UPDATE invoices SET description = ? WHERE id = ? AND source = 'chain'").run(b.data.description, p.data.id);
    return reply.code(200).send({ ok: true });
  });

  app.get("/api/invoices/:id/description/message", async (req, reply) => {
    const q = z.object({ owner: AddressSchema, text: z.string().trim().min(1).max(500) }).safeParse(req.query);
    const p = params.safeParse(req.params);
    if (!q.success || !p.success) return reply.code(400).send({ error: "bad_request" });
    return { message: descriptionMessage(p.data.id, q.data.text, q.data.owner) };
  });
}
