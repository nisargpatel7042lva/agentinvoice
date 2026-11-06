import type { Address, CibilTier, DualPartyCibilScore, Invoice, PartyCibilScore } from "./types.js";

export function scoreToTier(score: number): CibilTier {
  if (score === 0) return "New";
  if (score >= 750) return "Excellent";
  if (score >= 650) return "Good";
  if (score >= 550) return "Fair";
  return "Poor";
}

/**
 * Calculate CIBIL credit score for a Supplier (Business creating invoices).
 * Factors:
 * - Acceptance Rate (45%): Invoices accepted by buyer vaults vs total created. Guards against invoice fraud/spam.
 * - Fulfillment Rate (35%): Paid vs (Paid + Defaulted) settled invoices.
 * - Volume Factor (10%): Track record depth (up to 10 settled invoices).
 * - Sponsor Bonus (10%): Verified World ID human sponsor vouching.
 */
export function calculateSupplierCibilScore(
  supplier: Address,
  invoices: Invoice[],
  options?: { hasWorldSponsor?: boolean; now?: number }
): PartyCibilScore {
  const now = options?.now ?? Math.floor(Date.now() / 1000);
  const supplierInvoices = invoices.filter(
    (i) => i.supplier.toLowerCase() === supplier.toLowerCase()
  );

  const totalInvoices = supplierInvoices.length;
  if (totalInvoices === 0) {
    return {
      address: supplier,
      role: "supplier",
      score: 0,
      tier: "New",
      acceptanceRate: 100,
      totalInvoices: 0,
      settledInvoices: 0,
      defaultedInvoices: 0,
      disputeRate: 0,
      summary: "New business with no previous on-chain invoice history.",
      asOf: now,
    };
  }

  const accepted = supplierInvoices.filter((i) => i.status !== "Pending").length;
  const acceptanceRate = Math.round((accepted / totalInvoices) * 100);

  const paid = supplierInvoices.filter((i) => i.status === "Paid").length;
  const late = supplierInvoices.filter((i) => i.status === "Late").length;
  const defaulted = supplierInvoices.filter((i) => i.status === "Defaulted").length;
  const settledInvoices = paid + late + defaulted;

  if (settledInvoices < 2) {
    return {
      address: supplier,
      role: "supplier",
      score: 0,
      tier: "New",
      acceptanceRate,
      totalInvoices,
      settledInvoices,
      defaultedInvoices: defaulted,
      disputeRate: totalInvoices - accepted > 0 ? Math.round(((totalInvoices - accepted) / totalInvoices) * 100) : 0,
      summary: "Unestablished credit history with fewer than 2 settled invoices.",
      asOf: now,
    };
  }

  const fulfillRate = (paid + late) / (settledInvoices || 1); // late can still be paid
  const volumeFactor = Math.min(1, settledInvoices / 10);
  const sponsorFactor = options?.hasWorldSponsor ? 1 : 0.5;

  const normalized =
    0.45 * (acceptanceRate / 100) +
    0.35 * fulfillRate +
    0.10 * volumeFactor +
    0.10 * sponsorFactor;

  const score = Math.min(900, Math.max(300, Math.round(300 + 600 * normalized)));
  const tier = scoreToTier(score);

  return {
    address: supplier,
    role: "supplier",
    score,
    tier,
    acceptanceRate,
    totalInvoices,
    settledInvoices,
    defaultedInvoices: defaulted,
    disputeRate: Math.max(0, 100 - acceptanceRate),
    summary: `${tier} rating (${score}/900): ${acceptanceRate}% acceptance, ${settledInvoices} settled, ${defaulted} defaulted.`,
    asOf: now,
  };
}

/**
 * Calculate CIBIL credit score for a Buyer (AI Agent Vault paying invoices).
 * Factors:
 * - On-Time Repayment (50%): Paid on time vs total settled.
 * - Default Avoidance (30%): Zero default penalty.
 * - Volume Factor (10%): History depth.
 * - Sponsor Bonus (10%): Backed by verified human sponsor on ENS.
 */
