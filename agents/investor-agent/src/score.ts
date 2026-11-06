import { ScoreResultSchema, type ScoreResult } from "@agentinvoice/shared";

/**
 * Mann's helper from @agentinvoice/shared: performs the x402 payment and returns the response body.
 * We never implement payment here; it is injected so tests can fake it.
 */
export type PayAndGet = (url: string) => Promise<unknown>;

export const SCORE_TTL_MS = 60_000;

/** One paid score per vault per 60 s. Concurrent calls for the same vault share one payment. */
export function createScoreReader(scoreApiUrl: string, payAndGet: PayAndGet, now: () => number = Date.now) {
  const cache = new Map<string, { at: number; value: Promise<ScoreResult> }>();

  return async function getScore(vault: string): Promise<ScoreResult> {
    const key = vault.toLowerCase();
    const hit = cache.get(key);
    if (hit && now() - hit.at < SCORE_TTL_MS) return hit.value;
    const value = payAndGet(`${scoreApiUrl.replace(/\/$/, "")}/score/${vault}`).then((body) => ScoreResultSchema.parse(body));
    cache.set(key, { at: now(), value });
    value.catch(() => cache.delete(key)); // never cache a failed payment
    return value;
  };
}
