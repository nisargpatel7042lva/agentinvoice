import type { Status } from "@agentinvoice/shared";

// Payment-history score for a buyer vault, computed from its invoices.
// Bands: New (fewer than 3 settled), A (95% or more on time), B (80% to 94%), C (below 80%).
// "Settled" = Paid + Late + Defaulted. Limitation: the Status enum does not keep whether a Paid invoice was paid
// after being Late, so a Late invoice that is later paid counts as on time. Fixing that needs per-invoice event history.

export type Band = "New" | "A" | "B" | "C";

export interface ScoreInvoice {
  status: Status;
  faceAmount: string; // decimal base units
}

export interface ScoreStats {
  paid: number;
  late: number;
  defaulted: number;
  settled: number;
  onTimeRate: number; // 0..1, 0 when nothing is settled
  openExposure: string; // face amount still owed by the vault (Funded + Late), decimal base units
  band: Band;
}

export function bandFor(settled: number, onTime: number): Band {
  if (settled < 3) return "New";
  const rate = onTime / settled;
  if (rate >= 0.95) return "A";
  if (rate >= 0.8) return "B";
  return "C";
}

export function computeScore(invoices: ScoreInvoice[]): ScoreStats {
  let paid = 0;
  let late = 0;
  let defaulted = 0;
  let exposure = 0n;
  for (const i of invoices) {
    if (i.status === "Paid") paid++;
    else if (i.status === "Late") late++;
    else if (i.status === "Defaulted") defaulted++;
    if (i.status === "Funded" || i.status === "Late") exposure += BigInt(i.faceAmount);
  }
  const settled = paid + late + defaulted;
  return {
    paid,
    late,
    defaulted,
    settled,
    onTimeRate: settled === 0 ? 0 : paid / settled,
    openExposure: exposure.toString(),
    band: bandFor(settled, paid),
  };
}

// 0..100 value for the shared Score type. New agents have no history, so they score 0.
export function scoreValue(s: Pick<ScoreStats, "band" | "onTimeRate">): number {
  return s.band === "New" ? 0 : Math.round(s.onTimeRate * 100);
}
