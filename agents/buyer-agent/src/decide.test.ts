import { describe, expect, it } from "vitest";
import type { Invoice } from "@agentinvoice/shared";
import { decide, decisionLine, type DecideInput } from "./decide.js";

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "7",
    supplier: "0x1111111111111111111111111111111111111111",
    buyerVault: "0x2222222222222222222222222222222222222222",
    faceAmount: "100",
    price: "90",
    dueDate: 2_000,
    status: "Pending",
    bond: null,
    holder: null,
    evidenceHash: `0x${"ab".repeat(32)}`,
    description: "test",
    ...overrides,
  };
}

function input(overrides: Partial<DecideInput> = {}): DecideInput {
  return {
    invoice: invoice(),
    supplierAllowed: true,
    supplierLimit: 100n,
    approvalThreshold: 100n,
    dailyLimit: 1_000n,
    spentToday: 0n,
    balance: 1_000n,
    now: 1_000,
    sponsorApprovalAvailable: false,
    ...overrides,
  };
}

describe("buyer decide", () => {
  it("accepts an allowed supplier within the limit", () => {
    const decision = decide(input());
    expect(decision).toEqual({ action: "accept", reason: "allowed supplier and face amount within limit" });
    expect(decisionLine("7", decision)).toBe(
      'invoice=7 action=accept reason="allowed supplier and face amount within limit"',
    );
  });

  it("skips a supplier who is not allowed", () => {
    expect(decide(input({ supplierAllowed: false })).reason).toBe("supplier is not allowed");
  });

  it("skips an invoice above the supplier limit", () => {
    expect(decide(input({ invoice: invoice({ faceAmount: "101" }) })).reason).toBe(
      "face amount exceeds supplier limit",
    );
  });

  it("pays a funded invoice that is due and below the threshold", () => {
    const decision = decide(
      input({ invoice: invoice({ status: "Funded", faceAmount: "100" }), now: 2_000 }),
    );
    expect(decision.action).toBe("pay");
    expect(decision.reason).toBe("due and below approval threshold");
  });

  it("pays when the face amount uses the last of the daily limit and the balance", () => {
    const decision = decide(
      input({
        invoice: invoice({ status: "Funded", faceAmount: "100" }),
        now: 2_000,
        dailyLimit: 100n,
        spentToday: 0n,
        balance: 100n,
      }),
    );
    expect(decision.action).toBe("pay");
  });

  it("skips a due payment the vault balance cannot cover", () => {
    const decision = decide(
      input({ invoice: invoice({ status: "Funded", faceAmount: "100" }), now: 2_000, balance: 99n }),
    );
    expect(decision).toEqual({ action: "skip", reason: "vault balance is too low" });
  });

  it("skips a due payment that would pass the daily limit even with sponsor approval", () => {
    const decision = decide(
      input({
        invoice: invoice({ status: "Funded", faceAmount: "100" }),
        now: 2_000,
        dailyLimit: 100n,
        spentToday: 1n,
        sponsorApprovalAvailable: true,
      }),
    );
    expect(decision).toEqual({ action: "skip", reason: "daily limit would be exceeded" });
  });

  it("skips a due payment above the threshold when sponsor approval is unavailable", () => {
    const decision = decide(
      input({ invoice: invoice({ status: "Funded", faceAmount: "101" }), now: 2_000 }),
    );
    expect(decision).toEqual({ action: "skip", reason: "needs sponsor approval" });
  });
});
