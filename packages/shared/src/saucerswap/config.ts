/**
 * SaucerSwap testnet constants and env loading.
 *
 * Sources (Phase 1 validation, 2026-11-06):
 * - WHBAR / routers / QuoterV2: https://docs.saucerswap.finance/developers/contracts
 * - USDC 0.0.5449: https://test-api.saucerswap.finance/tokens/0.0.5449 (+ Mirror Node)
 * - Fee 3000 pool WHBAR/USDC: https://test-api.saucerswap.finance/v2/pools (observed 0.0.9283328)
 * - Mirror: https://testnet.mirrornode.hedera.com
 * - REST: https://test-api.saucerswap.finance
 *
 * Circle official testnet USDC 0.0.429274 is NOT supported (no SaucerSwap pool).
 * Mainnet is rejected.
 */
import { parseUnits, TINYBAR_PER_HBAR } from "../units";
import { hederaTestnet } from "../chain";
import type { SaucerSwapConfig, SaucerSwapNetwork, SaucerSwapPolicy } from "./types";

/** WHBAR HTS token id (use in V2 paths wherever HBAR appears). */
export const WHBAR_TOKEN_ID = "0.0.15058";
/** WHBAR contract id (reference; do not approve WHBAR directly — use WhbarHelper for manual wrap). */
export const WHBAR_CONTRACT_ID = "0.0.15057";
/** WhbarHelper — only safe entry for manual wrap/unwrap. */
export const WHBAR_HELPER_ID = "0.0.5286055";
/** SaucerSwap V2 SwapRouter (testnet). */
export const V2_SWAP_ROUTER_ID = "0.0.1414040";
/** SaucerSwap V2 QuoterV2 (testnet). */
export const V2_QUOTER_ID = "0.0.1390002";
/**
 * SaucerSwap-listed testnet USDC stand-in (NOT Circle 0.0.429274).
 * Decimals: 6.
 */
export const USDC_TOKEN_ID = "0.0.5449";
/** Explicitly unsupported — Circle official testnet USDC with no SaucerSwap pool. */
export const CIRCLE_USDC_TOKEN_ID = "0.0.429274";
/** Observed liquid V2 fee tier for WHBAR/USDC (0.30%). */
export const DEFAULT_POOL_FEE = 3000;
export const USDC_DECIMALS = 6;
export const HBAR_DECIMALS = 8;

export const DEFAULT_MIRROR_NODE_URL = "https://testnet.mirrornode.hedera.com";
export const DEFAULT_REST_API_URL = "https://test-api.saucerswap.finance";
export const DEFAULT_RPC_URL = hederaTestnet.rpcUrl;

export const DEFAULT_POLICY: SaucerSwapPolicy = {
  maxSwapHbarTinybar: 10n * TINYBAR_PER_HBAR, // 10 HBAR
  maxSlippageBps: 100, // 1%
  minUsdcOut: 1n, // at least 1 base unit
  gasReserveTinybar: 1n * TINYBAR_PER_HBAR, // 1 HBAR left for fees
  quoteTtlMs: 30_000,
};

export const DEFAULT_GAS_LIMIT = 400_000;
export const DEFAULT_DEADLINE_SECONDS = 600;

export class SaucerSwapConfigError extends Error {
  readonly code = "CONFIG_INVALID" as const;
  constructor(message: string) {
    super(message);
    this.name = "SaucerSwapConfigError";
  }
}

function blank(value: string | undefined): string | undefined {
  const t = value?.trim();
  return t ? t : undefined;
}

function parseNetwork(raw: string | undefined): SaucerSwapNetwork {
  const v = (raw ?? "testnet").trim().toLowerCase();
  if (v === "mainnet" || v === "hedera:mainnet" || v === "mainnet-public") {
    throw new SaucerSwapConfigError("SaucerSwap library rejects mainnet; testnet only");
  }
  if (v !== "testnet" && v !== "hedera:testnet") {
    throw new SaucerSwapConfigError(`Unsupported SAUCERSWAP_NETWORK=${raw}; only testnet is allowed`);
  }
  return "testnet";
}

