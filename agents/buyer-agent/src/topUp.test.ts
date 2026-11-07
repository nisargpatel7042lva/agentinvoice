import { describe, expect, it, vi } from "vitest";
import { ensureVaultUsdc, type TopUpDeps } from "./topUp.js";

const H = 100_000_000n;
const RATE = 2_400_000n; // USDC units per HBAR after slippage

function deps(balances: bigint[], over: Partial<TopUpDeps> = {}): TopUpDeps {
  const queue = [...balances];
  return {
    vaultUsdc: vi.fn(async () => (queue.length > 1 ? queue.shift()! : queue[0])),
    quoteMinOut: vi.fn(async (amountIn: bigint) => (amountIn * RATE) / H),
    swapToVault: vi.fn(async () => "0x5a" as const),
    maxSwapTinybar: 20n * H,
    ...over,
  };
}

describe("ensureVaultUsdc", () => {
  it("does nothing when the vault already holds the face amount", async () => {
    const d = deps([10_000_000n]);
    expect(await ensureVaultUsdc(10_000_000n, d)).toBeNull();
    expect(d.swapToVault).not.toHaveBeenCalled();
  });

  it("swaps just enough HBAR into the vault, against a quote", async () => {
    const d = deps([4_000_000n, 10_000_000n]);
    expect(await ensureVaultUsdc(10_000_000n, d)).toBe("0x5a");
    const [amountIn, minOut] = (d.swapToVault as ReturnType<typeof vi.fn>).mock.calls[0] as [bigint, bigint];
    expect(minOut).toBeGreaterThanOrEqual(6_000_000n);
    expect(amountIn).toBeLessThan(3n * H); // ~2.6 HBAR for 6 USDC at 2.4/HBAR + 5%
  });

  it("refuses above the cap and never swaps", async () => {
    const d = deps([0n], { maxSwapTinybar: 1n * H });
    await expect(ensureVaultUsdc(50_000_000n, d)).rejects.toThrow(/swap cap/);
    expect(d.swapToVault).not.toHaveBeenCalled();
  });

  it("fails loudly if the swap did not arrive", async () => {
    const d = deps([0n, 0n]);
    await expect(ensureVaultUsdc(1_000_000n, d)).rejects.toThrow(/still below/);
  });
});
