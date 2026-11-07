/**
 * Before the vault pays an invoice (in USDC), make sure it holds enough USDC. If it is short, the agent's wallet swaps just
 * enough HBAR on SaucerSwap with the vault as the swap recipient, so the USDC lands in the vault directly. Chain calls are
 * injected so this is unit-tested; index.ts wires viem.
 */
import { hbarForUsdc, TINYBAR_PER_HBAR, type Hash32 } from "@invoiceagent/shared";

export interface TopUpDeps {
  vaultUsdc: () => Promise<bigint>;
  quoteMinOut: (amountInTinybar: bigint) => Promise<bigint>;
  /** Swap HBAR from the agent wallet; USDC goes to the vault. */
  swapToVault: (amountInTinybar: bigint, minOut: bigint) => Promise<Hash32>;
  maxSwapTinybar: bigint;
  log?: (line: string) => void;
}

/** Returns the swap tx hash when it topped up, or null when the vault already had enough. */
export async function ensureVaultUsdc(face: bigint, deps: TopUpDeps): Promise<Hash32 | null> {
  const have = await deps.vaultUsdc();
  if (have >= face) return null;
  const short = face - have;
  const amountIn = hbarForUsdc(short, await deps.quoteMinOut(TINYBAR_PER_HBAR));
  if (amountIn > deps.maxSwapTinybar) throw new Error(`vault needs ${short} more USDC units (${amountIn} tinybar of HBAR), above the ${deps.maxSwapTinybar} swap cap`);
  const minOut = await deps.quoteMinOut(amountIn);
  if (minOut < short) throw new Error(`quote for ${amountIn} tinybar gives ${minOut} USDC units, less than the ${short} needed`);
  const tx = await deps.swapToVault(amountIn, minOut);
  deps.log?.(`vault top-up: swapped ${amountIn} tinybar HBAR -> >=${minOut} USDC units into the vault tx=${tx}`);
  if ((await deps.vaultUsdc()) < face) throw new Error("vault USDC still below the face amount after the top-up");
  return tx;
}
