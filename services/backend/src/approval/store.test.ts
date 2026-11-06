import type Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { consumeApproval, createApproval, decide, getApproval, pendingForStepUp, sweepExpired, ApprovalUseError } from "./store.js";

const NOW = 1_800_000_000;
const TTL = 600;
let db: Database.Database;

beforeEach(() => {
  db = buildApp({ dbPath: ":memory:" }).db;
});

const make = (over: Partial<Parameters<typeof createApproval>[1]> = {}) =>
  createApproval(db, { id: "ap-1", invoiceId: "7", vault: "0xvault", amount: "500", nonce: "n1", codeVerifier: "v1", now: NOW, ttlSeconds: TTL, ...over });

const codeOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (err) {
    if (err instanceof ApprovalUseError) return err.code;
    throw err;
  }
  return "no_error";
};

describe("approval store", () => {
  it("creates a pending approval in the shared Approval shape", () => {
    make();
    expect(getApproval(db, "ap-1", NOW)).toEqual({ id: "ap-1", invoiceId: "7", state: "pending", createdAt: NOW, decidedAt: null });
    expect(pendingForStepUp(db, "ap-1")).toEqual({ nonce: "n1", codeVerifier: "v1", expiresAt: NOW + TTL, consumed: false });
    expect(getApproval(db, "nope", NOW)).toBeUndefined();
  });

  it("expires lazily when read after the deadline", () => {
    make();
    expect(getApproval(db, "ap-1", NOW + TTL)?.state).toBe("expired");
  });

  it("approve and reject are one-way", () => {
    make();
    decide(db, "ap-1", "approve", { now: NOW + 5, subjectHash: "h" });
    expect(getApproval(db, "ap-1", NOW + 5)).toMatchObject({ state: "approved", decidedAt: NOW + 5 });
    expect(() => decide(db, "ap-1", "reject", { now: NOW + 6 })).toThrow(/illegal approval transition/);

    make({ id: "ap-2" });
    decide(db, "ap-2", "reject", { now: NOW + 5 });
    expect(() => decide(db, "ap-2", "approve", { now: NOW + 6 })).toThrow(/illegal approval transition/);
  });

  it("sweeps pending and approved approvals past their deadline, and only those", () => {
    make({ id: "a" });
    make({ id: "b" });
    make({ id: "c", now: NOW + 1000 });
    decide(db, "b", "approve", { now: NOW + 1 });

    expect(sweepExpired(db, NOW + TTL)).toBe(2);
    expect(getApproval(db, "a", NOW + TTL)?.state).toBe("expired");
    expect(getApproval(db, "b", NOW + TTL)?.state).toBe("expired");
    expect(getApproval(db, "c", NOW + TTL)?.state).toBe("pending");
  });
});

describe("consumeApproval", () => {
  const approved = () => {
    make();
    decide(db, "ap-1", "approve", { now: NOW + 1, subjectHash: "h" });
  };

  it("works once for the right invoice and an amount within the approval", () => {
    approved();
    consumeApproval(db, "ap-1", { invoiceId: "7", amount: "500" }, NOW + 10);
    expect(codeOf(() => consumeApproval(db, "ap-1", { invoiceId: "7", amount: "500" }, NOW + 11))).toBe("replay");
  });

  it("rejects every wrong use with a distinct code", () => {
    approved();
    expect(codeOf(() => consumeApproval(db, "missing", { invoiceId: "7", amount: "1" }, NOW + 2))).toBe("not_found");
    expect(codeOf(() => consumeApproval(db, "ap-1", { invoiceId: "8", amount: "1" }, NOW + 2))).toBe("wrong_invoice");
    expect(codeOf(() => consumeApproval(db, "ap-1", { invoiceId: "7", amount: "501" }, NOW + 2))).toBe("oversize");
    // a failed attempt must not burn the approval
    consumeApproval(db, "ap-1", { invoiceId: "7", amount: "500" }, NOW + 3);
    // after the deadline it is unusable (checked last: reading it past the deadline expires it for good)
    make({ id: "ap-late" });
    decide(db, "ap-late", "approve", { now: NOW + 1 });
    expect(codeOf(() => consumeApproval(db, "ap-late", { invoiceId: "7", amount: "1" }, NOW + TTL + 1))).toBe("expired");
  });

  it("refuses pending and rejected approvals", () => {
    make();
    expect(codeOf(() => consumeApproval(db, "ap-1", { invoiceId: "7", amount: "1" }, NOW + 2))).toBe("not_approved");
    decide(db, "ap-1", "reject", { now: NOW + 3 });
    expect(codeOf(() => consumeApproval(db, "ap-1", { invoiceId: "7", amount: "1" }, NOW + 4))).toBe("not_approved");
  });
});
