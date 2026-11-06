// Credit score from invoice history. Used by the website (free, public data) and the paid x402 score API,
// so both always agree. Band rules are Mann's original ones from services/paid-api.
import type { Address, BuyerScore, Invoice, ScoreBand } from "./types";

export function computeBand(paid: number, late: number, defaulted: number): { band: ScoreBand; onTimeRate: number } {
  const settled = paid + late + defaulted;
  if (settled < 3) return { band: "New", onTimeRate: settled === 0 ? 100 : Math.round((paid / settled) * 100) };
  const onTimeRate = Math.round((paid / settled) * 100);
  if (onTimeRate >= 95) return { band: "A", onTimeRate };
  if (onTimeRate >= 80) return { band: "B", onTimeRate };
  return { band: "C", onTimeRate };
}

/** Score for one buyer vault from its invoices. `late` counts invoices that are Late now; Paid counts as on time. */
export function scoreFromInvoices(vault: Address, invoices: Invoice[], now = Math.floor(Date.now() / 1000)): BuyerScore {
  const mine = invoices.filter((i) => i.buyerVault.toLowerCase() === vault.toLowerCase());
  const paid = mine.filter((i) => i.status === "Paid").length;
  const late = mine.filter((i) => i.status === "Late").length;
  const defaulted = mine.filter((i) => i.status === "Defaulted").length;
  const openExposure = mine.filter((i) => i.status === "Funded" || i.status === "Late").reduce((a, i) => a + BigInt(i.faceAmount), 0n);
  const { band, onTimeRate } = computeBand(paid, late, defaulted);
  return {
    vault,
    band,
    onTimeRate,
    paid,
    late,
    defaulted,
    openExposure: openExposure.toString(),
    evidence: mine.filter((i) => i.status !== "Pending" && i.status !== "Open").map((i) => `invoice:${i.id}:${i.status}`),
    asOf: now,
  };
}
