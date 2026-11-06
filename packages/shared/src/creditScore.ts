import type { Address, CreditFactor, CreditReport, Invoice, ScoreBand } from "./types";

export const CREDIT_MODEL_VERSION = "agentinvoice-credit-v1";

export interface ComputeCreditReportParams {
  vault: Address;
  invoices: Invoice[]; // all invoices; filter to this vault (case-insensitive)
  everLateIds?: Set<string>; // invoice ids that ever had an "invoice.late" audit event (optional)
  dailyLimit?: bigint; // vault daily limit in tinybar, if known
  now?: number; // unix seconds, default Date.now()/1000
}

const round4 = (n: number): number => Math.round(n * 10000) / 10000;

export function computeCreditReport({
  vault,
  invoices,
  everLateIds,
  dailyLimit,
  now = Math.floor(Date.now() / 1000),
}: ComputeCreditReportParams): CreditReport {
  const mine = invoices.filter((i) => i.buyerVault.toLowerCase() === vault.toLowerCase());

  const onTimeInvoices = mine.filter((i) => i.status === "Paid" && (!everLateIds || !everLateIds.has(i.id)));
  const paidLateInvoices = mine.filter((i) => i.status === "Paid" && everLateIds?.has(i.id));
  const lateInvoices = mine.filter((i) => i.status === "Late");
  const defaultedInvoices = mine.filter((i) => i.status === "Defaulted");

  const onTime = onTimeInvoices.length;
  const paidLate = paidLateInvoices.length;
  const late = lateInvoices.length;
  const defaulted = defaultedInvoices.length;
  const settled = onTime + paidLate + late + defaulted;

  const openExposureInvoices = mine.filter((i) => i.status === "Funded" || i.status === "Late");
  const openExposure = openExposureInvoices.reduce((acc, i) => acc + BigInt(i.faceAmount), 0n);

  const firstSeen = mine.length > 0 ? Math.min(...mine.map((i) => i.dueDate)) : now;
  const ageDays = Math.max(0, (now - firstSeen) / 86400);

  // Factor P: Payment history (weight 0.35) = (onTime + 0.5 * paidLate) / settled
  const rawP = settled === 0 ? 1 : (onTime + 0.5 * paidLate) / settled;
  const P = round4(Math.max(0, Math.min(1, rawP)));
  let detailP: string;
  if (settled === 0) {
    detailP = "No settled invoices yet";
  } else if (everLateIds === undefined) {
    detailP = `${onTime} of ${settled} settled invoices paid (audit log unavailable for late payment check)`;
  } else {
    detailP = `${onTime} of ${settled} settled invoices paid on time${paidLate > 0 ? ` (${paidLate} paid late)` : ""}`;
  }
  const settledInvoices = [...onTimeInvoices, ...paidLateInvoices, ...lateInvoices, ...defaultedInvoices];

  // Factor D: Defaults & recency (weight 0.20) = max(0, 1 - Σ (0.5 if now-dueDate <= 90 days else 0.25))
  let defaultPenalty = 0;
  for (const inv of defaultedInvoices) {
    const isRecent = now - inv.dueDate <= 90 * 86400;
    defaultPenalty += isRecent ? 0.5 : 0.25;
  }
  const rawD = Math.max(0, 1 - defaultPenalty);
  const D = round4(rawD);
  const detailD =
    defaultedInvoices.length === 0
      ? "No defaults"
      : `${defaultedInvoices.length} defaulted invoice${defaultedInvoices.length === 1 ? "" : "s"} (${defaultPenalty.toFixed(2)} penalty)`;

  // Factor U: Exposure vs limit (weight 0.20)
  let rawU: number;
  let detailU: string;
  if (dailyLimit !== undefined && dailyLimit > 0n) {
    const u = Number(openExposure) / Number(dailyLimit);
    if (u <= 0.3) {
      rawU = 1;
    } else if (u >= 1) {
      rawU = 0;
    } else {
      rawU = (1 - u) / 0.7; // linear 1 -> 0 between 0.3 and 1
    }
    const pct = Math.round(u * 100);
    detailU = `${openExposure.toString()} tinybar open exposure vs ${dailyLimit.toString()} daily limit (${pct}% utilization)`;
  } else {
    rawU = openExposure === 0n ? 1 : 0.5;
    detailU =
      openExposure === 0n
        ? "No open exposure (daily limit unknown)"
        : `${openExposure.toString()} tinybar open exposure (daily limit unknown)`;
  }
  const U = round4(Math.max(0, Math.min(1, rawU)));

  // Factor H: History length (weight 0.15) = min(1, ageDays / 180)
  const rawH = Math.min(1, ageDays / 180);
  const H = round4(rawH);
  const detailH = `${Math.floor(ageDays)} days since first invoice (180 days for full score)`;
  const earliestInvoice =
    mine.length > 0 ? [mine.reduce((earliest, i) => (i.dueDate < earliest.dueDate ? i : earliest)).id] : [];

  // Factor V: Track record size (weight 0.10) = min(1, settled / 20)
  const rawV = Math.min(1, settled / 20);
  const V = round4(rawV);
  const detailV = `${settled} of 20 settled invoices for full track record`;

  const factors: CreditFactor[] = [
    {
      key: "payment",
      label: "Payment history",
      weight: 0.35,
      value: P,
      points: Math.round(600 * 0.35 * P),
      detail: detailP,
      evidence: settledInvoices.map((i) => i.id),
    },
    {
      key: "defaults",
      label: "Defaults & recency",
      weight: 0.20,
      value: D,
      points: Math.round(600 * 0.20 * D),
      detail: detailD,
      evidence: defaultedInvoices.map((i) => i.id),
    },
    {
      key: "exposure",
      label: "Exposure vs limit",
      weight: 0.20,
      value: U,
      points: Math.round(600 * 0.20 * U),
      detail: detailU,
      evidence: openExposureInvoices.map((i) => i.id),
    },
    {
      key: "history",
      label: "History length",
      weight: 0.15,
      value: H,
      points: Math.round(600 * 0.15 * H),
      detail: detailH,
      evidence: earliestInvoice,
    },
    {
      key: "volume",
      label: "Track record size",
      weight: 0.10,
      value: V,
      points: Math.round(600 * 0.10 * V),
      detail: detailV,
      evidence: settledInvoices.map((i) => i.id),
    },
  ];

  const weightedSum = 0.35 * P + 0.20 * D + 0.20 * U + 0.15 * H + 0.10 * V;
  const rawScore = 300 + 600 * weightedSum;

  const score = settled < 3 ? null : Math.max(300, Math.min(900, Math.round(rawScore)));

  let band: ScoreBand;
  if (score === null) {
    band = "New";
  } else if (score >= 750) {
    band = "A";
  } else if (score >= 650) {
    band = "B";
  } else {
    band = "C";
  }

  const summary =
    settled < 3
      ? `Not enough history yet (${settled} settled invoices; 3 needed)`
      : `Credit score ${score} (Band ${band}) based on ${settled} settled invoice${settled === 1 ? "" : "s"}.`;

  return {
    vault,
    score,
    band,
    model: CREDIT_MODEL_VERSION,
    factors,
    summary,
    asOf: now,
    counts: {
      onTime,
      paidLate,
      late,
      defaulted,
      settled,
    },
    openExposure: openExposure.toString(),
  };
}
