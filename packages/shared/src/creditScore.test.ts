import { describe, expect, it } from "vitest";
import { computeCreditReport } from "./creditScore";
import { invoiceFixtures } from "./fixtures";
import type { Address, Invoice } from "./types";

const VAULT = "0x2222222222222222222222222222222222222222" as Address;
const SUPPLIER = "0x1111111111111111111111111111111111111111" as Address;

const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: overrides.id ?? Math.random().toString(36).substring(2, 9),
  supplier: SUPPLIER,
  buyerVault: VAULT,
  faceAmount: "1000000000",
  price: "950000000",
  dueDate: 1_794_000_000,
  status: "Paid",
  bond: null,
  holder: null,
  evidenceHash: "0x0000000000000000000000000000000000000000000000000000000000000001",
  description: "Test invoice",
  ...overrides,
});

describe("creditScore", () => {
  it("enforces the New rule for 0, 1, 2 settled invoices and computes numeric for 3", () => {
    const now = 1_794_200_000;
    // 0 settled
    const rep0 = computeCreditReport({ vault: VAULT, invoices: [], now });
    expect(rep0.score).toBeNull();
    expect(rep0.band).toBe("New");
    expect(rep0.summary).toBe("Not enough history yet (0 settled invoices; 3 needed)");

    // 1 settled
    const rep1 = computeCreditReport({
      vault: VAULT,
      invoices: [makeInvoice({ id: "inv-1", status: "Paid" })],
      now,
    });
    expect(rep1.score).toBeNull();
    expect(rep1.band).toBe("New");
    expect(rep1.summary).toBe("Not enough history yet (1 settled invoices; 3 needed)");

    // 2 settled
    const rep2 = computeCreditReport({
      vault: VAULT,
      invoices: [makeInvoice({ id: "inv-1", status: "Paid" }), makeInvoice({ id: "inv-2", status: "Paid" })],
      now,
    });
    expect(rep2.score).toBeNull();
    expect(rep2.band).toBe("New");
    expect(rep2.summary).toBe("Not enough history yet (2 settled invoices; 3 needed)");

    // 3 settled -> numeric score
    const rep3 = computeCreditReport({
      vault: VAULT,
      invoices: [
        makeInvoice({ id: "inv-1", status: "Paid" }),
        makeInvoice({ id: "inv-2", status: "Paid" }),
        makeInvoice({ id: "inv-3", status: "Paid" }),
      ],
      now,
    });
    expect(typeof rep3.score).toBe("number");
    expect(rep3.score).toBeGreaterThanOrEqual(300);
    expect(rep3.score).toBeLessThanOrEqual(900);
    expect(["A", "B", "C"]).toContain(rep3.band);
  });

  it("yields 900 and Band A for a perfect record (20 on time, no exposure, 200 days history)", () => {
    const now = 1_794_000_000 + 200 * 86_400;
    const invoices: Invoice[] = Array.from({ length: 20 }, (_, i) =>
      makeInvoice({
        id: `inv-${i + 1}`,
        status: "Paid",
        dueDate: 1_794_000_000 + i * 86_400,
      })
    );
    const report = computeCreditReport({
      vault: VAULT,
      invoices,
      dailyLimit: 10_000_000_000n,
      now,
    });
    expect(report.score).toBe(900);
    expect(report.band).toBe("A");
    for (const factor of report.factors) {
      expect(factor.value).toBe(1);
    }
  });

  describe("factors in isolation", () => {
    it("counts paidLate as half value in Factor P", () => {
      const now = 1_794_000_000 + 200 * 86_400;
      // 20 settled: 10 onTime, 10 paidLate
      const invoices: Invoice[] = Array.from({ length: 20 }, (_, i) =>
        makeInvoice({
          id: `inv-${i + 1}`,
          status: "Paid",
          dueDate: 1_794_000_000,
        })
      );
      const everLateIds = new Set(Array.from({ length: 10 }, (_, i) => `inv-${i + 1}`));
      const report = computeCreditReport({
        vault: VAULT,
        invoices,
        everLateIds,
        now,
      });
      const paymentFactor = report.factors.find((f) => f.key === "payment")!;
      // (10 + 0.5 * 10) / 20 = 15 / 20 = 0.75
      expect(paymentFactor.value).toBe(0.75);
    });

    it("penalizes recent defaults (0.50) more than old defaults (0.25) in Factor D", () => {
      const now = 1_794_000_000 + 100 * 86_400;
      // Recent default: dueDate 20 days ago (<= 90 days)
      const recentInv = makeInvoice({ id: "def-rec", status: "Defaulted", dueDate: now - 20 * 86_400 });
      // Old default: dueDate 100 days ago (> 90 days)
      const oldInv = makeInvoice({ id: "def-old", status: "Defaulted", dueDate: now - 100 * 86_400 });

      const baseInvoices = [
        makeInvoice({ id: "paid-1", status: "Paid" }),
        makeInvoice({ id: "paid-2", status: "Paid" }),
      ];

      const reportRecent = computeCreditReport({
        vault: VAULT,
        invoices: [...baseInvoices, recentInv],
        now,
      });
      const dRecent = reportRecent.factors.find((f) => f.key === "defaults")!;
      expect(dRecent.value).toBe(0.5); // 1 - 0.5 = 0.5

      const reportOld = computeCreditReport({
        vault: VAULT,
        invoices: [...baseInvoices, oldInv],
        now,
      });
      const dOld = reportOld.factors.find((f) => f.key === "defaults")!;
      expect(dOld.value).toBe(0.75); // 1 - 0.25 = 0.75
    });

    it("never lets Factor D drop below 0", () => {
      const now = 1_794_000_000 + 100 * 86_400;
      // 3 recent defaults -> penalty = 1.5 -> D = max(0, 1 - 1.5) = 0
      const defaults = [
        makeInvoice({ id: "def-1", status: "Defaulted", dueDate: now - 10 * 86_400 }),
        makeInvoice({ id: "def-2", status: "Defaulted", dueDate: now - 20 * 86_400 }),
        makeInvoice({ id: "def-3", status: "Defaulted", dueDate: now - 30 * 86_400 }),
      ];
      const report = computeCreditReport({
        vault: VAULT,
        invoices: defaults,
        now,
      });
      const dFactor = report.factors.find((f) => f.key === "defaults")!;
      expect(dFactor.value).toBe(0);
    });

    it("evaluates Factor U boundaries at u = 0.3, 0.65, and 1.0", () => {
      const dailyLimit = 1_000_000_000n; // 10 HBAR
      const now = 1_794_000_000;

      // u = 0.3 -> faceAmount = 300_000_000 -> U = 1
      const rep30 = computeCreditReport({
        vault: VAULT,
        invoices: [makeInvoice({ id: "f-30", status: "Funded", faceAmount: "300000000" })],
        dailyLimit,
        now,
      });
      expect(rep30.factors.find((f) => f.key === "exposure")!.value).toBe(1);

      // u = 0.65 -> faceAmount = 650_000_000 -> U = 0.5
      const rep65 = computeCreditReport({
        vault: VAULT,
        invoices: [makeInvoice({ id: "f-65", status: "Funded", faceAmount: "650000000" })],
        dailyLimit,
        now,
      });
      expect(rep65.factors.find((f) => f.key === "exposure")!.value).toBe(0.5);

      // u = 1.0 -> faceAmount = 1_000_000_000 -> U = 0
      const rep100 = computeCreditReport({
        vault: VAULT,
        invoices: [makeInvoice({ id: "f-100", status: "Funded", faceAmount: "1000000000" })],
        dailyLimit,
        now,
      });
      expect(rep100.factors.find((f) => f.key === "exposure")!.value).toBe(0);
    });

    it("evaluates Factor H at 0, 90, 180, and 365 days", () => {
      const now = 1_794_000_000;

      // 0 days
      const rep0 = computeCreditReport({
        vault: VAULT,
        invoices: [makeInvoice({ dueDate: now })],
        now,
      });
      expect(rep0.factors.find((f) => f.key === "history")!.value).toBe(0);

      // 90 days
      const rep90 = computeCreditReport({
        vault: VAULT,
        invoices: [makeInvoice({ dueDate: now - 90 * 86_400 })],
        now,
      });
      expect(rep90.factors.find((f) => f.key === "history")!.value).toBe(0.5);

      // 180 days
      const rep180 = computeCreditReport({
        vault: VAULT,
        invoices: [makeInvoice({ dueDate: now - 180 * 86_400 })],
        now,
      });
      expect(rep180.factors.find((f) => f.key === "history")!.value).toBe(1);

      // 365 days -> clamped to 1
      const rep365 = computeCreditReport({
        vault: VAULT,
        invoices: [makeInvoice({ dueDate: now - 365 * 86_400 })],
        now,
      });
      expect(rep365.factors.find((f) => f.key === "history")!.value).toBe(1);
    });

    it("evaluates Factor V at 0, 10, 20, and 40 settled invoices", () => {
      const now = 1_794_000_000;

      // 0 settled
      const rep0 = computeCreditReport({ vault: VAULT, invoices: [], now });
      expect(rep0.factors.find((f) => f.key === "volume")!.value).toBe(0);

      // 10 settled
      const invs10 = Array.from({ length: 10 }, (_, i) => makeInvoice({ id: `i-${i}`, status: "Paid" }));
      const rep10 = computeCreditReport({ vault: VAULT, invoices: invs10, now });
      expect(rep10.factors.find((f) => f.key === "volume")!.value).toBe(0.5);

      // 20 settled
      const invs20 = Array.from({ length: 20 }, (_, i) => makeInvoice({ id: `i-${i}`, status: "Paid" }));
      const rep20 = computeCreditReport({ vault: VAULT, invoices: invs20, now });
      expect(rep20.factors.find((f) => f.key === "volume")!.value).toBe(1);

      // 40 settled -> clamped to 1
      const invs40 = Array.from({ length: 40 }, (_, i) => makeInvoice({ id: `i-${i}`, status: "Paid" }));
      const rep40 = computeCreditReport({ vault: VAULT, invoices: invs40, now });
      expect(rep40.factors.find((f) => f.key === "volume")!.value).toBe(1);
    });

    it("handles unknown dailyLimit (0 exposure -> 1, positive exposure -> 0.5)", () => {
      const now = 1_794_000_000;
      // 0 exposure
      const repZero = computeCreditReport({
        vault: VAULT,
        invoices: [makeInvoice({ status: "Paid" })],
        now,
      });
      expect(repZero.factors.find((f) => f.key === "exposure")!.value).toBe(1);

      // positive exposure
      const repExp = computeCreditReport({
        vault: VAULT,
        invoices: [makeInvoice({ status: "Funded", faceAmount: "500000000" })],
        now,
      });
      expect(repExp.factors.find((f) => f.key === "exposure")!.value).toBe(0.5);
    });
  });

  describe("band boundaries", () => {
    // Score bands: >=750 "A", 650-749 "B", <650 "C"
    it("maps score ranges to correct bands at boundaries", () => {
      const now = 1_794_000_000 + 200 * 86_400;

      // Check a report with high score -> Band A
      const highInvoices = Array.from({ length: 20 }, (_, i) =>
        makeInvoice({ id: `h-${i}`, status: "Paid", dueDate: 1_794_000_000 })
      );
      const repA = computeCreditReport({ vault: VAULT, invoices: highInvoices, now });
      expect(repA.score).toBeGreaterThanOrEqual(750);
      expect(repA.band).toBe("A");

      // Check a report with poor payment/defaults -> Band C
      const lowInvoices = [
        makeInvoice({ id: "l-1", status: "Defaulted", dueDate: now - 10 * 86_400 }),
        makeInvoice({ id: "l-2", status: "Defaulted", dueDate: now - 20 * 86_400 }),
        makeInvoice({ id: "l-3", status: "Paid", dueDate: now - 30 * 86_400 }),
      ];
      const repC = computeCreditReport({ vault: VAULT, invoices: lowInvoices, now });
      expect(repC.score).toBeLessThan(650);
      expect(repC.band).toBe("C");
    });
  });

  describe("determinism and case-insensitivity", () => {
    it("is strictly deterministic", () => {
      const now = 1_794_000_000;
      const invoices = [
        makeInvoice({ id: "inv-1", status: "Paid" }),
        makeInvoice({ id: "inv-2", status: "Late" }),
        makeInvoice({ id: "inv-3", status: "Paid" }),
      ];
      const r1 = computeCreditReport({ vault: VAULT, invoices, now });
      const r2 = computeCreditReport({ vault: VAULT, invoices, now });
      expect(r1).toEqual(r2);
    });

    it("matches vault case-insensitively", () => {
      const now = 1_794_000_000;
      const lower = VAULT.toLowerCase() as Address;
      const upper = VAULT.toUpperCase() as Address;
      const invoices = [
        makeInvoice({ id: "inv-1", buyerVault: lower, status: "Paid" }),
        makeInvoice({ id: "inv-2", buyerVault: upper, status: "Paid" }),
        makeInvoice({ id: "inv-3", buyerVault: lower, status: "Paid" }),
      ];
      const rLower = computeCreditReport({ vault: lower, invoices, now });
      const rUpper = computeCreditReport({ vault: upper, invoices, now });
      expect(rLower.counts.settled).toBe(3);
      expect(rUpper.counts.settled).toBe(3);
      expect(rLower.score).toBe(rUpper.score);
    });

    it("populates factor evidence with real invoice ids", () => {
      const now = 1_794_000_000;
      const invoices = [
        makeInvoice({ id: "real-1", status: "Paid", dueDate: now - 100 * 86_400 }),
        makeInvoice({ id: "real-2", status: "Late", faceAmount: "100" }),
        makeInvoice({ id: "real-3", status: "Defaulted", dueDate: now - 10 * 86_400 }),
      ];
      const rep = computeCreditReport({ vault: VAULT, invoices, now });
      const pFactor = rep.factors.find((f) => f.key === "payment")!;
      expect(pFactor.evidence).toContain("real-1");
      expect(pFactor.evidence).toContain("real-2");
      expect(pFactor.evidence).toContain("real-3");

      const dFactor = rep.factors.find((f) => f.key === "defaults")!;
      expect(dFactor.evidence).toEqual(["real-3"]);

      const uFactor = rep.factors.find((f) => f.key === "exposure")!;
      expect(uFactor.evidence).toEqual(["real-2"]);

      const hFactor = rep.factors.find((f) => f.key === "history")!;
      expect(hFactor.evidence).toEqual(["real-1"]);
    });
  });

  describe("shared fixtures", () => {
    it("computes credit report for standard invoiceFixtures", () => {
      const rep = computeCreditReport({
        vault: VAULT,
        invoices: invoiceFixtures,
        now: 1_794_500_000,
      });
      // invoiceFixtures has 1 Paid, 1 Late, 1 Defaulted -> 3 settled
      expect(rep.counts.settled).toBe(3);
      expect(typeof rep.score).toBe("number");
      expect(rep.factors.length).toBe(5);
    });
  });
});
