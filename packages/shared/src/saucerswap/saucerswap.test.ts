import { describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeFunctionData, parseAbiParameters, type Hex } from "viem";
import { quoterV2Abi } from "./abi";
import {
  CIRCLE_USDC_TOKEN_ID,
  createSaucerSwapConfig,
  encodeV3Path,
  hederaIdToEvmAddress,
  loadSaucerSwapConfig,
  SaucerSwapConfigError,
  USDC_TOKEN_ID,
  V2_QUOTER_ID,
  V2_SWAP_ROUTER_ID,
  WHBAR_TOKEN_ID,
} from "./config";
import { checkHbarAffordability } from "./balance";
import { quoteHbarToUsdc, validateQuote } from "./quote";
import { executeHbarToUsdc } from "./swap";
import type { SaucerSwapDeps, SwapQuote } from "./types";
import { TINYBAR_PER_HBAR } from "../units";

const ONE_HBAR = TINYBAR_PER_HBAR;
const QUOTE_OUT = 2_425_296n; // ~2.425 USDC base units (Phase 1 sample magnitude)

function encodeQuoteResult(amountOut: bigint): Hex {
  return encodeAbiParameters(parseAbiParameters("uint256, uint160[], uint32[], uint256"), [
    amountOut,
    [],
    [],
    100000n,
  ]);
}

