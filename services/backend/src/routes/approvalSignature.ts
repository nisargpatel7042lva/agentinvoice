import type { FastifyInstance } from "fastify";
import { getAddress } from "viem";
import { z } from "zod";
import { contractNonce, encodeApproval, type ApprovalSigner } from "../approval/sign.js";

const params = z.object({ id: z.string().regex(/^\d+$/) });

interface Row {
  id: string;
  vault: string;
  amount: string;
  expires_at: number;
}

/**
 * GET /api/invoices/:id/approval: the signed payment approval for a Funded invoice, once a World-verified human approved it.
 * The buyer agent calls this and passes the bytes to BuyerVault.payInvoice. It is safe to read more than once: the signature is
 * deterministic and the contract burns the nonce on first use. 404 until an approval exists.
 */
export function approvalSignatureRoutes(app: FastifyInstance, signer: ApprovalSigner | undefined, now: () => number = () => Math.floor(Date.now() / 1000)) {
  app.get("/api/invoices/:id/approval", async (req, reply) => {
    if (!signer) return reply.code(503).send({ error: "approval_signer_not_configured" });
    const p = params.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "invalid_id" });
    const inv = app.db.prepare("SELECT status, buyer_vault, face_amount FROM invoices WHERE id = ?").get(p.data.id) as { status: string; buyer_vault: string; face_amount: string } | undefined;
    if (!inv) return reply.code(404).send({ error: "invoice_not_found" });
    if (inv.status !== "Funded") return reply.code(404).send({ error: "invoice_not_payable" });
    const row = app.db
      .prepare(
        `SELECT id, vault, amount, expires_at FROM approvals
         WHERE invoice_id = ? AND state = 'approved' AND consumed_at IS NULL AND expires_at > ?
         ORDER BY decided_at DESC LIMIT 1`,
      )
      .get(p.data.id, now()) as Row | undefined;
    // The approval must still match the invoice it was granted for: same vault, same amount.
    if (!row || getAddress(row.vault) !== getAddress(inv.buyer_vault) || BigInt(row.amount) !== BigInt(inv.face_amount)) return reply.code(404).send({ error: "no_approval" });

    const nonce = contractNonce(row.id);
    const expiry = BigInt(row.expires_at);
    const signature = await signer.sign({ vault: getAddress(row.vault), invoiceId: BigInt(p.data.id), amount: BigInt(row.amount), nonce, expiry });
    return { approvalId: row.id, approval: encodeApproval(nonce, expiry, signature), expiry: row.expires_at, verifier: signer.address };
  });
}
