import Fastify from "fastify";
import { openDb } from "./db.js";

export interface AppOptions {
  dbPath: string;
}

export function buildApp({ dbPath }: AppOptions) {
  const db = openDb(dbPath);

  const app = Fastify();
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

  return app;
}
