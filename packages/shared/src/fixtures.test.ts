import { describe, expect, it } from "vitest";
import {
  ApprovalSchema,
  ApprovalStartSchema,
  AuditListSchema,
  EnsAgentSchema,
  InvoiceListSchema,
  PayPolicySchema,
  ReviewResultSchema,
  SPEC_VERSION,
  STATUSES,
  approvalFixture,
  approvalStartFixture,
  auditFixtures,
  ensAgentFixture,
  invoiceFixtures,
  payPolicyFixture,
  reviewFixture,
} from "./index.js";

describe("spec v2 fixtures", () => {
  it("is spec version 2", () => {
    expect(SPEC_VERSION).toBe(2);
  });

  it("has one valid invoice per status, Pending first", () => {
    InvoiceListSchema.parse(invoiceFixtures);
    expect(invoiceFixtures.map((i) => i.status)).toEqual([...STATUSES]);
    expect(STATUSES[0]).toBe("Pending");
  });

  it("returns audit events newest first", () => {
    AuditListSchema.parse(auditFixtures);
    const seq = auditFixtures.map((e) => e.sequenceNumber);
    expect(seq).toEqual([...seq].sort((a, b) => b - a));
  });

  it("validates the other fixtures", () => {
    ApprovalStartSchema.parse(approvalStartFixture);
    ApprovalSchema.parse(approvalFixture);
    EnsAgentSchema.parse(ensAgentFixture);
    ReviewResultSchema.parse(reviewFixture);
    PayPolicySchema.parse(payPolicyFixture);
  });
});