export function calculateBuyerCibilScore(
  vault: Address,
  invoices: Invoice[],
  options?: { hasWorldSponsor?: boolean; now?: number }
): PartyCibilScore {
  const now = options?.now ?? Math.floor(Date.now() / 1000);
  const buyerInvoices = invoices.filter(
    (i) => i.buyerVault.toLowerCase() === vault.toLowerCase()
  );

  const totalInvoices = buyerInvoices.length;
  const paid = buyerInvoices.filter((i) => i.status === "Paid").length;
  const late = buyerInvoices.filter((i) => i.status === "Late").length;
  const defaulted = buyerInvoices.filter((i) => i.status === "Defaulted").length;
  const settledInvoices = paid + late + defaulted;

  if (settledInvoices < 2) {
    return {
      address: vault,
      role: "buyer",
      score: 0,
      tier: "New",
      onTimeRate: settledInvoices === 0 ? 100 : Math.round((paid / settledInvoices) * 100),
      totalInvoices,
      settledInvoices,
      defaultedInvoices: defaulted,
      summary: "New buyer agent with fewer than 2 settled invoices.",
      asOf: now,
    };
  }

  const onTimeRate = Math.round((paid / settledInvoices) * 100);
  const defaultPenalty = 1 - defaulted / settledInvoices;
  const volumeFactor = Math.min(1, settledInvoices / 10);
  const sponsorFactor = options?.hasWorldSponsor ? 1 : 0.5;

  const normalized =
    0.50 * (onTimeRate / 100) +
    0.30 * defaultPenalty +
    0.10 * volumeFactor +
    0.10 * sponsorFactor;

  const score = Math.min(900, Math.max(300, Math.round(300 + 600 * normalized)));
  const tier = scoreToTier(score);

  return {
    address: vault,
    role: "buyer",
    score,
    tier,
    onTimeRate,
    totalInvoices,
    settledInvoices,
    defaultedInvoices: defaulted,
    summary: `${tier} rating (${score}/900): ${onTimeRate}% on-time repayment across ${settledInvoices} settled invoices.`,
    asOf: now,
  };
}

/**
 * Produce combined Dual-Party CIBIL profile for an investor evaluating an invoice.
 */
export function calculateDualPartyCibilScore(
  invoice: Invoice,
  allInvoices: Invoice[],
  options?: { supplierSponsor?: boolean; buyerSponsor?: boolean; now?: number }
): DualPartyCibilScore {
  const now = options?.now ?? Math.floor(Date.now() / 1000);
  const supplierScore = calculateSupplierCibilScore(invoice.supplier, allInvoices, {
    hasWorldSponsor: options?.supplierSponsor,
    now,
  });
  const buyerScore = calculateBuyerCibilScore(invoice.buyerVault, allInvoices, {
    hasWorldSponsor: options?.buyerSponsor,
    now,
  });

  // Decision matrix:
  const isSupplierPassing =
    supplierScore.tier === "Excellent" ||
    supplierScore.tier === "Good" ||
    (supplierScore.tier === "New" && (supplierScore.acceptanceRate ?? 0) >= 80);
  const isBuyerPassing = buyerScore.tier === "Excellent" || buyerScore.tier === "Good" || buyerScore.tier === "New";

  const investmentGrade = isSupplierPassing && isBuyerPassing && buyerScore.defaultedInvoices === 0;

  let riskRecommendation: DualPartyCibilScore["riskRecommendation"];
  let recommendedDiscountBps: number;

  if (supplierScore.tier === "Poor" || buyerScore.tier === "Poor" || buyerScore.defaultedInvoices > 0) {
    riskRecommendation = "Reject";
    recommendedDiscountBps = 2000; // 20%
  } else if (supplierScore.score >= 750 && buyerScore.score >= 750) {
    riskRecommendation = "Strong Buy";
    recommendedDiscountBps = 300; // 3%
  } else if (isSupplierPassing && isBuyerPassing) {
    riskRecommendation = "Moderate Buy";
    recommendedDiscountBps = 500; // 5%
  } else {
    riskRecommendation = "High Risk / Caution";
    recommendedDiscountBps = 1000; // 10%
  }

  return {
    invoiceId: invoice.id,
    supplier: supplierScore,
    buyer: buyerScore,
    investmentGrade,
    riskRecommendation,
    recommendedDiscountBps,
    asOf: now,
  };
}
