/**
 * QuoterV2 quoteExactInput via Mirror Node contracts/call (no gas, no spend).
 * Source: https://docs.saucerswap.finance/developers/v2/swap/swap-quote
 */
import { decodeFunctionResult, encodeFunctionData, type Hex } from "viem";
import { quoterV2Abi } from "./abi";
import {
  applySlippage,
  DEFAULT_POOL_FEE,
  encodeV3Path,
  hederaIdToEvmAddress,
  isSupportedUsdcToken,
  USDC_TOKEN_ID,
  V2_QUOTER_ID,
  V2_SWAP_ROUTER_ID,
  WHBAR_TOKEN_ID,
} from "./config";
import type { QuoteRequest, QuoteResult, SaucerSwapConfig, SaucerSwapDeps, SaucerSwapErrorCode, SwapQuote } from "./types";

function fail(code: SaucerSwapErrorCode, reason: string): QuoteResult {
  return { ok: false, code, reason };
}

async function mirrorContractCall(
  config: SaucerSwapConfig,
  deps: SaucerSwapDeps,
  toContractId: string,
  data: Hex,
): Promise<Hex> {
  const f = deps.fetch ?? fetch;
  const to = hederaIdToEvmAddress(toContractId).slice(2); // Mirror expects solidity address without 0x
  const url = `${config.mirrorNodeUrl}/api/v1/contracts/call`;
  const res = await f(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ block: "latest", data, to }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Mirror contracts/call HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { result?: string; _status?: { messages?: { message?: string }[] } };
  if (!json.result || typeof json.result !== "string") {
    const msg = json._status?.messages?.[0]?.message ?? "missing result";
    throw new Error(`Mirror contracts/call failed: ${msg}`);
  }
  return (json.result.startsWith("0x") ? json.result : `0x${json.result}`) as Hex;
}

export async function quoteHbarToUsdc(
  request: QuoteRequest,
  config: SaucerSwapConfig,
  deps: SaucerSwapDeps = {},
): Promise<QuoteResult> {
  if (config.network !== "testnet") {
    return fail("MAINNET_REJECTED", "SaucerSwap library rejects mainnet; testnet only");
  }

  const tokenOut = (request.tokenOut ?? USDC_TOKEN_ID).trim();
  if (!isSupportedUsdcToken(tokenOut)) {
    return fail(
      "UNSUPPORTED_TOKEN",
      `Unsupported output token ${tokenOut}; only SaucerSwap-listed testnet USDC ${USDC_TOKEN_ID} is allowed`,
    );
  }

  if (request.amountInTinybar <= 0n) {
    return fail("INVALID_QUOTE", "amountInTinybar must be positive");
  }
  if (request.amountInTinybar > config.maxSwapHbarTinybar) {
    return fail(
      "INVALID_QUOTE",
      `amountInTinybar ${request.amountInTinybar} exceeds maxSwapHbarTinybar ${config.maxSwapHbarTinybar}`,
    );
  }

  const slippageBps = request.slippageBps ?? config.maxSlippageBps;
  if (!Number.isInteger(slippageBps) || slippageBps < 0) {
    return fail("SLIPPAGE", `Invalid slippageBps: ${slippageBps}`);
  }
  if (slippageBps > config.maxSlippageBps) {
    return fail("SLIPPAGE", `slippageBps ${slippageBps} exceeds maxSlippageBps ${config.maxSlippageBps}`);
  }

  const fee = request.fee ?? DEFAULT_POOL_FEE;
  const path = encodeV3Path(WHBAR_TOKEN_ID, fee, tokenOut);
  const calldata = encodeFunctionData({
    abi: quoterV2Abi,
    functionName: "quoteExactInput",
    args: [path, request.amountInTinybar],
  });

  let amountOut: bigint;
  try {
    const raw = await mirrorContractCall(config, deps, V2_QUOTER_ID, calldata);
    const decoded = decodeFunctionResult({
      abi: quoterV2Abi,
      functionName: "quoteExactInput",
      data: raw,
    });
    amountOut = decoded[0];
  } catch (e) {
    return fail("QUOTE_FAILED", `QuoterV2 call failed: ${(e as Error).message}`);
  }

  if (amountOut <= 0n) {
    return fail("INVALID_QUOTE", "QuoterV2 returned zero amountOut");
  }

  const amountOutMinimum = applySlippage(amountOut, slippageBps);
  if (amountOutMinimum < config.minUsdcOut) {
    return fail(
      "MIN_OUT",
      `amountOutMinimum ${amountOutMinimum} is below minUsdcOut ${config.minUsdcOut}`,
    );
  }

  const now = deps.now?.() ?? Date.now();
  const quote: SwapQuote = {
    network: "testnet",
    amountInTinybar: request.amountInTinybar,
    amountOut,
    amountOutMinimum,
    path,
    fee,
    tokenOut,
    quotedAt: now,
    expiresAt: now + config.quoteTtlMs,
    quoterContractId: V2_QUOTER_ID,
    routerContractId: V2_SWAP_ROUTER_ID,
  };
  return { ok: true, quote };
}

/** Structural + policy checks before execute. */
export function validateQuote(
  quote: SwapQuote,
  config: SaucerSwapConfig,
  deps: SaucerSwapDeps = {},
): QuoteResult {
  if (config.network !== "testnet" || quote.network !== "testnet") {
    return fail("MAINNET_REJECTED", "SaucerSwap library rejects mainnet; testnet only");
  }
  if (!isSupportedUsdcToken(quote.tokenOut)) {
    return fail("UNSUPPORTED_TOKEN", `Unsupported output token ${quote.tokenOut}`);
  }
  if (quote.amountInTinybar <= 0n || quote.amountOut <= 0n) {
    return fail("INVALID_QUOTE", "Quote amounts must be positive");
  }
  if (quote.amountInTinybar > config.maxSwapHbarTinybar) {
    return fail("INVALID_QUOTE", `Quote amountIn exceeds maxSwapHbarTinybar`);
  }
  if (quote.amountOutMinimum < config.minUsdcOut) {
    return fail("MIN_OUT", `Quote amountOutMinimum below minUsdcOut ${config.minUsdcOut}`);
  }
  if (quote.amountOutMinimum > quote.amountOut) {
    return fail("INVALID_QUOTE", "amountOutMinimum cannot exceed amountOut");
  }
  // Implied slippage from quote must not exceed policy max.
  if (quote.amountOut > 0n) {
    const bpsUsed = Number(((quote.amountOut - quote.amountOutMinimum) * 10_000n) / quote.amountOut);
    if (bpsUsed > config.maxSlippageBps) {
      return fail("SLIPPAGE", `Quote slippage ${bpsUsed} bps exceeds max ${config.maxSlippageBps}`);
    }
  }
  const now = deps.now?.() ?? Date.now();
  if (now > quote.expiresAt) {
    return fail("STALE_QUOTE", `Quote expired at ${quote.expiresAt} (now ${now})`);
  }
  if (quote.routerContractId !== V2_SWAP_ROUTER_ID || quote.quoterContractId !== V2_QUOTER_ID) {
    return fail("INVALID_QUOTE", "Quote references unexpected router/quoter contract ids");
  }
  return { ok: true, quote };
}
