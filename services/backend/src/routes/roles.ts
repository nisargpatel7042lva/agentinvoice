import { AddressSchema } from "@invoiceagent/shared";
import type { FastifyInstance } from "fastify";
import { getAddress, verifyMessage } from "viem";
import { z } from "zod";

export const ROLES = ["buyer", "seller"] as const;
export type Role = (typeof ROLES)[number];

export const roleMessage = (role: Role, owner: string) => `I am a ${role} on Invoice Agent. Wallet ${getAddress(owner)}. This choice cannot be changed.`;

const body = z.object({ owner: AddressSchema, role: z.enum(ROLES), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) });

/** A wallet picks buyer or seller once, proven by a signature. One role per wallet. */
export function roleRoutes(app: FastifyInstance, perMinute: number) {
  const roleOf = (owner: string) => (app.db.prepare("SELECT role FROM user_roles WHERE owner = ?").get(getAddress(owner)) as { role: Role } | undefined)?.role ?? null;

  app.get("/api/roles/message", async (req, reply) => {
    const q = z.object({ owner: AddressSchema, role: z.enum(ROLES) }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "bad_request" });
    return { message: roleMessage(q.data.role, q.data.owner) };
  });

  app.get("/api/roles/:owner", async (req, reply) => {
    const owner = AddressSchema.safeParse((req.params as { owner: string }).owner);
    if (!owner.success) return reply.code(400).send({ error: "bad_address" });
    return { role: roleOf(owner.data) };
  });

  app.post("/api/roles", { config: { rateLimit: { max: perMinute, timeWindow: "1 minute" } } }, async (req, reply) => {
    const p = body.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "bad_request" });
    const owner = getAddress(p.data.owner);
    const ok = await verifyMessage({ address: owner, message: roleMessage(p.data.role, owner), signature: p.data.signature as `0x${string}` }).catch(() => false);
    if (!ok) return reply.code(401).send({ error: "bad_signature" });
    const had = roleOf(owner);
    if (had) return reply.code(409).send({ error: "role_already_set", role: had });
    app.db.prepare("INSERT INTO user_roles (owner, role, created_at) VALUES (?,?,?)").run(owner, p.data.role, Math.floor(Date.now() / 1000));
    return reply.code(201).send({ role: p.data.role });
  });
}
