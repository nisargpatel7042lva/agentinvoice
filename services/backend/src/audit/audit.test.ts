import { AuditListSchema } from "@agentinvoice/shared";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { auditEventForStatus, buildMessage, hashPayload, publishAudit, readAuditEvents } from "./audit.js";

const NOW = 1_800_000_000;

describe("buildMessage", () => {
  it("builds a typed message with a payload hash and no extra fields", () => {
    const m = buildMessage({ type: "invoice.funded", invoiceId: "7", data: { holder: "0xabc" } }, NOW);

    expect(m).toMatchObject({ type: "invoice.funded", invoiceId: "7", data: { holder: "0xabc" }, ts: NOW });
    expect(m.payloadHash).toBe(hashPayload({ type: "invoice.funded", invoiceId: "7", data: { holder: "0xabc" }, ts: NOW }));
    expect(m.payloadHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes the same content to the same value regardless of key order", () => {
    const a = hashPayload({ type: "x.y", invoiceId: null, data: { a: 1, b: 2 }, ts: 1 });
    const b = hashPayload({ type: "x.y", invoiceId: null, data: { b: 2, a: 1 }, ts: 1 });
    expect(a).toBe(b);
  });

  it("refuses fields that look like personal data or secrets", () => {
    for (const data of [{ email: "a@b.c" }, { subject: "sub-1" }, { token: "x" }, { nested: { privateKey: "0x1" } }]) {
      expect(() => buildMessage({ type: "approval.started", invoiceId: "1", data }, NOW)).toThrow(/forbidden/);
    }
  });
});

describe("auditEventForStatus", () => {
  it.each([
    ["Pending", "invoice.created"],
    ["Open", "invoice.accepted"],
    ["Funded", "invoice.funded"],
    ["Paid", "invoice.paid"],
    ["Late", "invoice.late"],
    ["Defaulted", "invoice.defaulted"],
  ] as const)("%s -> %s", (status, type) => {
    expect(auditEventForStatus(status)).toBe(type);
  });
});

describe("publishAudit", () => {
  const sleep = async () => {};

  it("submits the JSON message once on success", async () => {
    const sent: string[] = [];
    await publishAudit({ type: "invoice.paid", invoiceId: "7", data: {} }, { submit: async (m) => void sent.push(m), sleep, now: () => NOW });

    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0] as string)).toMatchObject({ type: "invoice.paid", invoiceId: "7", ts: NOW });
  });

  it("retries a failing submit up to 3 times, then gives up without throwing", async () => {
    let calls = 0;
    const errors: string[] = [];
    const ok = await publishAudit(
      { type: "invoice.paid", invoiceId: "7", data: {} },
      {
        submit: async () => {
          calls++;
          throw new Error("hcs down");
        },
        sleep,
        onError: (e) => errors.push((e as Error).message),
      },
    );

    expect(ok).toBe(false);
    expect(calls).toBe(3);
    expect(errors).toEqual(["hcs down", "hcs down", "hcs down"]);
  });

  it("succeeds when a retry works", async () => {
    let calls = 0;
    const ok = await publishAudit(
      { type: "invoice.paid", invoiceId: "7", data: {} },
      {
        submit: async () => {
          if (++calls < 3) throw new Error("x");
        },
        sleep,
      },
    );
    expect(ok).toBe(true);
    expect(calls).toBe(3);
  });

  it("does not throw even for a forbidden payload: it reports false", async () => {
    const ok = await publishAudit({ type: "approval.started", invoiceId: "1", data: { subject: "x" } }, { submit: async () => {}, sleep });
    expect(ok).toBe(false);
  });
});

describe("readAuditEvents", () => {
  const msg = (type: string, invoiceId: string | null) => Buffer.from(JSON.stringify({ type, invoiceId, data: { n: 1 }, ts: NOW, payloadHash: "ab".repeat(32) })).toString("base64");

  it("maps mirror node messages to schema-valid AuditEvents, newest first, and skips foreign messages", async () => {
    const fetchImpl = (async (url: string) => {
      expect(String(url)).toContain("/api/v1/topics/0.0.5555/messages?order=desc&limit=50");
      return new Response(
        JSON.stringify({
          messages: [
            { consensus_timestamp: "1800000002.000000001", sequence_number: 3, message: msg("invoice.paid", "7"), topic_id: "0.0.5555" },
            { consensus_timestamp: "1800000001.000000001", sequence_number: 2, message: Buffer.from("not json").toString("base64"), topic_id: "0.0.5555" },
            { consensus_timestamp: "1800000000.000000001", sequence_number: 1, message: msg("x402.payment", null), topic_id: "0.0.5555" },
          ],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const events = await readAuditEvents("0.0.5555", { fetchImpl });
    expect(AuditListSchema.safeParse(events).success).toBe(true);
    expect(events.map((e) => [e.sequenceNumber, e.type, e.invoiceId])).toEqual([
      [3, "invoice.paid", "7"],
      [1, "x402.payment", null],
    ]);
  });

  it("throws when the mirror node errors", async () => {
    const fetchImpl = (async () => new Response("{}", { status: 500 })) as typeof fetch;
    await expect(readAuditEvents("0.0.5555", { fetchImpl })).rejects.toThrow(/mirror node/);
  });
});

describe("GET /api/audit", () => {
  it("answers 503 when no topic is configured", async () => {
    const app = buildApp({ dbPath: ":memory:", world: null, audit: { topicId: undefined } });
    expect((await app.inject({ method: "GET", url: "/api/audit" })).statusCode).toBe(503);
    await app.close();
  });

  it("returns the topic's events from the mirror node", async () => {
    const m = Buffer.from(JSON.stringify({ type: "invoice.paid", invoiceId: "7", data: {}, ts: NOW, payloadHash: "ab".repeat(32) })).toString("base64");
    const fetchImpl = (async () => new Response(JSON.stringify({ messages: [{ consensus_timestamp: "1800000000.000000001", sequence_number: 9, message: m, topic_id: "0.0.1234" }] }), { status: 200 })) as typeof fetch;
    const app = buildApp({ dbPath: ":memory:", world: null, audit: { topicId: "0.0.1234", fetchImpl } });
    const res = await app.inject({ method: "GET", url: "/api/audit" });

    expect(res.statusCode).toBe(200);
    expect(AuditListSchema.parse(res.json())[0]).toMatchObject({ topicId: "0.0.1234", sequenceNumber: 9, type: "invoice.paid", invoiceId: "7" });
    await app.close();
  });
});
