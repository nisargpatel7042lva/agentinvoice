/**
 * Display metadata for Hedera testnet USDC used by Invoice Agent / SaucerSwap.
 * Safe for the web bundle (no Hedera SDK).
 *
 * Invoice market contracts still settle in native HBAR. This describes the
 * optional SaucerSwap treasury token agents may hold after an HBAR→USDC swap.
 */
export const SAUCERSWAP_TESTNET_USDC = {
  /** SaucerSwap-listed testnet USDC (swap target). */
  tokenId: "0.0.5449",
  decimals: 6,
  symbol: "USDC",
  label: "SaucerSwap testnet USDC",
  /**
   * Circle's official Hedera testnet USDC. Exists as an HTS token but is NOT
   * listed on SaucerSwap testnet (no pool / QuoterV2 reverts). Do not use as a
   * swap target until SaucerSwap lists it.
   */
  circleOfficialTokenId: "0.0.429274",
  caveat:
    "SaucerSwap testnet USDC (0.0.5449) is not Circle's official testnet USDC (0.0.429274). Circle's token has no SaucerSwap testnet pool.",
} as const;

export type SaucerSwapTestnetUsdc = typeof SAUCERSWAP_TESTNET_USDC;
