// Approval states come from the frozen spec v2 (packages/shared/src/types.ts ApprovalState).
export const APPROVAL_STATES = ["pending", "approved", "rejected", "expired"] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];
export type ApprovalEvent = "approve" | "reject" | "expire";

const TRANSITIONS: Record<ApprovalState, Partial<Record<ApprovalEvent, ApprovalState>>> = {
  pending: { approve: "approved", reject: "rejected", expire: "expired" },
  approved: { expire: "expired" }, // an unused approval lapses; it can never be rejected or re-approved
  rejected: {},
  expired: {},
};

// Pure: returns the next state or throws. A rejected or expired approval is terminal and never becomes valid again.
export function transition(state: ApprovalState, event: ApprovalEvent): ApprovalState {
  const next = TRANSITIONS[state][event];
  if (!next) throw new Error(`illegal approval transition: ${state} + ${event}`);
  return next;
}