function parseHbarToTinybar(raw: string | undefined, fallback: bigint, label: string): bigint {
  if (!raw?.trim()) return fallback;
  try {
    return parseUnits(raw.trim(), HBAR_DECIMALS);
  } catch {
    throw new SaucerSwapConfigError(`Invalid ${label}: ${raw}`);
  }
}

function parseBigIntEnv(raw: string | undefined, fallback: bigint, label: string): bigint {
  if (!raw?.trim()) return fallback;
  try {
    const n = BigInt(raw.trim());
    if (n < 0n) throw new Error("negative");
    return n;
  } catch {
    throw new SaucerSwapConfigError(`Invalid ${label}: ${raw}`);
  }
}

function parseIntEnv(raw: string | undefined, fallback: number, label: string): number {
  if (!raw?.trim()) return fallback;
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n < 0) throw new SaucerSwapConfigError(`Invalid ${label}: ${raw}`);
  return n;
}

export interface LoadSaucerSwapConfigOptions {
  env?: Record<string, string | undefined>;
  /** Override dry-run regardless of DRY_RUN / SAUCERSWAP_DRY_RUN. */
  dryRun?: boolean;
}

/**
 * Load config from env (names only documented in `.env.example`).
 * Uses dedicated SAUCERSWAP_OPERATOR_* — does not fall back to investor/supplier/HCS keys.
 */
export function loadSaucerSwapConfig(opts: LoadSaucerSwapConfigOptions = {}): SaucerSwapConfig {
  const env = opts.env ?? (typeof process !== "undefined" ? process.env : {});
  const network = parseNetwork(blank(env.SAUCERSWAP_NETWORK));

  const dryRunEnv = blank(env.SAUCERSWAP_DRY_RUN) === "1" || blank(env.DRY_RUN) === "1";
  const dryRun = opts.dryRun ?? dryRunEnv;

  const operatorAccountId = blank(env.SAUCERSWAP_OPERATOR_ACCOUNT_ID);
  const operatorPrivateKey = blank(env.SAUCERSWAP_OPERATOR_PRIVATE_KEY);
  if ((operatorAccountId && !operatorPrivateKey) || (!operatorAccountId && operatorPrivateKey)) {
    throw new SaucerSwapConfigError(
      "Set both SAUCERSWAP_OPERATOR_ACCOUNT_ID and SAUCERSWAP_OPERATOR_PRIVATE_KEY, or neither",
    );
  }

  return {
    network,
    dryRun,
    mirrorNodeUrl: (blank(env.SAUCERSWAP_MIRROR_NODE_URL) ?? DEFAULT_MIRROR_NODE_URL).replace(/\/$/, ""),
    rpcUrl: blank(env.SAUCERSWAP_RPC_URL) ?? blank(env.HEDERA_TESTNET_RPC_URL) ?? DEFAULT_RPC_URL,
    restApiUrl: (blank(env.SAUCERSWAP_REST_API_URL) ?? DEFAULT_REST_API_URL).replace(/\/$/, ""),
    operatorAccountId,
    operatorPrivateKey,
    maxSwapHbarTinybar: parseHbarToTinybar(env.SAUCERSWAP_MAX_SWAP_HBAR, DEFAULT_POLICY.maxSwapHbarTinybar, "SAUCERSWAP_MAX_SWAP_HBAR"),
    maxSlippageBps: parseIntEnv(env.SAUCERSWAP_MAX_SLIPPAGE_BPS, DEFAULT_POLICY.maxSlippageBps, "SAUCERSWAP_MAX_SLIPPAGE_BPS"),
    minUsdcOut: parseBigIntEnv(env.SAUCERSWAP_MIN_USDC_OUT, DEFAULT_POLICY.minUsdcOut, "SAUCERSWAP_MIN_USDC_OUT"),
    gasReserveTinybar: parseHbarToTinybar(env.SAUCERSWAP_GAS_RESERVE_HBAR, DEFAULT_POLICY.gasReserveTinybar, "SAUCERSWAP_GAS_RESERVE_HBAR"),
    quoteTtlMs: parseIntEnv(env.SAUCERSWAP_QUOTE_TTL_MS, DEFAULT_POLICY.quoteTtlMs, "SAUCERSWAP_QUOTE_TTL_MS"),
    gasLimit: parseIntEnv(env.SAUCERSWAP_GAS_LIMIT, DEFAULT_GAS_LIMIT, "SAUCERSWAP_GAS_LIMIT"),
    deadlineSeconds: parseIntEnv(env.SAUCERSWAP_DEADLINE_SECONDS, DEFAULT_DEADLINE_SECONDS, "SAUCERSWAP_DEADLINE_SECONDS"),
  };
}

