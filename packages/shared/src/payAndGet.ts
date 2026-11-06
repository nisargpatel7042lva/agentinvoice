import type { Address, PayPolicy } from "./types";

export interface PayAndGetOptions {
  policy?: Partial<PayPolicy>;
  account?: Address;
  privateKey?: `0x${string}`;
  onAudit?: (event: {
    type: string;
    url: string;
    amount?: string;
    reason?: string;
    txId?: string;
  }) => Promise<void> | void;
}

export type PayAndGetResult<T> =
  | { ok: true; data: T; txId?: string }
  | { ok: false; reason: string; status?: number };

interface DailySpendStore {
  dayBucket: number;
  spent: bigint;
}

// In-process cache for daily budget tracking across calls
let spendStore: DailySpendStore = {
  dayBucket: Math.floor(Date.now() / 86_400_000),
  spent: 0n,
};

export function getSpentToday(): bigint {
  const currentDay = Math.floor(Date.now() / 86_400_000);
  if (currentDay !== spendStore.dayBucket) {
    spendStore = { dayBucket: currentDay, spent: 0n };
  }
  return spendStore.spent;
}

export function resetSpentTodayForTesting(): void {
  spendStore = { dayBucket: Math.floor(Date.now() / 86_400_000), spent: 0n };
}

/**
 * Executes a GET request against an x402-protected endpoint, enforcing client-side
 * spending controls (perCallCap, dailyBudget, allowedHosts, allowedPayTo) before signing.
 */
export async function payAndGet<T>(
  url: string,
  opts?: PayAndGetOptions
): Promise<PayAndGetResult<T>> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { ok: false, reason: `Invalid URL: ${url}` };
  }

  // Check allowed hosts
  if (opts?.policy?.allowedHosts && opts.policy.allowedHosts.length > 0) {
    const isAllowed = opts.policy.allowedHosts.some(
      (h) => h === parsedUrl.host || h === parsedUrl.hostname
    );
    if (!isAllowed) {
      await opts?.onAudit?.({
        type: "x402.refusal",
        url,
        reason: `Host ${parsedUrl.hostname} is not in allowedHosts policy`,
      });
      return { ok: false, reason: `Host ${parsedUrl.hostname} not allowed by policy` };
    }
  }

  // First request: probe the endpoint
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `Network request failed: ${msg}` };
  }

  // Free endpoint response
  if (response.status === 200) {
    const data = (await response.json()) as T;
    return { ok: true, data };
  }

  // Not an x402 challenge
  if (response.status !== 402) {
    return {
      ok: false,
      status: response.status,
      reason: `HTTP ${response.status}: ${await response.text().catch(() => "")}`,
    };
  }

  // Parse 402 Payment Requirements
  const authHeader = response.headers.get("x402-payment-required") || response.headers.get("www-authenticate");
  let paymentReq: { amount?: string; payTo?: Address; network?: string } = {};

  try {
    const body = (await response.json()) as Record<string, unknown>;
    paymentReq = {
      amount: (body.amount || body.price || "1000000000000000000") as string,
      payTo: (body.payTo || body.recipient) as Address,
      network: (body.network || "hedera:testnet") as string,
    };
  } catch {
    // If not json, try header
    if (authHeader) {
      paymentReq = { amount: "1000000000000000000" };
    }
  }

  const requestedAmount = BigInt(paymentReq.amount || "1000000000000000000");

  // Validate per-call cap
  if (opts?.policy?.perCallCap) {
    const cap = BigInt(opts.policy.perCallCap);
    if (requestedAmount > cap) {
      await opts?.onAudit?.({
        type: "x402.refusal",
        url,
        amount: requestedAmount.toString(),
        reason: `Requested amount ${requestedAmount} exceeds perCallCap ${cap}`,
      });
      return {
        ok: false,
        reason: `Requested payment ${requestedAmount} exceeds per-call cap ${cap}`,
      };
    }
  }

  // Validate daily budget
  if (opts?.policy?.dailyBudget) {
    const budget = BigInt(opts.policy.dailyBudget);
    const spent = getSpentToday();
    if (spent + requestedAmount > budget) {
      await opts?.onAudit?.({
        type: "x402.refusal",
        url,
        amount: requestedAmount.toString(),
        reason: `Daily budget exhausted: ${spent} + ${requestedAmount} > ${budget}`,
      });
      return {
        ok: false,
        reason: `Daily budget exhausted (${spent} + ${requestedAmount} > ${budget})`,
      };
    }
  }

  // Validate payTo recipient
  if (opts?.policy?.allowedPayTo && opts.policy.allowedPayTo.length > 0 && paymentReq.payTo) {
    const isAllowed = opts.policy.allowedPayTo.some(
      (addr) => addr.toLowerCase() === paymentReq.payTo?.toLowerCase()
    );
    if (!isAllowed) {
      await opts?.onAudit?.({
        type: "x402.refusal",
        url,
        reason: `Recipient ${paymentReq.payTo} is not in allowedPayTo`,
      });
      return { ok: false, reason: `Recipient ${paymentReq.payTo} not allowed` };
    }
  }

  // Record payment in daily spend
  spendStore.spent = getSpentToday() + requestedAmount;

  // Simulate payment transaction ID / Hedera payment header
  const mockTxId = `0.0.9876@${Date.now()}.000000000`;
  const paymentReceiptHeader = `x402 tx=${mockTxId}; amount=${requestedAmount}`;

  // Retry with authorization
  const paidResponse = await fetch(url, {
    headers: {
      Authorization: paymentReceiptHeader,
      "X-Payment": paymentReceiptHeader,
    },
  });

  if (!paidResponse.ok) {
    return {
      ok: false,
      status: paidResponse.status,
      reason: `Paid request failed with HTTP ${paidResponse.status}`,
    };
  }

  const resultData = (await paidResponse.json()) as T;
  await opts?.onAudit?.({
    type: "x402.payment",
    url,
    amount: requestedAmount.toString(),
    txId: mockTxId,
  });

  return { ok: true, data: resultData, txId: mockTxId };
}
