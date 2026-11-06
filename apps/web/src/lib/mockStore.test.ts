import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { mockStore, MockError } = await import("./mockStore");

const INVESTOR = "0x9a3f00000000000000000000000000000000041c" as const;
const SUPPLIER = "0x1111111111111111111111111111111111111111" as const;
const body = (face: string) => ({
  buyerVault: "0x2222222222222222222222222222222222222222" as const,
  faceAmount: face,
  price: "950000000",
  dueDate: 1_900_000_000,
  description: "test",
  evidenceHash: `0x${"ab".repeat(32)}` as const,
});

beforeEach(() => mockStore.reset());

describe("demo store lifecycle", () => {
  it("create → accept → fund → pay, logging each step newest first", async () => {
    const inv = mockStore.createInvoice(body("1000000000"), SUPPLIER);
    expect(inv.status).toBe("Pending");
    mockStore.accept(inv.id);
    mockStore.fund(inv.id, INVESTOR);
    expect((await mockStore.getInvoice(inv.id)).holder).toBe(INVESTOR);
    const r = mockStore.pay(inv.id);
    expect(r.approvalId).toBeUndefined();
    expect(r.invoice.status).toBe("Paid");
    const types = (await mockStore.listAudit()).filter((e) => e.invoiceId === inv.id).map((e) => e.type);
    expect(types).toEqual(["invoice.paid", "invoice.funded", "invoice.accepted", "invoice.created"]);
  });

  it("blocks steps out of order with a readable message", () => {
    const inv = mockStore.createInvoice(body("1000000000"), SUPPLIER);
    expect(() => mockStore.fund(inv.id, INVESTOR)).toThrow(MockError);
    expect(() => mockStore.fund(inv.id, INVESTOR)).toThrow(/Pending; this needs Open/);
  });

  it("above the threshold, paying needs the sponsor's approval first", () => {
    const inv = mockStore.createInvoice(body("1200000000"), SUPPLIER); // 12 HBAR > 10 HBAR threshold
    mockStore.accept(inv.id);
    mockStore.fund(inv.id, INVESTOR);
    const first = mockStore.pay(inv.id);
    expect(first.approvalId).toBeDefined();
    expect(first.invoice.status).toBe("Funded");
    expect(mockStore.pay(inv.id).approvalId).toBe(first.approvalId); // no duplicate requests
    mockStore.decideApproval(first.approvalId!, true);
    expect(mockStore.pay(inv.id).invoice.status).toBe("Paid");
    expect(() => mockStore.decideApproval(first.approvalId!, false)).toThrow(/already approved/);
  });

  it("late then defaulted, and reset restores the fixtures", async () => {
    mockStore.markLate("3");
    mockStore.markDefaulted("3");
    expect((await mockStore.getInvoice("3")).status).toBe("Defaulted");
    mockStore.reset();
    expect((await mockStore.getInvoice("3")).status).toBe("Funded");
  });
});
