import { AuditListSchema } from "@agentinvoice/shared";
import type { FastifyInstance } from "fastify";
import { readAuditEvents } from "../audit/audit.js";

export interface AuditOptions {
  topicId?: string; // HCS topic, e.g. 0.0.12345 (HCS_TOPIC_ID)
  fetchImpl?: typeof fetch;
  mirrorUrl?: string;
}

// GET /api/audit from spec v2: the topic's events, newest first, read back through the mirror node.
export function auditRoutes(app: FastifyInstance, audit: AuditOptions) {
  app.get("/api/audit", async (_req, reply) => {
    if (!audit.topicId) return reply.code(503).send({ error: "audit_topic_not_configured" });
    try {
      return AuditListSchema.parse(await readAuditEvents(audit.topicId, { fetchImpl: audit.fetchImpl, mirrorUrl: audit.mirrorUrl }));
    } catch (err) {
      app.log.warn({ message: (err as Error).message }, "audit read failed"); // message only
      return reply.code(502).send({ error: "mirror_node_unavailable" });
    }
  });
}
