import { parseAmount, type Invoice, type ScoreBand, type BuyerScore } from "@invoiceagent/shared";

export interface Rules {
  minScore: number; // MIN_SCORE, default 650
  minBand: ScoreBand; // MIN_BAND, default B
  minDiscountBps: number; // MIN_DISCOUNT_BPS
  maxPrice: bigint; // MAX_PRICE per invoice, USDC base units (invoices settle in USDC)
  maxOpenExposure: bigint; // MAX_OPEN_EXPOSURE per vault, USDC base units
}

export type Decision = { action: "buy"; reason: string } | { action: "skip"; reason: string };

// Higher is better. New (no history) ranks below C.
const RANK: Record<ScoreBand, number> = { A: 3, B: 2, C: 1, New: 0 };

export function discountBps(inv: Pick<Invoice, "faceAmount" | "price">): number {
  const face = BigInt(inv.faceAmount);
  return face === 0n ? 0 : Number(((face - BigInt(inv.price)) * 10_000n) / face);
}

/** Pure: same inputs, same answer. `exposure` = price already funded by us for this buyer vault and not yet repaid. */
export function decide(invoice: Invoice, score: BuyerScore | null, rules: Rules, exposure = 0n): Decision {
  if (invoice.status !== "Open") return { action: "skip", reason: `status ${invoice.status}, not Open` };
  if (!score) return { action: "skip", reason: "no score available" };
  if (score.creditScore == null) return { action: "skip", reason: "no credit history yet" };
  if (score.creditScore < rules.minScore) {
    return { action: "skip", reason: `credit score ${score.creditScore} below minimum ${rules.minScore}` };
  }
  if (RANK[score.band] < RANK[rules.minBand]) {
    return { action: "skip", reason: score.band === "New" ? "band New: no payment history" : `band ${score.band} below minimum ${rules.minBand}` };
  }
  const bps = discountBps(invoice);
  if (bps < rules.minDiscountBps) return { action: "skip", reason: `discount ${bps} bps below minimum ${rules.minDiscountBps}` };
  const price = BigInt(invoice.price);
  if (price > rules.maxPrice) return { action: "skip", reason: `price ${price} above max ${rules.maxPrice}` };
  if (exposure + price > rules.maxOpenExposure) {
    return { action: "skip", reason: `exposure ${exposure + price} would exceed max ${rules.maxOpenExposure} for this vault` };
  }
  return { action: "buy", reason: `band ${score.band}, discount ${bps} bps, price within limits` };
}

const BANDS = new Set<string>(["A", "B", "C", "New"]);

/** Reads rules from env. Amounts in env are USDC decimals (e.g. MAX_PRICE=50 means 50 USDC). */
export function rulesFromEnv(env: Record<string, string | undefined> = process.env): Rules {
  const rawScore = env.MIN_SCORE ?? "650";
  const minScore = Number(rawScore);
  if (Number.isNaN(minScore) || !Number.isInteger(minScore) || minScore < 300 || minScore > 900) {
    throw new Error(`MIN_SCORE must be an integer between 300 and 900, got ${rawScore}`);
  }

  const minBand = (env.MIN_BAND ?? "B") as ScoreBand;
  if (!BANDS.has(minBand)) throw new Error(`MIN_BAND must be A, B, C or New, got ${env.MIN_BAND}`);
  return {
    minScore,
    minBand,
    minDiscountBps: Number(env.MIN_DISCOUNT_BPS ?? "100"),
    maxPrice: parseAmount(env.MAX_PRICE ?? "100"),
    maxOpenExposure: parseAmount(env.MAX_OPEN_EXPOSURE ?? "500"),
  };
}
