import type Database from "better-sqlite3";
import Fastify from "fastify";
import { openDb } from "./db.js";
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

export interface AppOptions {
  dbPath: string;
  world?: WorldOptions | null; // null = not configured; undefined = read from env
  audit?: AuditOptions; // undefined = read HCS_TOPIC_ID from env
  onAudit?: (event: AuditInput) => void; // the HCS publisher; default is a no-op
}

export function buildApp({ dbPath, world, audit, onAudit }: AppOptions) {
  const db = openDb(dbPath);

  const app = Fastify({ logger: process.env.NODE_ENV !== "test" && !process.env.VITEST });
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

  app.get("/health", async (_req, reply) => {
    try {
      db.prepare("SELECT 1").get();
      return { ok: true, db: "ok" };
    } catch {
      return reply.code(503).send({ ok: false, db: "error" });
    }
  });

  invoiceRoutes(app);
  auditRoutes(app, audit ?? { topicId: process.env.HCS_TOPIC_ID || undefined });
  approvalRoutes(app, world === null ? undefined : (world ?? worldFromEnv()));

  return app;
}
