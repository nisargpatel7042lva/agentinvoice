import type { AuditEvent, Status } from "@agentinvoice/shared";
import { createHash } from "node:crypto";

// Every important event goes to a Hedera Consensus Service topic so anyone can audit what the agents did.
// Messages carry ids and counts only: no personal data, no subjects, no tokens or keys.

export const AUDIT_TYPES = [
  "invoice.created",
  "invoice.accepted",
  "invoice.funded",
  "invoice.paid",
  "invoice.late",
  "invoice.defaulted",
  "approval.started",
  "approval.approved",
  "approval.rejected", // the spec calls a refused approval "rejected" (the older plan said "denied")
  "approval.expired",
  "x402.payment",
  "agent.decision",
] as const;
export type AuditType = (typeof AUDIT_TYPES)[number];

export interface AuditInput {
  type: AuditType;
  invoiceId: string | null;
  data: Record<string, unknown>;
}

export interface AuditMessage extends AuditInput {
  ts: number; // unix seconds
  payloadHash: string; // sha256 of the canonical JSON of { type, invoiceId, data, ts }
}

const STATUS_EVENT: Record<Status, AuditType> = {
  Pending: "invoice.created",
  Open: "invoice.accepted",
  Funded: "invoice.funded",
  Paid: "invoice.paid",
  Late: "invoice.late",
  Defaulted: "invoice.defaulted",
};
export const auditEventForStatus = (status: Status): AuditType => STATUS_EVENT[status];

const FORBIDDEN_KEY = /(email|subject|token|secret|private|password|mnemonic|seed)/i;

function assertNoForbidden(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(assertNoForbidden);
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(k)) throw new Error(`forbidden audit field: ${k}`);
      assertNoForbidden(v);
    }
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export const hashPayload = (p: { type: string; invoiceId: string | null; data: Record<string, unknown>; ts: number }): string =>
  createHash("sha256").update(canonical(p)).digest("hex");

export function buildMessage(input: AuditInput, ts: number): AuditMessage {
  assertNoForbidden(input.data);
  const body = { type: input.type, invoiceId: input.invoiceId, data: input.data, ts };
  return { ...body, payloadHash: hashPayload(body) };
}

export interface PublishDeps {
  submit(message: string): Promise<void>;
  retries?: number; // default 3
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onError?: (err: unknown) => void;
}

// Fire-and-forget safe: returns false instead of throwing, so an HCS outage never blocks the main action.
export async function publishAudit(input: AuditInput, deps: PublishDeps): Promise<boolean> {
  const retries = deps.retries ?? 3;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let message: string;
  try {
    message = JSON.stringify(buildMessage(input, (deps.now ?? (() => Math.floor(Date.now() / 1000)))()));
  } catch (err) {
    deps.onError?.(err);
    return false;
  }
  for (let n = 1; n <= retries; n++) {
    try {
      await deps.submit(message);
      return true;
    } catch (err) {
      deps.onError?.(err);
      if (n < retries) await sleep(300 * n);
    }
  }
  return false;
}

export const MIRROR_URL = "https://testnet.mirrornode.hedera.com";

// Reads the topic back through the mirror node (path verified against the live API on 2026-11-06), newest first.
// Messages that are not ours (not JSON, no type) are skipped.
export async function readAuditEvents(
  topicId: string,
  opts: { fetchImpl?: typeof fetch; mirrorUrl?: string; limit?: number } = {},
): Promise<AuditEvent[]> {
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `${opts.mirrorUrl ?? MIRROR_URL}/api/v1/topics/${topicId}/messages?order=desc&limit=${opts.limit ?? 50}`;
  const res = await doFetch(url);
  if (!res.ok) throw new Error(`mirror node returned ${res.status}`);
  const body = (await res.json()) as { messages?: { consensus_timestamp: string; sequence_number: number; message: string; topic_id: string }[] };

  const events: AuditEvent[] = [];
  for (const m of body.messages ?? []) {
    try {
      const parsed = JSON.parse(Buffer.from(m.message, "base64").toString("utf8")) as Partial<AuditMessage>;
      if (typeof parsed.type !== "string") continue;
      events.push({
        topicId: m.topic_id,
        sequenceNumber: m.sequence_number,
        consensusTimestamp: m.consensus_timestamp,
        type: parsed.type,
        invoiceId: typeof parsed.invoiceId === "string" ? parsed.invoiceId : null,
        data: parsed.data && typeof parsed.data === "object" ? parsed.data : {},
      });
    } catch {
      // not an AgentInvoice message
    }
  }
  return events;
}

// Real submit through the Hedera SDK. UNVERIFIED until a funded testnet account is configured (HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY).
export async function hederaSubmit(cfg: { accountId: string; privateKey: string; topicId: string }): Promise<(message: string) => Promise<void>> {
  const { Client, PrivateKey, TopicMessageSubmitTransaction } = await import("@hashgraph/sdk");
  const client = Client.forTestnet();
  const key = (() => {
    try {
      return PrivateKey.fromStringECDSA(cfg.privateKey.replace(/^0x/, ""));
    } catch {
      return PrivateKey.fromString(cfg.privateKey);
    }
  })();
  client.setOperator(cfg.accountId, key);
  return async (message) => {
    const tx = await new TopicMessageSubmitTransaction().setTopicId(cfg.topicId).setMessage(message).execute(client);
    await tx.getReceipt(client);
  };
}
