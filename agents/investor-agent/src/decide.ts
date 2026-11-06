import { parseUnits, type Invoice, type ScoreBand, type BuyerScore, type DualPartyCibilScore } from "@agentinvoice/shared";

export interface Rules {
  minBand: ScoreBand; // MIN_BAND, default B
  minDiscountBps: number; // MIN_DISCOUNT_BPS
  maxPrice: bigint; // MAX_PRICE per invoice, tinybar
  maxOpenExposure: bigint; // MAX_OPEN_EXPOSURE per vault, tinybar
  minSupplierCibil?: number; // MIN_SUPPLIER_CIBIL (default 550)
  minBuyerCibil?: number; // MIN_BUYER_CIBIL (default 600)
}

export type Decision = { action: "buy"; reason: string } | { action: "skip"; reason: string };

// Higher is better. New (no history) ranks below C.
const RANK: Record<ScoreBand, number> = { A: 3, B: 2, C: 1, New: 0 };

export function discountBps(inv: Pick<Invoice, "faceAmount" | "price">): number {
  const face = BigInt(inv.faceAmount);
  return face === 0n ? 0 : Number(((face - BigInt(inv.price)) * 10_000n) / face);
}

/** Pure: same inputs, same answer. `exposure` = price already funded by us for this buyer vault and not yet repaid. */
export function decide(
  invoice: Invoice,
  score: BuyerScore | null,
  rules: Rules,
  exposure = 0n,
  cibil?: DualPartyCibilScore | null
): Decision {
  if (invoice.status !== "Open") return { action: "skip", reason: `status ${invoice.status}, not Open` };

  if (cibil) {
    if (cibil.riskRecommendation === "Reject") {
      return {
        action: "skip",
        reason: `CIBIL risk recommendation: Reject (supplier: ${cibil.supplier.tier}, buyer: ${cibil.buyer.tier})`,
      };
    }
    const minSup = rules.minSupplierCibil ?? 550;
    if (cibil.supplier.score > 0 && cibil.supplier.score < minSup) {
      return { action: "skip", reason: `supplier CIBIL ${cibil.supplier.score} below minimum ${minSup}` };
    }
    const minBuy = rules.minBuyerCibil ?? 600;
    if (cibil.buyer.score > 0 && cibil.buyer.score < minBuy) {
      return { action: "skip", reason: `buyer CIBIL ${cibil.buyer.score} below minimum ${minBuy}` };
    }
  }

  if (!score) return { action: "skip", reason: "no score available" };
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
  const cibilNote = cibil ? `, CIBIL verified (S:${cibil.supplier.score} B:${cibil.buyer.score})` : "";
  return { action: "buy", reason: `band ${score.band}, discount ${bps} bps, price within limits${cibilNote}` };
}

const BANDS = new Set<string>(["A", "B", "C", "New"]);

/** Reads rules from env. Amounts in env are HBAR decimals (e.g. MAX_PRICE=50). */
export function rulesFromEnv(env: Record<string, string | undefined> = process.env): Rules {
  const minBand = (env.MIN_BAND ?? "B") as ScoreBand;
  if (!BANDS.has(minBand)) throw new Error(`MIN_BAND must be A, B, C or New, got ${env.MIN_BAND}`);
  return {
    minBand,
    minDiscountBps: Number(env.MIN_DISCOUNT_BPS ?? "100"),
    maxPrice: parseUnits(env.MAX_PRICE ?? "100"),
    maxOpenExposure: parseUnits(env.MAX_OPEN_EXPOSURE ?? "500"),
    minSupplierCibil: env.MIN_SUPPLIER_CIBIL ? Number(env.MIN_SUPPLIER_CIBIL) : 550,
    minBuyerCibil: env.MIN_BUYER_CIBIL ? Number(env.MIN_BUYER_CIBIL) : 600,
  };
}
