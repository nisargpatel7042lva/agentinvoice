import type { Invoice } from "@agentinvoice/shared";

export type BuyerDecision =
  | { action: "accept"; reason: string }
  | { action: "pay"; reason: string }
  | { action: "skip"; reason: string };

export interface DecideInput {
  invoice: Invoice;
  supplierAllowed: boolean;
  supplierLimit: bigint;
  approvalThreshold: bigint;
  dailyLimit: bigint;
  spentToday: bigint;
  balance: bigint;
  now: number;
  sponsorApprovalAvailable: boolean;
}

/** Pure: same inputs, same answer. Amounts are the invoice face amount in tinybar. */
export function decide(input: DecideInput): BuyerDecision {
  const { invoice, now } = input;
  const face = BigInt(invoice.faceAmount);

  if (invoice.status === "Pending") {
    if (!input.supplierAllowed) return { action: "skip", reason: "supplier is not allowed" };
    if (face > input.supplierLimit) return { action: "skip", reason: "face amount exceeds supplier limit" };
    if (invoice.dueDate <= now) return { action: "skip", reason: "due date has passed" };
    return { action: "accept", reason: "allowed supplier and face amount within limit" };
  }

  if (invoice.status === "Funded") {
    if (now < invoice.dueDate) return { action: "skip", reason: "not due yet" };
    if (input.balance < face) return { action: "skip", reason: "vault balance is too low" };
    if (input.spentToday + face > input.dailyLimit) return { action: "skip", reason: "daily limit would be exceeded" };
    if (face > input.approvalThreshold && !input.sponsorApprovalAvailable) {
      return { action: "skip", reason: "needs sponsor approval" };
    }
    return {
      action: "pay",
      reason: face > input.approvalThreshold ? "due and sponsor approval is available" : "due and below approval threshold",
    };
  }

  return { action: "skip", reason: `status ${invoice.status}` };
}

export function decisionLine(invoiceId: string, decision: BuyerDecision): string {
  return `invoice=${invoiceId} action=${decision.action} reason="${decision.reason}"`;
}
