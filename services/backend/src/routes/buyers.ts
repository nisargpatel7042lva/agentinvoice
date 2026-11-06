import { AddressSchema } from "@invoiceagent/shared";
import type { FastifyInstance } from "fastify";
import { getAddress } from "viem";
import { z } from "zod";
import { BuyerMintError, buyerClaimMessage, mintBuyerName, type BuyerMintDeps } from "../ens/mintBuyer.js";

export type BuyerMinter = Pick<BuyerMintDeps, "parent" | "isTaken" | "register" | "vaultOwner">;

const body = z.object({ label: z.string().max(40), owner: AddressSchema, vault: AddressSchema, signature: z.string().regex(/^0x[0-9a-fA-F]+$/) });
const STATUS: Record<BuyerMintError["code"], number> = { bad_label: 400, reserved: 400, bad_signature: 401, not_buyer: 403, not_vault_owner: 403, taken: 409, already_registered: 409, chain_failed: 502 };

export function buyerRoutes(app: FastifyInstance, minter: BuyerMinter | undefined, perMinute: number) {
  // Public list of vault to ENS name pairs. The website verifies each against the ENS record before trusting it.
  app.get("/api/agents", async () => ({
    agents: (app.db.prepare("SELECT vault, name, owner FROM buyer_names ORDER BY created_at").all() as { vault: string; name: string; owner: string }[]),
  }));

  app.get("/api/buyers/message", async (req, reply) => {
    const q = z.object({ label: z.string(), owner: AddressSchema, vault: AddressSchema }).safeParse(req.query);
    if (!q.success || !minter) return reply.code(minter ? 400 : 503).send({ error: minter ? "bad_request" : "ens_mint_not_configured" });
    return { message: buyerClaimMessage(q.data.label.trim().toLowerCase(), minter.parent, q.data.vault, q.data.owner) };
  });

  app.post("/api/buyers", { config: { rateLimit: { max: perMinute, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!minter) return reply.code(503).send({ error: "ens_mint_not_configured" });
    const p = body.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "bad_request" });
    try {
      const r = await mintBuyerName(
        {
          ...minter,
          roleOf: (o) => (app.db.prepare("SELECT role FROM user_roles WHERE owner = ?").get(getAddress(o)) as { role: "buyer" | "seller" } | undefined)?.role ?? null,
          existing: (o, v) => (app.db.prepare("SELECT name FROM buyer_names WHERE owner = ? OR vault = ?").get(o, v) as { name: string } | undefined)?.name ?? null,
          remember: (vault, owner, name, tx) => void app.db.prepare("INSERT INTO buyer_names (vault, owner, name, tx_hash, created_at) VALUES (?,?,?,?,?)").run(vault, owner, name, tx, Math.floor(Date.now() / 1000)),
        },
        { label: p.data.label, owner: p.data.owner, vault: p.data.vault, signature: p.data.signature as `0x${string}` },
      );
      return reply.code(201).send(r);
    } catch (e) {
      if (e instanceof BuyerMintError) return reply.code(STATUS[e.code]).send({ error: e.code, message: e.message });
      throw e;
    }
  });
}
