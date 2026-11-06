import { describe, expect, it } from "vitest";
import { APPROVAL_STATES, transition, type ApprovalEvent, type ApprovalState } from "./machine.js";

const EVENTS: ApprovalEvent[] = ["approve", "reject", "expire"];

// Every legal transition. Anything not listed here must be refused.
const LEGAL: Record<string, ApprovalState> = {
  "pending:approve": "approved",
  "pending:reject": "rejected",
  "pending:expire": "expired",
  "approved:expire": "expired",
};

describe("approval machine", () => {
  for (const state of APPROVAL_STATES) {
    for (const event of EVENTS) {
      const expected = LEGAL[`${state}:${event}`];
      it(`${state} + ${event} -> ${expected ?? "refused"}`, () => {
        if (expected) expect(transition(state, event)).toBe(expected);
        else expect(() => transition(state, event)).toThrow(/illegal approval transition/);
      });
    }
  }

  it("never lets a rejected or expired approval become approved again", () => {
    expect(() => transition("rejected", "approve")).toThrow();
    expect(() => transition("expired", "approve")).toThrow();
  });
});
