import type Database from "better-sqlite3";
import Fastify from "fastify";
import { openDb } from "./db.js";
import { approvalRoutes, worldFromEnv, type WorldOptions } from "./routes/approvals.js";
import { invoiceRoutes } from "./routes/invoices.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Database.Database;
  }
}

export interface AppOptions {
  dbPath: string;
  world?: WorldOptions | null; // null = not configured; undefined = read from env
}

export function buildApp({ dbPath, world }: AppOptions) {
  const db = openDb(dbPath);

  const app = Fastify({ logger: process.env.NODE_ENV !== "test" && !process.env.VITEST });
  app.decorate("db", db);
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
  approvalRoutes(app, world === null ? undefined : (world ?? worldFromEnv()));

  return app;
}
