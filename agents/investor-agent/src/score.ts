import { BuyerScoreSchema, type BuyerScore } from "@invoiceagent/shared";
import type { PayAndGetResult } from "@invoiceagent/shared/payAndGet";

/**
 * Mann's x402 helper, already bound to our key and spending policy (see main.ts).
 * We never implement payment here; it is injected so tests can fake it.
 */
export type PayAndGet = (url: string) => Promise<PayAndGetResult<unknown>>;

export const SCORE_TTL_MS = 60_000;

export function scoreUrl(scoreApiUrl: string, vault: string): string {
  return `${scoreApiUrl.replace(/\/$/, "")}/score?vault=${vault}`;
}

/** One paid score per vault per 60 s. Concurrent calls for the same vault share one payment. */
export function createScoreReader(scoreApiUrl: string, payAndGet: PayAndGet, now: () => number = Date.now) {
  const cache = new Map<string, { at: number; value: Promise<BuyerScore> }>();

  return async function getScore(vault: string): Promise<BuyerScore> {
    const key = vault.toLowerCase();
    const hit = cache.get(key);
    if (hit && now() - hit.at < SCORE_TTL_MS) return hit.value;
    const value = payAndGet(scoreUrl(scoreApiUrl, vault)).then((res) => {
      if (!res.ok) throw new Error(`score payment failed: ${res.reason}`);
      return BuyerScoreSchema.parse(res.data);
    });
    cache.set(key, { at: now(), value });
    value.catch(() => cache.delete(key)); // never cache a failed payment
    return value;
  };
}