function mockQuoteFetch(amountOut: bigint = QUOTE_OUT): typeof fetch {
  return vi.fn(async () => {
    return new Response(JSON.stringify({ result: encodeQuoteResult(amountOut) }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

function baseQuote(over: Partial<SwapQuote> = {}): SwapQuote {
  const now = 1_700_000_000_000;
  return {
    network: "testnet",
    amountInTinybar: ONE_HBAR,
    amountOut: QUOTE_OUT,
    amountOutMinimum: (QUOTE_OUT * 9900n) / 10_000n,
    path: encodeV3Path(WHBAR_TOKEN_ID, 3000, USDC_TOKEN_ID),
    fee: 3000,
    tokenOut: USDC_TOKEN_ID,
    quotedAt: now,
    expiresAt: now + 30_000,
    quoterContractId: V2_QUOTER_ID,
    routerContractId: V2_SWAP_ROUTER_ID,
    ...over,
  };
}

function liveConfig(over: Parameters<typeof createSaucerSwapConfig>[0] = {}) {
  return createSaucerSwapConfig({
    dryRun: false,
    operatorAccountId: "0.0.9001",
    operatorPrivateKey: "0x" + "11".repeat(32),
    ...over,
  });
}

function depsForExecute(over: Partial<SaucerSwapDeps> = {}): SaucerSwapDeps {
  return {
    now: () => 1_700_000_000_000,
    getHbarBalance: async () => 20n * ONE_HBAR,
    getTokenBalance: async () => 0n,
    isTokenAssociated: async () => true,
    broadcast: async () => ({ status: "success", transactionId: "0.0.9001@1.2", amountOut: QUOTE_OUT }),
    waitForConfirmation: async () => true,
    ...over,
  };
}

describe("saucerswap config", () => {
  it("rejects mainnet via loadSaucerSwapConfig", () => {
    expect(() => loadSaucerSwapConfig({ env: { SAUCERSWAP_NETWORK: "mainnet" } })).toThrow(SaucerSwapConfigError);
    expect(() => loadSaucerSwapConfig({ env: { SAUCERSWAP_NETWORK: "hedera:mainnet" } })).toThrow(/rejects mainnet/);
  });

  it("treats DRY_RUN=1 and SAUCERSWAP_DRY_RUN=1 as dryRun", () => {
    expect(loadSaucerSwapConfig({ env: { DRY_RUN: "1" } }).dryRun).toBe(true);
    expect(loadSaucerSwapConfig({ env: { SAUCERSWAP_DRY_RUN: "1" } }).dryRun).toBe(true);
    expect(loadSaucerSwapConfig({ env: {}, dryRun: false }).dryRun).toBe(false);
  });

  it("requires operator account+key as a pair", () => {
    expect(() =>
      loadSaucerSwapConfig({ env: { SAUCERSWAP_OPERATOR_ACCOUNT_ID: "0.0.1" } }),
    ).toThrow(/both SAUCERSWAP_OPERATOR/);
  });

  it("encodes WHBAR→USDC path with fee 3000", () => {
    const path = encodeV3Path(WHBAR_TOKEN_ID, 3000, USDC_TOKEN_ID);
    expect(path).toBe(
      `0x${hederaIdToEvmAddress(WHBAR_TOKEN_ID).slice(2)}000bb8${hederaIdToEvmAddress(USDC_TOKEN_ID).slice(2)}`,
    );
  });
});

describe("saucerswap quote", () => {
  it("returns a valid quote from mocked Mirror QuoterV2", async () => {
    const config = createSaucerSwapConfig({ dryRun: true });
    const result = await quoteHbarToUsdc(
      { amountInTinybar: ONE_HBAR, slippageBps: 100 },
      config,
      { fetch: mockQuoteFetch(), now: () => 1_000 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.amountOut).toBe(QUOTE_OUT);
    expect(result.quote.amountOutMinimum).toBe((QUOTE_OUT * 9900n) / 10_000n);
    expect(result.quote.tokenOut).toBe(USDC_TOKEN_ID);
    expect(result.quote.expiresAt).toBe(1_000 + config.quoteTtlMs);
  });

  it("rejects unsupported token (Circle USDC)", async () => {
    const result = await quoteHbarToUsdc(
      { amountInTinybar: ONE_HBAR, tokenOut: CIRCLE_USDC_TOKEN_ID },
      createSaucerSwapConfig(),
      { fetch: mockQuoteFetch() },
    );
    expect(result).toMatchObject({ ok: false, code: "UNSUPPORTED_TOKEN" });
  });

  it("rejects invalid / over-cap amountIn", async () => {
    const config = createSaucerSwapConfig({ maxSwapHbarTinybar: ONE_HBAR });
    const zero = await quoteHbarToUsdc({ amountInTinybar: 0n }, config, { fetch: mockQuoteFetch() });
    expect(zero).toMatchObject({ ok: false, code: "INVALID_QUOTE" });
    const over = await quoteHbarToUsdc({ amountInTinybar: 2n * ONE_HBAR }, config, { fetch: mockQuoteFetch() });
    expect(over).toMatchObject({ ok: false, code: "INVALID_QUOTE" });
  });

  it("rejects slippage above policy max", async () => {
    const config = createSaucerSwapConfig({ maxSlippageBps: 50 });
    const result = await quoteHbarToUsdc(
      { amountInTinybar: ONE_HBAR, slippageBps: 100 },
      config,
      { fetch: mockQuoteFetch() },
    );
    expect(result).toMatchObject({ ok: false, code: "SLIPPAGE" });
  });

  it("rejects when amountOutMinimum would fall below minUsdcOut", async () => {
    const config = createSaucerSwapConfig({ minUsdcOut: 10_000_000n });
    const result = await quoteHbarToUsdc(
      { amountInTinybar: ONE_HBAR, slippageBps: 0 },
      config,
      { fetch: mockQuoteFetch(100n) },
    );
    expect(result).toMatchObject({ ok: false, code: "MIN_OUT" });
  });

  it("surfaces QuoterV2 failures as QUOTE_FAILED", async () => {
    const fetchFail = vi.fn(async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;
    const result = await quoteHbarToUsdc({ amountInTinybar: ONE_HBAR }, createSaucerSwapConfig(), {
      fetch: fetchFail,
    });
    expect(result).toMatchObject({ ok: false, code: "QUOTE_FAILED" });
  });

  it("validateQuote rejects stale quotes", () => {
    const quote = baseQuote({ expiresAt: 1000 });
    const result = validateQuote(quote, createSaucerSwapConfig(), { now: () => 2000 });
    expect(result).toMatchObject({ ok: false, code: "STALE_QUOTE" });
  });
});

describe("saucerswap affordability", () => {
  it("flags insufficient HBAR and insufficient gas reserve", () => {
    const low = checkHbarAffordability(ONE_HBAR / 2n, ONE_HBAR, ONE_HBAR);
    expect(low.ok).toBe(false);
    if (!low.ok) expect(low.code).toBe("INSUFFICIENT_HBAR");
    const reserve = checkHbarAffordability(ONE_HBAR + ONE_HBAR / 2n, ONE_HBAR, ONE_HBAR);
    expect(reserve.ok).toBe(false);
    if (!reserve.ok) expect(reserve.code).toBe("INSUFFICIENT_RESERVE");
    expect(checkHbarAffordability(3n * ONE_HBAR, ONE_HBAR, ONE_HBAR).ok).toBe(true);
  });
});

describe("saucerswap execute", () => {
  it("DRY_RUN prepares calldata and never broadcasts", async () => {
    const broadcast = vi.fn();
    const config = createSaucerSwapConfig({
      dryRun: true,
      operatorAccountId: "0.0.9001",
      operatorPrivateKey: "0x" + "11".repeat(32),
    });
    const result = await executeHbarToUsdc({ quote: baseQuote() }, config, depsForExecute({ broadcast }));
    expect(result.ok).toBe(true);
    if (!result.ok || !result.dryRun) throw new Error("expected dry-run success");
    expect(result.prepared.functionParameters.byteLength).toBeGreaterThan(4);
    expect(result.prepared.payableTinybar).toBe(ONE_HBAR);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("config.dryRun blocks broadcast even when request.dryRun is false", async () => {
    const broadcast = vi.fn();
    const config = createSaucerSwapConfig({ dryRun: true, operatorAccountId: "0.0.9001" });
    const result = await executeHbarToUsdc({ quote: baseQuote(), dryRun: false }, config, depsForExecute({ broadcast }));
    expect(result.ok && result.dryRun).toBe(true);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("mocked success verifies USDC balance increase", async () => {
    let usdc = 0n;
    const result = await executeHbarToUsdc({ quote: baseQuote() }, liveConfig(), depsForExecute({
      getTokenBalance: async () => {
        const v = usdc;
        usdc = QUOTE_OUT; // after broadcast, balance rises
        return v;
      },
    }));
    expect(result).toMatchObject({
      ok: true,
      dryRun: false,
      transactionId: "0.0.9001@1.2",
    });
  });

  it("mocked broadcast failure returns BROADCAST_FAILED without retry", async () => {
    const broadcast = vi.fn(async () => ({ status: "failed" as const, reason: "CONTRACT_REVERT" }));
    const result = await executeHbarToUsdc({ quote: baseQuote() }, liveConfig(), depsForExecute({ broadcast }));
    expect(result).toMatchObject({ ok: false, code: "BROADCAST_FAILED" });
    expect(broadcast).toHaveBeenCalledTimes(1);
  });

  it("uncertain broadcast does not retry", async () => {
    const broadcast = vi.fn(async () => ({
      status: "uncertain" as const,
      transactionId: "0.0.9001@9.9",
      reason: "timeout",
    }));
    const result = await executeHbarToUsdc({ quote: baseQuote() }, liveConfig(), depsForExecute({ broadcast }));
    expect(result).toMatchObject({ ok: false, code: "BROADCAST_UNCERTAIN", transactionId: "0.0.9001@9.9" });
    expect(broadcast).toHaveBeenCalledTimes(1);
  });

  it("confirmation failure surfaces CONFIRMATION_FAILED", async () => {
    const result = await executeHbarToUsdc(
      { quote: baseQuote() },
      liveConfig(),
      depsForExecute({ waitForConfirmation: async () => false }),
    );
    expect(result).toMatchObject({ ok: false, code: "CONFIRMATION_FAILED" });
  });

  it("USDC verify failure when balance did not increase enough", async () => {
    const result = await executeHbarToUsdc(
      { quote: baseQuote() },
      liveConfig(),
      depsForExecute({ getTokenBalance: async () => 0n }),
    );
    expect(result).toMatchObject({ ok: false, code: "USDC_VERIFY_FAILED" });
  });

  it("rejects insufficient HBAR / reserve before broadcast", async () => {
    const low = await executeHbarToUsdc(
      { quote: baseQuote() },
      liveConfig(),
      depsForExecute({ getHbarBalance: async () => ONE_HBAR / 2n }),
    );
    expect(low).toMatchObject({ ok: false, code: "INSUFFICIENT_HBAR" });

    const reserve = await executeHbarToUsdc(
      { quote: baseQuote() },
      liveConfig({ gasReserveTinybar: 5n * ONE_HBAR }),
      depsForExecute({ getHbarBalance: async () => 2n * ONE_HBAR }),
    );
    expect(reserve).toMatchObject({ ok: false, code: "INSUFFICIENT_RESERVE" });
  });

  it("rejects unsupported token on execute via validateQuote", async () => {
    const result = await executeHbarToUsdc(
      { quote: baseQuote({ tokenOut: CIRCLE_USDC_TOKEN_ID }) },
      liveConfig(),
      depsForExecute(),
    );
    expect(result).toMatchObject({ ok: false, code: "UNSUPPORTED_TOKEN" });
  });

  it("rejects stale quote on execute", async () => {
    const result = await executeHbarToUsdc(
      { quote: baseQuote({ expiresAt: 1 }) },
      liveConfig(),
      depsForExecute({ now: () => 1_700_000_000_000 }),
    );
    expect(result).toMatchObject({ ok: false, code: "STALE_QUOTE" });
  });

  it("rejects when USDC is not associated", async () => {
    const result = await executeHbarToUsdc(
      { quote: baseQuote() },
      liveConfig(),
      depsForExecute({ isTokenAssociated: async () => false }),
    );
    expect(result).toMatchObject({ ok: false, code: "NOT_ASSOCIATED" });
  });

  it("requires operator for live execute", async () => {
    const result = await executeHbarToUsdc(
      { quote: baseQuote() },
      createSaucerSwapConfig({ dryRun: false }),
      depsForExecute(),
    );
    expect(result).toMatchObject({ ok: false, code: "NO_OPERATOR" });
  });
});

describe("saucerswap encoding smoke", () => {
  it("builds quoteExactInput calldata for QuoterV2", () => {
    const path = encodeV3Path(WHBAR_TOKEN_ID, 3000, USDC_TOKEN_ID);
    const data = encodeFunctionData({
      abi: quoterV2Abi,
      functionName: "quoteExactInput",
      args: [path, ONE_HBAR],
    });
    expect(data.startsWith("0x")).toBe(true);
    expect(data.length).toBeGreaterThan(10);
  });
});
