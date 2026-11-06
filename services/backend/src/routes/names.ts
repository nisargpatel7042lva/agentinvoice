import { AddressSchema } from "@agentinvoice/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { claimMessage, MintError, mintSellerName, type MintDeps } from "../ens/mint.js";

export type NameMinter = Pick<MintDeps, "parent" | "isTaken" | "register">;

const body = z.object({ label: z.string().max(40), owner: AddressSchema, signature: z.string().regex(/^0x[0-9a-fA-F]+$/) });
const STATUS: Record<MintError["code"], number> = { bad_label: 400, reserved: 400, bad_signature: 401, taken: 409, already_has_name: 409, chain_failed: 502 };

export function nameRoutes(app: FastifyInstance, minter: NameMinter | undefined, perMinute: number) {
  const nameFor = (owner: string) => (app.db.prepare("SELECT name FROM seller_names WHERE owner = ?").get(owner) as { name: string } | undefined)?.name ?? null;

  app.get("/api/names/:owner", async (req, reply) => {
    const owner = AddressSchema.safeParse((req.params as { owner: string }).owner);
    if (!owner.success) return reply.code(400).send({ error: "bad_address" });
    return { name: nameFor(owner.data), parent: minter?.parent ?? null };
  });

  app.get("/api/names/message", async (req, reply) => {
    const q = z.object({ label: z.string(), owner: AddressSchema }).safeParse(req.query);
    if (!q.success || !minter) return reply.code(minter ? 400 : 503).send({ error: minter ? "bad_request" : "ens_mint_not_configured" });
    return { message: claimMessage(q.data.label.trim().toLowerCase(), minter.parent, q.data.owner) };
  });

  app.post("/api/names", { config: { rateLimit: { max: perMinute, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!minter) return reply.code(503).send({ error: "ens_mint_not_configured" });
    const p = body.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "bad_request" });
    try {
      const r = await mintSellerName(
        {
          ...minter,
          existingNameFor: (o) => nameFor(o),
          remember: (owner, name, tx) => void app.db.prepare("INSERT INTO seller_names (owner, name, tx_hash, created_at) VALUES (?,?,?,?)").run(owner, name, tx, Math.floor(Date.now() / 1000)),
        },
        { label: p.data.label, owner: p.data.owner, signature: p.data.signature as `0x${string}` },
      );
      return reply.code(201).send(r);
    } catch (e) {
      if (e instanceof MintError) return reply.code(STATUS[e.code]).send({ error: e.code, message: e.message });
      throw e;
    }
  });
}
