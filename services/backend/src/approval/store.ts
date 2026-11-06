import type { Approval } from "@agentinvoice/shared";
import type Database from "better-sqlite3";
import { transition, type ApprovalEvent, type ApprovalState } from "./machine.js";
import type { PendingStepUp } from "../world/callback.js";

// What a sponsor approves is bound server-side: one invoice, its buyer vault, a maximum amount, an expiry, and a single use.
// World proves a fresh human authentication; this module is what binds it to that action.

export type ApprovalUseErrorCode = "not_found" | "not_approved" | "expired" | "replay" | "wrong_invoice" | "oversize";

export class ApprovalUseError extends Error {
  constructor(
    readonly code: ApprovalUseErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApprovalUseError";
  }
}

interface Row {
  id: string;
  invoice_id: string;
  state: ApprovalState;
  created_at: number;
  decided_at: number | null;
  amount: string;
  expires_at: number;
  consumed_at: number | null;
  nonce: string | null;
  code_verifier: string | null;
  step_up_used_at: number | null;
}

export interface NewApproval {
  id: string;
  invoiceId: string;
  vault: string;
  amount: string;
  nonce: string;
  codeVerifier: string;
  now: number;
  ttlSeconds: number;
}

export function createApproval(db: Database.Database, a: NewApproval): void {
  db.prepare(
    `INSERT INTO approvals (id, invoice_id, state, created_at, vault, amount, action, nonce, code_verifier, expires_at)
     VALUES (?, ?, 'pending', ?, ?, ?, 'large-payment', ?, ?, ?)`,
  ).run(a.id, a.invoiceId, a.now, a.vault, a.amount, a.nonce, a.codeVerifier, a.now + a.ttlSeconds);
}

const load = (db: Database.Database, id: string) => db.prepare("SELECT * FROM approvals WHERE id = ?").get(id) as Row | undefined;

function persist(db: Database.Database, id: string, from: ApprovalState, event: ApprovalEvent, now: number, subjectHash?: string) {
  const next = transition(from, event);
  const decidedAt = event === "expire" ? null : now;
  const res = db
    .prepare(
      `UPDATE approvals SET state = ?, decided_at = COALESCE(?, decided_at), subject_hash = COALESCE(?, subject_hash)
       WHERE id = ? AND state = ?`,
    )
    .run(next, decidedAt, subjectHash ?? null, id, from);
  if (res.changes !== 1) throw new Error(`illegal approval transition: ${from} + ${event} (state changed concurrently)`);
}

// Approvals expire on read, so a stale pending/approved row is never served as valid.
function expireIfDue(db: Database.Database, row: Row, now: number): Row {
  if ((row.state === "pending" || row.state === "approved") && row.expires_at <= now) {
    persist(db, row.id, row.state, "expire", now);
    return { ...row, state: "expired" };
  }
  return row;
}

export function getApproval(db: Database.Database, id: string, now: number): Approval | undefined {
  const row = load(db, id);
  if (!row) return undefined;
  const r = expireIfDue(db, row, now);
  return { id: r.id, invoiceId: r.invoice_id, state: r.state, createdAt: r.created_at, decidedAt: r.decided_at };
}

export function decide(db: Database.Database, id: string, event: "approve" | "reject", opts: { now: number; subjectHash?: string }): void {
  const row = load(db, id);
  if (!row) throw new Error(`approval ${id} not found`);
  persist(db, id, row.state, event, opts.now, opts.subjectHash);
}

export function sweepExpired(db: Database.Database, now: number): string[] {
  const rows = db.prepare("SELECT * FROM approvals WHERE state IN ('pending','approved') AND expires_at <= ?").all(now) as Row[];
  for (const r of rows) persist(db, r.id, r.state, "expire", now);
  return rows.map((r) => r.id);
}

// Adapter for handleCallback: the step-up state lives on the approval row.
export function pendingForStepUp(db: Database.Database, id: string): PendingStepUp | undefined {
  const r = load(db, id);
  if (!r || r.nonce === null || r.code_verifier === null) return undefined;
  return { nonce: r.nonce, codeVerifier: r.code_verifier, expiresAt: r.expires_at, consumed: r.step_up_used_at !== null };
}

export function markStepUpUsed(db: Database.Database, id: string, now: number): void {
  db.prepare("UPDATE approvals SET step_up_used_at = ? WHERE id = ? AND step_up_used_at IS NULL").run(now, id);
}

// Spends an approved approval exactly once. Every failure is a distinct code and does not burn the approval.
export function consumeApproval(db: Database.Database, id: string, use: { invoiceId: string; amount: string }, now: number): void {
  const found = load(db, id);
  if (!found) throw new ApprovalUseError("not_found", "no such approval");
  const row = expireIfDue(db, found, now);
  if (row.state === "expired") throw new ApprovalUseError("expired", "the approval has expired");
  if (row.state !== "approved") throw new ApprovalUseError("not_approved", `the approval is ${row.state}`);
  if (row.consumed_at !== null) throw new ApprovalUseError("replay", "the approval was already used");
  if (row.invoice_id !== use.invoiceId) throw new ApprovalUseError("wrong_invoice", "the approval is for another invoice");
  if (BigInt(use.amount) > BigInt(row.amount)) throw new ApprovalUseError("oversize", "the amount exceeds the approved amount");

  const res = db.prepare("UPDATE approvals SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL AND state = 'approved'").run(now, id);
  if (res.changes !== 1) throw new ApprovalUseError("replay", "the approval was already used");
}
