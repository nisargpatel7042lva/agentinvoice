/**
 * SaucerSwap HBAR→USDC helpers for Hedera testnet.
 *
 * Import from "@invoiceagent/shared/saucerswap" (agents/scripts/backend only).
 * Do not import from the main "@invoiceagent/shared" entry — this module pulls
 * @hashgraph/sdk on the execute/associate path and must not ship in the web bundle.
 *
 * For web-safe token labels, import SAUCERSWAP_TESTNET_USDC from "@invoiceagent/shared".
 */
export {
  WHBAR_TOKEN_ID,
  WHBAR_CONTRACT_ID,
  WHBAR_HELPER_ID,
  V2_SWAP_ROUTER_ID,
  V2_QUOTER_ID,
  USDC_TOKEN_ID,
  CIRCLE_USDC_TOKEN_ID,
  DEFAULT_POOL_FEE,
  USDC_DECIMALS,
  DEFAULT_MIRROR_NODE_URL,
  DEFAULT_REST_API_URL,
  DEFAULT_RPC_URL,
  DEFAULT_POLICY,
  DEFAULT_GAS_LIMIT,
  DEFAULT_DEADLINE_SECONDS,
  SaucerSwapConfigError,
  loadSaucerSwapConfig,
  createSaucerSwapConfig,
  isSupportedUsdcToken,
  hederaIdToEvmAddress,
  encodeV3Path,
  applySlippage,
} from "./config";

export { quoteHbarToUsdc, validateQuote } from "./quote";
export {
  getHbarBalance,
  getTokenBalance,
  isTokenAssociated,
  checkHbarAffordability,
} from "./balance";
export {
  encodeExactInputMulticall,
  decodeMulticallAmountOut,
  prepareSwap,
  executeHbarToUsdc,
  swapHbarToUsdc,
  defaultBroadcast,
} from "./swap";
export { ensureUsdcAssociated } from "./associate";
export { getSaucerSwapStatus } from "./status";

export type {
  SaucerSwapNetwork,
  SaucerSwapErrorCode,
  SaucerSwapPolicy,
  SaucerSwapConfig,
  QuoteRequest,
  SwapQuote,
  QuoteResult,
  PreparedSwap,
  BroadcastStatus,
  BroadcastResult,
  ExecuteResult,
  SaucerSwapDeps,
  ExecuteRequest,
} from "./types";
export type { AssociateResult, AssociateDeps } from "./associate";
export type { SaucerSwapStatus } from "./status";
export type { SwapHbarToUsdcRequest } from "./swap";
