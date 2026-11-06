import { describe, expect, it } from "vitest";
import { invoiceFixtures } from "@agentinvoice/shared";
import { faceByStatus, marketStats, repaymentsByWeek } from "./stats";

describe("marketStats", () => {
  it("derives every figure from the invoices, nothing invented", () => {
    const s = marketStats(invoiceFixtures); // one invoice per status, face 10 HBAR, price 9.5 HBAR
    expect(s.openCount).toBe(1);
    expect(s.openFace).toBe(1_000_000_000n);
    expect(s.avgDiscountPct).toBe(5);
    expect(s.fundedCount).toBe(4); // Funded, Paid, Late, Defaulted
    expect(s.fundedVolume).toBe(3_800_000_000n);
    expect(s.settledCount).toBe(3);
    expect(Math.round(s.onTimePct!)).toBe(33);
  });
  it("returns null figures for no data", () => {
    const s = marketStats([]);
    expect(s.avgDiscountPct).toBeNull();
    expect(s.onTimePct).toBeNull();
  });
});

describe("chart data", () => {
  it("face value per status", () => {
    expect(faceByStatus(invoiceFixtures).map((d) => d.hbar)).toEqual([10, 10, 10, 10, 10, 10]);
  });
  it("buckets only settled invoices by due week, oldest first", () => {
    const weeks = repaymentsByWeek(invoiceFixtures);
    const totals = weeks.reduce((a, w) => a + w.onTime + w.late + w.defaulted, 0);
    expect(totals).toBe(3);
    expect(weeks.map((w) => w.onTime + w.late + w.defaulted).every((n) => n > 0)).toBe(true);
  });
});
