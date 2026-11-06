import { ApprovalSchema, ApprovalStartSchema } from "@agentinvoice/shared";
import type { FastifyInstance } from "fastify";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { ApprovalLimits } from "../app.js";
import { createApproval, decide, getApproval, markStepUpUsed, pendingForStepUp } from "../approval/store.js";
import { handleCallback, remoteWorldKeys, StepUpError, type StepUpErrorCode } from "../world/callback.js";
import type { CallbackContext } from "../world/callback.js";
import { startStepUp } from "../world/stepup.js";

export interface WorldOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string; // the registered World callback, i.e. <public url>/api/world/callback
  appUrl: string; // where the sponsor is sent after the callback
  ttlSeconds?: number; // how long an approval stays valid; default 600
  getKey?: CallbackContext["getKey"];
  fetchImpl?: typeof fetch;
  now?: () => number; // unix seconds
}

// Reads World settings from env. Returns undefined when not configured, so the approval routes answer 503.
export function worldFromEnv(env: NodeJS.ProcessEnv = process.env): WorldOptions | undefined {
  const { WORLD_CLIENT_ID: clientId, WORLD_CLIENT_SECRET: clientSecret, WORLD_REDIRECT_URI: redirectUri } = env;
  if (!clientId || !clientSecret || !redirectUri) return undefined;
  return {
    clientId,
    clientSecret,
    redirectUri,
    appUrl: env.APP_URL || "http://localhost:3000",
    ttlSeconds: env.APPROVAL_TTL_SECONDS ? Number(env.APPROVAL_TTL_SECONDS) : undefined,
  };
}

const startBody = z.object({ invoiceId: z.string().regex(/^\d+$/, "invoiceId must be a non-negative integer") });
const idParams = z.object({ id: z.string().min(1).max(64) });
const callbackQuery = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  iss: z.string().optional(),
  error: z.string().optional(),
});

// Errors after which the approval is rejected for good. The others leave it as it was (nothing proved a decision).
const REJECTING: ReadonlySet<StepUpErrorCode> = new Set([
  "user_cancelled",
  "provider_error",
  "token_exchange_failed",
  "invalid_token",
  "nonce_mismatch",
  "stale_authentication",
  "insufficient_acr",
]);

export function approvalRoutes(app: FastifyInstance, world: WorldOptions | undefined, limits: ApprovalLimits) {
  const limit = (max: number) => ({ rateLimit: { max, timeWindow: "1 minute" } });
  const now = () => world?.now?.() ?? Math.floor(Date.now() / 1000);
  const keys = world?.getKey ?? remoteWorldKeys();

  app.post("/api/approvals", { config: limit(limits.approvalStartPerMinute) }, async (req, reply) => {
    if (!world) return reply.code(503).send({ error: "world_not_configured" });
    const body = startBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_body", issues: body.error.issues });

    const invoice = app.db.prepare("SELECT id, buyer_vault, face_amount, status FROM invoices WHERE id = ?").get(body.data.invoiceId) as
      | { id: string; buyer_vault: string; face_amount: string; status: string }
      | undefined;
    if (!invoice) return reply.code(404).send({ error: "invoice_not_found" });
    if (invoice.status === "Paid" || invoice.status === "Defaulted") return reply.code(409).send({ error: "invoice_closed" });

    // The vault and the amount come from the invoice, never from the client.
    const approvalId = randomUUID();
    const start = startStepUp(approvalId, { clientId: world.clientId, redirectUri: world.redirectUri });
    createApproval(app.db, {
      id: approvalId,
      invoiceId: invoice.id,
      vault: invoice.buyer_vault,
      amount: invoice.face_amount,
      nonce: start.nonce,
      codeVerifier: start.codeVerifier,
      now: now(),
      ttlSeconds: world.ttlSeconds ?? 600,
    });
    app.audit({ type: "approval.started", invoiceId: invoice.id, data: { approvalId, amount: invoice.face_amount } });
    return reply.code(201).send(ApprovalStartSchema.parse({ approvalId, authorizationUrl: start.url }));
  });

  app.get("/api/approvals/:id", { config: limit(limits.approvalReadPerMinute) }, async (req, reply) => {
    const p = idParams.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "invalid_id" });
    const approval = getApproval(app.db, p.data.id, now());
    if (!approval) return reply.code(404).send({ error: "not_found" });
    return ApprovalSchema.parse(approval);
  });

  app.get("/api/world/callback", { config: limit(limits.callbackPerMinute) }, async (req, reply) => {
    if (!world) return reply.code(503).send({ error: "world_not_configured" });
    const q = callbackQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid_query" });
    const { state } = q.data;

    const redirect = (result: string, code?: string) => {
      const url = new URL(`/approval/${encodeURIComponent(state ?? "unknown")}`, world.appUrl);
      url.searchParams.set("result", result);
      if (code) url.searchParams.set("code", code);
      return reply.redirect(url.toString(), 302);
    };

    try {
      const verified = await handleCallback(q.data, {
        config: { clientId: world.clientId, clientSecret: world.clientSecret, redirectUri: world.redirectUri },
        getPending: (s) => pendingForStepUp(app.db, s),
        consume: (s) => markStepUpUsed(app.db, s, now()),
        getKey: keys,
        fetchImpl: world.fetchImpl,
        now,
      });
      // Only a still-pending approval can be approved; an approval that expired meanwhile stays expired.
      const current = state ? getApproval(app.db, state, now()) : undefined;
      if (!state || current?.state !== "pending") return redirect(current?.state ?? "error", "approval_not_pending");
      const subjectHash = createHash("sha256").update(`${verified.issuer}:${verified.subject}`).digest("hex");
      decide(app.db, state, "approve", { now: now(), subjectHash });
      app.audit({ type: "approval.approved", invoiceId: current.invoiceId, data: { approvalId: state } });
      return redirect("approved");
    } catch (err) {
      if (!(err instanceof StepUpError)) throw err;
      // Never log tokens, codes or the client secret: only the error code.
      req.log.info({ code: err.code }, "world step-up refused");
      const before = state ? getApproval(app.db, state, now()) : undefined;
      if (state && before && REJECTING.has(err.code) && before.state === "pending") {
        decide(app.db, state, "reject", { now: now() });
        app.audit({ type: "approval.rejected", invoiceId: before.invoiceId, data: { approvalId: state, reason: err.code } });
      }
      const after = state ? getApproval(app.db, state, now()) : undefined;
      if (after?.state === "expired" && err.code === "approval_expired") {
        app.audit({ type: "approval.expired", invoiceId: after.invoiceId, data: { approvalId: after.id } });
      }
      return redirect(after?.state ?? "error", err.code);
    }
  });
}
