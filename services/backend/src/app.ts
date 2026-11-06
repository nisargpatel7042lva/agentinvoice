import rateLimit from "@fastify/rate-limit";
import type Database from "better-sqlite3";
import Fastify from "fastify";
import { getMeta, openDb, SCHEMA_VERSION } from "./db.js";
import type { AuditInput } from "./audit/audit.js";
import { approvalRoutes, worldFromEnv, type WorldOptions } from "./routes/approvals.js";
import { auditRoutes, type AuditOptions } from "./routes/audit.js";
import { invoiceRoutes } from "./routes/invoices.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Database.Database;
    // Records an important event on the HCS audit topic. Never throws and never blocks the caller.
    audit: (event: AuditInput) => void;
  }
}

// Requests per minute per client IP. Behind a proxy or tunnel every client shares the proxy's IP unless trustProxy is configured.
export interface ApprovalLimits {
  approvalStartPerMinute: number; // POST /api/approvals
  callbackPerMinute: number; // GET /api/world/callback
  approvalReadPerMinute: number; // GET /api/approvals/:id
}
export const DEFAULT_LIMITS: ApprovalLimits = { approvalStartPerMinute: 10, callbackPerMinute: 30, approvalReadPerMinute: 120 };
const MAX_BODY_BYTES = 16 * 1024;

export interface AppOptions {
  dbPath: string;
  world?: WorldOptions | null; // null = not configured; undefined = read from env
  audit?: AuditOptions; // undefined = read HCS_TOPIC_ID from env
  onAudit?: (event: AuditInput) => void; // the HCS publisher; default is a no-op
  features?: { indexer?: boolean; ens?: boolean; audit?: boolean }; // which background jobs run, for /health
  limits?: Partial<ApprovalLimits>; // per-client requests per minute on the approval endpoints
}

export function buildApp({ dbPath, world, audit, onAudit, features = {}, limits }: AppOptions) {
  const db = openDb(dbPath);

  const app = Fastify({ logger: process.env.NODE_ENV !== "test" && !process.env.VITEST, bodyLimit: MAX_BODY_BYTES });
  app.decorate("db", db);
  app.decorate("audit", (event: AuditInput) => {
    try {
      onAudit?.(event);
    } catch {
      // an audit failure must never break the main action
    }
  });
  app.addHook("onClose", async () => {
    db.close();
  });

  const INDEXER_STALE_SECONDS = 60;
  const numberMeta = (key: string) => {
    const v = getMeta(db, key);
    return v === null ? null : Number(v);
  };

  // db: can the database answer. indexer.lagSeconds: seconds since the last successful chain poll (the mirror/RPC lag).
  // ens.lastPublishAt: last time a record was actually written. degraded means a background job looks stuck; ok means the API itself works.
  app.get("/health", async (_req, reply) => {
    try {
      db.prepare("SELECT 1").get();
    } catch {
      return reply.code(503).send({ ok: false, db: "error" });
    }
    const now = Math.floor(Date.now() / 1000);
    const lastSyncedAt = numberMeta("last_synced_at");
    const lagSeconds = lastSyncedAt === null ? null : now - lastSyncedAt;
    return {
      ok: true,
      db: "ok",
      schemaVersion: SCHEMA_VERSION,
      degraded: Boolean(features.indexer) && (lagSeconds === null || lagSeconds > INDEXER_STALE_SECONDS),
      indexer: { enabled: Boolean(features.indexer), lastSyncedAt, lagSeconds },
      ens: { enabled: Boolean(features.ens), lastCheckAt: numberMeta("last_ens_check_at"), lastPublishAt: numberMeta("last_ens_publish_at") },
      audit: { enabled: Boolean(features.audit) },
    };
  });

  invoiceRoutes(app);
  auditRoutes(app, audit ?? { topicId: process.env.HCS_TOPIC_ID || undefined });
  // Rate limiting is opt-in per route (global: false), so only the approval endpoints are limited. The plugin must finish
  // loading before the routes are added, so they are registered inside this scope.
  const approvalWorld = world === null ? undefined : (world ?? worldFromEnv());
  void app.register(async (scope) => {
    await scope.register(rateLimit, { global: false });
    approvalRoutes(scope, approvalWorld, { ...DEFAULT_LIMITS, ...limits });
  });

  return app;
}
