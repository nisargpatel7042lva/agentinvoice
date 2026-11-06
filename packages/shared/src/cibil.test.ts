import { describe, expect, it } from "vitest";
import {
  calculateBuyerCibilScore,
  calculateDualPartyCibilScore,
  calculateSupplierCibilScore,
  scoreToTier,
} from "./cibil.js";
import type { Invoice } from "./types.js";

const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: "1",
  supplier: "0x1111111111111111111111111111111111111111",
  buyerVault: "0x2222222222222222222222222222222222222222",
  faceAmount: "10000000000",
  price: "9500000000",
  dueDate: Math.floor(Date.now() / 1000) + 3600,
  status: "Paid",
  bond: null,
  holder: "0x3333333333333333333333333333333333333333",
  evidenceHash: ("0x" + "a".repeat(64)) as `0x${string}`,
  description: "Test invoice",
  ...overrides,
});

describe("cibil scoring engine", () => {
  it("maps numeric score to correct CIBIL tier", () => {
    expect(scoreToTier(0)).toBe("New");
    expect(scoreToTier(300)).toBe("Poor");
    expect(scoreToTier(549)).toBe("Poor");
    expect(scoreToTier(550)).toBe("Fair");
    expect(scoreToTier(649)).toBe("Fair");
    expect(scoreToTier(650)).toBe("Good");
    expect(scoreToTier(749)).toBe("Good");
    expect(scoreToTier(750)).toBe("Excellent");
    expect(scoreToTier(900)).toBe("Excellent");
  });

  it("handles new supplier with no invoices", () => {
    const res = calculateSupplierCibilScore(
      "0x1111111111111111111111111111111111111111",
      []
    );
    expect(res.score).toBe(0);
    expect(res.tier).toBe("New");
    expect(res.totalInvoices).toBe(0);
  });

  it("handles supplier with high acceptance and settlement history", () => {
    const supplier = "0x1111111111111111111111111111111111111111";
    const invoices: Invoice[] = [
      makeInvoice({ id: "1", status: "Paid" }),
      makeInvoice({ id: "2", status: "Paid" }),
      makeInvoice({ id: "3", status: "Paid" }),
      makeInvoice({ id: "4", status: "Paid" }),
      makeInvoice({ id: "5", status: "Paid" }),
    ];

    const res = calculateSupplierCibilScore(supplier, invoices, { hasWorldSponsor: true });
    expect(res.score).toBeGreaterThanOrEqual(750);
    expect(res.tier).toBe("Excellent");
    expect(res.acceptanceRate).toBe(100);
    expect(res.defaultedInvoices).toBe(0);
  });

  it("penalizes supplier with rejected/spam invoices (unaccepted)", () => {
    const supplier = "0x1111111111111111111111111111111111111111";
    const invoices: Invoice[] = [
      makeInvoice({ id: "1", status: "Pending" }),
      makeInvoice({ id: "2", status: "Pending" }),
      makeInvoice({ id: "3", status: "Pending" }),
      makeInvoice({ id: "4", status: "Paid" }),
      makeInvoice({ id: "5", status: "Paid" }),
    ];

    const res = calculateSupplierCibilScore(supplier, invoices);
    expect(res.acceptanceRate).toBe(40);
    expect(res.score).toBeLessThan(700);
  });

  it("calculates buyer CIBIL score accurately", () => {
    const vault = "0x2222222222222222222222222222222222222222";
    const invoices: Invoice[] = [
      makeInvoice({ id: "1", status: "Paid" }),
      makeInvoice({ id: "2", status: "Paid" }),
      makeInvoice({ id: "3", status: "Late" }),
      makeInvoice({ id: "4", status: "Defaulted" }),
    ];

    const res = calculateBuyerCibilScore(vault, invoices);
    expect(res.defaultedInvoices).toBe(1);
    expect(res.score).toBeLessThan(650);
  });

  it("calculates combined dual-party CIBIL score for investor", () => {
    const targetInvoice = makeInvoice({ id: "10", status: "Open" });
    const allInvoices: Invoice[] = [
      targetInvoice,
      makeInvoice({ id: "1", status: "Paid" }),
      makeInvoice({ id: "2", status: "Paid" }),
      makeInvoice({ id: "3", status: "Paid" }),
      makeInvoice({ id: "4", status: "Paid" }),
    ];

    const dual = calculateDualPartyCibilScore(targetInvoice, allInvoices, {
      supplierSponsor: true,
      buyerSponsor: true,
    });

    expect(dual.invoiceId).toBe("10");
    expect(dual.investmentGrade).toBe(true);
    expect(["Strong Buy", "Moderate Buy"]).toContain(dual.riskRecommendation);
    expect(dual.recommendedDiscountBps).toBeLessThanOrEqual(500);
  });
});