/** Build a config object without reading process.env (tests / callers). */
export function createSaucerSwapConfig(partial: Partial<SaucerSwapConfig> & { network?: SaucerSwapNetwork } = {}): SaucerSwapConfig {
  if (partial.network && partial.network !== "testnet") {
    throw new SaucerSwapConfigError("SaucerSwap library rejects mainnet; testnet only");
  }
  return {
    network: "testnet",
    dryRun: partial.dryRun ?? true,
    mirrorNodeUrl: partial.mirrorNodeUrl ?? DEFAULT_MIRROR_NODE_URL,
    rpcUrl: partial.rpcUrl ?? DEFAULT_RPC_URL,
    restApiUrl: partial.restApiUrl ?? DEFAULT_REST_API_URL,
    operatorAccountId: partial.operatorAccountId,
    operatorPrivateKey: partial.operatorPrivateKey,
    maxSwapHbarTinybar: partial.maxSwapHbarTinybar ?? DEFAULT_POLICY.maxSwapHbarTinybar,
    maxSlippageBps: partial.maxSlippageBps ?? DEFAULT_POLICY.maxSlippageBps,
    minUsdcOut: partial.minUsdcOut ?? DEFAULT_POLICY.minUsdcOut,
    gasReserveTinybar: partial.gasReserveTinybar ?? DEFAULT_POLICY.gasReserveTinybar,
    quoteTtlMs: partial.quoteTtlMs ?? DEFAULT_POLICY.quoteTtlMs,
    gasLimit: partial.gasLimit ?? DEFAULT_GAS_LIMIT,
    deadlineSeconds: partial.deadlineSeconds ?? DEFAULT_DEADLINE_SECONDS,
  };
}

export function isSupportedUsdcToken(tokenId: string): boolean {
  return tokenId.trim() === USDC_TOKEN_ID;
}

/** Hedera entity id `0.0.N` → 20-byte EVM address (no SDK dependency). */
export function hederaIdToEvmAddress(id: string): `0x${string}` {
  const parts = id.trim().split(".");
  if (parts.length !== 3 || parts[0] !== "0" || parts[1] !== "0" || !/^\d+$/.test(parts[2]!)) {
    throw new SaucerSwapConfigError(`Invalid Hedera token/contract id: ${id}`);
  }
  return `0x${BigInt(parts[2]!).toString(16).padStart(40, "0")}` as `0x${string}`;
}

/** Uniswap V3-style packed path: tokenIn (20) || fee (3) || tokenOut (20). */
export function encodeV3Path(tokenInId: string, fee: number, tokenOutId: string): `0x${string}` {
  if (!Number.isInteger(fee) || fee < 0 || fee > 0xffffff) {
    throw new SaucerSwapConfigError(`Invalid pool fee: ${fee}`);
  }
  const a = hederaIdToEvmAddress(tokenInId).slice(2);
  const b = hederaIdToEvmAddress(tokenOutId).slice(2);
  const feeHex = fee.toString(16).padStart(6, "0");
  return `0x${a}${feeHex}${b}`;
}

export function applySlippage(amountOut: bigint, slippageBps: number): bigint {
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 10_000) {
    throw new SaucerSwapConfigError(`Invalid slippage bps: ${slippageBps}`);
  }
  return (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
}
