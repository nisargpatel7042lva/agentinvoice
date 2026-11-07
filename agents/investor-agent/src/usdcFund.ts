/**
 * Funding an invoice in USDC (every invoice settles in USDC, not HBAR):
 *   1. if the agent's USDC balance is short, swap just enough HBAR -> USDC on SaucerSwap (live quote, max 1% slippage, capped),
 *   2. approve the market for exactly the price,
 *   3. fund(id), which moves the price in USDC from the agent to the supplier.
 * Every chain call is injected, so the logic is unit-tested without a network (main.ts wires viem).
 */
import { hbarForUsdc, TINYBAR_PER_HBAR, type Hash32 } from "@invoiceagent/shared";

export interface UsdcFundDeps {
  usdcBalance: () => Promise<bigint>;
  allowance: () => Promise<bigint>;
  /** Live SaucerSwap quote for `amountInTinybar` HBAR: USDC out after slippage. */
  quoteMinOut: (amountInTinybar: bigint) => Promise<bigint>;
  /** Swap `amountInTinybar` HBAR for at least `minOut` USDC into the agent's own wallet. */
  swap: (amountInTinybar: bigint, minOut: bigint) => Promise<Hash32>;
  approve: (amount: bigint) => Promise<Hash32>;
  fund: (id: bigint) => Promise<Hash32>;
  /** Most HBAR a single top-up may swap (tinybar). */
  maxSwapTinybar: bigint;
  log?: (line: string) => void;
}

/** HBAR to swap for `shortUsdc` (shared with the buyer agent's vault top-up). */
export const hbarFor = hbarForUsdc;

export async function fundInUsdc(id: bigint, price: bigint, deps: UsdcFundDeps): Promise<Hash32> {
  const log = deps.log ?? (() => {});
  const balance = await deps.usdcBalance();
  if (balance < price) {
    const short = price - balance;
    const amountIn = hbarFor(short, await deps.quoteMinOut(TINYBAR_PER_HBAR));
    if (amountIn > deps.maxSwapTinybar) throw new Error(`needs ${amountIn} tinybar of HBAR to get ${short} USDC units, above the ${deps.maxSwapTinybar} swap cap`);
    const minOut = await deps.quoteMinOut(amountIn);
    if (minOut < short) throw new Error(`quote for ${amountIn} tinybar gives ${minOut} USDC units, less than the ${short} needed`);
    const tx = await deps.swap(amountIn, minOut);
    log(`swapped ${amountIn} tinybar HBAR -> >=${minOut} USDC units tx=${tx}`);
    if ((await deps.usdcBalance()) < price) throw new Error("USDC balance still below the price after the swap");
  }
  if ((await deps.allowance()) < price) {
    const tx = await deps.approve(price);
    log(`approved market for ${price} USDC units tx=${tx}`);
  }
  return deps.fund(id);
}
