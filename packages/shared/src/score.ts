// Credit score from invoice history. Used by the website (free, public data) and the paid x402 score API,
// so both always agree. Bands are computed from the deterministic credit score model (computeCreditReport).
import { computeCreditReport } from "./creditScore";
import type { Address, BuyerScore, Invoice, ScoreBand } from "./types";

/**
 * Legacy band computation based solely on raw on-time rate.
 * Note: The active score band now comes from `computeCreditReport` via `scoreFromInvoices`.
 * Exported for backwards compatibility with tests and callers.
 */
export function computeBand(paid: number, late: number, defaulted: number): { band: ScoreBand; onTimeRate: number } {
  const settled = paid + late + defaulted;
  if (settled < 3) return { band: "New", onTimeRate: settled === 0 ? 100 : Math.round((paid / settled) * 100) };
  const onTimeRate = Math.round((paid / settled) * 100);
  if (onTimeRate >= 95) return { band: "A", onTimeRate };
  if (onTimeRate >= 80) return { band: "B", onTimeRate };
  return { band: "C", onTimeRate };
}

/** Score for one buyer vault from its invoices. Includes deterministic credit score and factor breakdown. */
export function scoreFromInvoices(
  vault: Address,
  invoices: Invoice[],
  now = Math.floor(Date.now() / 1000),
  options?: { everLateIds?: Set<string>; dailyLimit?: bigint }
): BuyerScore {
  const mine = invoices.filter((i) => i.buyerVault.toLowerCase() === vault.toLowerCase());
  const paid = mine.filter((i) => i.status === "Paid").length;
  const late = mine.filter((i) => i.status === "Late").length;
  const defaulted = mine.filter((i) => i.status === "Defaulted").length;
  const openExposure = mine
    .filter((i) => i.status === "Funded" || i.status === "Late")
    .reduce((a, i) => a + BigInt(i.faceAmount), 0n);

  const credit = computeCreditReport({
    vault,
    invoices,
    everLateIds: options?.everLateIds,
    dailyLimit: options?.dailyLimit,
    now,
  });

  const { onTimeRate } = computeBand(paid, late, defaulted);

  return {
    vault,
    band: credit.band,
    onTimeRate,
    paid,
    late,
    defaulted,
    openExposure: openExposure.toString(),
    evidence: mine.filter((i) => i.status !== "Pending" && i.status !== "Open").map((i) => `invoice:${i.id}:${i.status}`),
    asOf: now,
    creditScore: credit.score,
    credit,
  };
}
