import { describe, expect, it } from "vitest";
import type { Invoice } from "@invoiceagent/shared";
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

  it("skips a due payment above the threshold when sponsor approval is unavailable", () => {
    const decision = decide(
      input({ invoice: invoice({ status: "Funded", faceAmount: "101" }), now: 2_000 }),
    );
    expect(decision).toEqual({ action: "skip", reason: "needs sponsor approval" });
  });
});
