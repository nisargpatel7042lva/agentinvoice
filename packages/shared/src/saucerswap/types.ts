/**
 * SaucerSwap HBAR→USDC library types (Hedera testnet only).
 * Import from "@invoiceagent/shared/saucerswap" — not the main package entry.
 */

export type SaucerSwapNetwork = "testnet";

export type SaucerSwapErrorCode =
  | "MAINNET_REJECTED"
  | "UNSUPPORTED_TOKEN"
  | "INVALID_QUOTE"
  | "STALE_QUOTE"
  | "INSUFFICIENT_HBAR"
  | "INSUFFICIENT_RESERVE"
  | "SLIPPAGE"
  | "MIN_OUT"
  | "QUOTE_FAILED"
  | "NO_OPERATOR"
  | "NOT_ASSOCIATED"
  | "BROADCAST_FAILED"
  | "BROADCAST_UNCERTAIN"
  | "CONFIRMATION_FAILED"
  | "USDC_VERIFY_FAILED"
  | "CONFIG_INVALID";

export interface SaucerSwapPolicy {
  /** Cap on HBAR spent per swap, in tinybar. */
  maxSwapHbarTinybar: bigint;
  /** Maximum allowed slippage in basis points (100 = 1%). */
  maxSlippageBps: number;
  /** Absolute floor for amountOutMinimum (USDC 6-decimal base units). */
  minUsdcOut: bigint;
  /** HBAR (tinybar) that must remain after the swap for fees. */
  gasReserveTinybar: bigint;
  /** Quote validity window from quotedAt. */
  quoteTtlMs: number;
}

export interface SaucerSwapConfig extends SaucerSwapPolicy {
  network: SaucerSwapNetwork;
  mirrorNodeUrl: string;
  rpcUrl: string;
  restApiUrl: string;
  /** When true, execute prepares a swap but never broadcasts. */
  dryRun: boolean;
  /** Dedicated swap operator. Optional for quote-only use. */
  operatorAccountId?: string;
  operatorPrivateKey?: string;
  /** Gas limit for ContractExecuteTransaction. */
  gasLimit: number;
  /** Deadline offset from now for router exactInput (seconds). */
  deadlineSeconds: number;
}

export interface QuoteRequest {
  /** Exact HBAR input in tinybar. */
  amountInTinybar: bigint;
  /** Must be SaucerSwap-listed testnet USDC `0.0.5449` (or omit for default). */
  tokenOut?: string;
  /** Requested slippage; must be ≤ policy maxSlippageBps. */
  slippageBps?: number;
  /** Pool fee tier; default 3000 (0.30%). */
  fee?: number;
}

export interface SwapQuote {
  network: SaucerSwapNetwork;
  amountInTinybar: bigint;
  /** Expected USDC out from QuoterV2 (6 decimals). */
  amountOut: bigint;
  /** amountOut after slippage (passed to exactInput). */
  amountOutMinimum: bigint;
  /** Packed V3 path WHBAR → fee → USDC. */
  path: `0x${string}`;
  fee: number;
  tokenOut: string;
  quotedAt: number;
  expiresAt: number;
  quoterContractId: string;
  routerContractId: string;
}

export type QuoteResult =
  | { ok: true; quote: SwapQuote }
  | { ok: false; reason: string; code: SaucerSwapErrorCode };

export interface PreparedSwap {
  routerContractId: string;
  payableTinybar: bigint;
  gasLimit: number;
  /** ABI-encoded multicall(exactInput, refundETH) calldata. */
  functionParameters: Uint8Array;
  quote: SwapQuote;
  recipientAccountId: string;
  recipientEvmAddress: `0x${string}`;
  deadline: number;
}

export type BroadcastStatus = "success" | "failed" | "uncertain";

export interface BroadcastResult {
  status: BroadcastStatus;
  transactionId?: string;
  /** Decoded amountOut from contract result when available. */
  amountOut?: bigint;
  reason?: string;
}

export type ExecuteResult =
  | {
      ok: true;
      dryRun: true;
      prepared: PreparedSwap;
      reason: "DRY_RUN: swap prepared but not broadcast";
    }
  | {
      ok: true;
      dryRun: false;
      transactionId: string;
      amountOut: bigint;
      usdcBalanceBefore: bigint;
      usdcBalanceAfter: bigint;
    }
  | { ok: false; reason: string; code: SaucerSwapErrorCode; transactionId?: string };

/** Injectable seams for Vitest (no funded key / live network required). */
export interface SaucerSwapDeps {
  fetch?: typeof fetch;
  now?: () => number;
  getHbarBalance?: (accountId: string) => Promise<bigint>;
  getTokenBalance?: (accountId: string, tokenId: string) => Promise<bigint>;
  isTokenAssociated?: (accountId: string, tokenId: string) => Promise<boolean>;
  /**
   * Broadcast a prepared ContractExecuteTransaction.
   * Must not be called when dryRun is true.
   * On uncertain consensus / unknown receipt: return status "uncertain" — callers must not retry blindly.
   */
  broadcast?: (prepared: PreparedSwap, config: SaucerSwapConfig) => Promise<BroadcastResult>;
  waitForConfirmation?: (transactionId: string, config: SaucerSwapConfig) => Promise<boolean>;
}

export interface ExecuteRequest {
  quote: SwapQuote;
  /** Override dry-run for this call; still blocked if config.dryRun is true. */
  dryRun?: boolean;
}
