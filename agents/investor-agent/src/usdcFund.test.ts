import { describe, expect, it, vi } from "vitest";
import { fundInUsdc, hbarFor, type UsdcFundDeps } from "./usdcFund.js";

const H = 100_000_000n; // 1 HBAR in tinybar
const RATE = 2_400_000n; // 2.4 USDC (units) per HBAR after slippage

function deps(over: Partial<UsdcFundDeps> & { balances?: bigint[]; allowanceValue?: bigint } = {}) {
  const balances = [...(over.balances ?? [10_000_000n])];
  const calls: string[] = [];
  const d: UsdcFundDeps = {
    usdcBalance: vi.fn(async () => (balances.length > 1 ? balances.shift()! : balances[0])),
    allowance: vi.fn(async () => over.allowanceValue ?? 0n),
    quoteMinOut: vi.fn(async (amountIn: bigint) => (amountIn * RATE) / H),
    swap: vi.fn(async () => { calls.push("swap"); return "0x5a" as const; }),
    approve: vi.fn(async () => { calls.push("approve"); return "0xa9" as const; }),
    fund: vi.fn(async () => { calls.push("fund"); return "0xf0" as const; }),
    maxSwapTinybar: 10n * H,
    ...over,
  };
  return { d, calls };
}

describe("hbarFor", () => {
  it("rounds up and adds 5% headroom", () => {
    expect(hbarFor(2_400_000n, RATE)).toBe(105_000_000n); // 1 HBAR worth + 5%
    expect(hbarFor(1n, RATE)).toBeGreaterThan(0n);
  });
});

describe("fundInUsdc", () => {
  it("with enough USDC and allowance, only funds", async () => {
    const { d, calls } = deps({ balances: [9_500_000n], allowanceValue: 9_500_000n });
    await fundInUsdc(7n, 9_500_000n, d);
    expect(calls).toEqual(["fund"]);
    expect(d.fund).toHaveBeenCalledWith(7n);
  });

  it("approves exactly the price when the allowance is short", async () => {
    const { d, calls } = deps({ balances: [9_500_000n], allowanceValue: 0n });
    await fundInUsdc(7n, 9_500_000n, d);
    expect(calls).toEqual(["approve", "fund"]);
    expect(d.approve).toHaveBeenCalledWith(9_500_000n);
  });

  it("swaps just enough HBAR (against a quote) when USDC is short, then approves and funds", async () => {
    const { d, calls } = deps({ balances: [1_000_000n, 10_000_000n] });
    await fundInUsdc(7n, 9_500_000n, d);
    expect(calls).toEqual(["swap", "approve", "fund"]);
    const [amountIn, minOut] = (d.swap as ReturnType<typeof vi.fn>).mock.calls[0] as [bigint, bigint];
    expect(amountIn).toBe(hbarFor(8_500_000n, RATE));
    expect(minOut).toBeGreaterThanOrEqual(8_500_000n);
  });

  it("refuses to swap above the cap, and never funds then", async () => {
    const { d, calls } = deps({ balances: [0n], maxSwapTinybar: 1n * H });
    await expect(fundInUsdc(7n, 50_000_000n, d)).rejects.toThrow(/swap cap/);
    expect(calls).toEqual([]);
  });

  it("stops if the swap did not deliver enough USDC", async () => {
    const { d, calls } = deps({ balances: [0n, 1_000n] });
    await expect(fundInUsdc(7n, 9_500_000n, d)).rejects.toThrow(/still below/);
    expect(calls).toEqual(["swap"]);
  });
});
