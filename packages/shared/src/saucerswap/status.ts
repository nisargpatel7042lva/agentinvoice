/**
 * Read-only operator / token status for UI and CLI (no private keys required for balances).
 */
import { SAUCERSWAP_TESTNET_USDC } from "../usdc";
import { getHbarBalance, getTokenBalance, isTokenAssociated } from "./balance";
import { CIRCLE_USDC_TOKEN_ID, USDC_TOKEN_ID, V2_QUOTER_ID, V2_SWAP_ROUTER_ID, WHBAR_TOKEN_ID } from "./config";
import type { SaucerSwapConfig, SaucerSwapDeps } from "./types";

export interface SaucerSwapStatus {
  network: "testnet";
  usdc: {
    tokenId: string;
    symbol: string;
    decimals: number;
    label: string;
    caveat: string;
    circleOfficialTokenId: string;
  };
  contracts: {
    whbarTokenId: string;
    quoterV2: string;
    swapRouter: string;
  };
  operator?: {
    accountId: string;
    hbarTinybar: string;
    usdcBaseUnits: string;
    usdcAssociated: boolean;
  };
  dryRun: boolean;
}

export async function getSaucerSwapStatus(
  config: SaucerSwapConfig,
  deps: SaucerSwapDeps = {},
): Promise<SaucerSwapStatus> {
  const base: SaucerSwapStatus = {
    network: "testnet",
    usdc: {
      tokenId: USDC_TOKEN_ID,
      symbol: SAUCERSWAP_TESTNET_USDC.symbol,
      decimals: SAUCERSWAP_TESTNET_USDC.decimals,
      label: SAUCERSWAP_TESTNET_USDC.label,
      caveat: SAUCERSWAP_TESTNET_USDC.caveat,
      circleOfficialTokenId: CIRCLE_USDC_TOKEN_ID,
    },
    contracts: {
      whbarTokenId: WHBAR_TOKEN_ID,
      quoterV2: V2_QUOTER_ID,
      swapRouter: V2_SWAP_ROUTER_ID,
    },
    dryRun: config.dryRun,
  };

  if (!config.operatorAccountId) return base;

  const accountId = config.operatorAccountId;
  const [hbarTinybar, usdcBaseUnits, usdcAssociated] = await Promise.all([
    getHbarBalance(accountId, config, deps),
    getTokenBalance(accountId, USDC_TOKEN_ID, config, deps),
    isTokenAssociated(accountId, USDC_TOKEN_ID, config, deps),
  ]);

  return {
    ...base,
    operator: {
      accountId,
      hbarTinybar: hbarTinybar.toString(),
      usdcBaseUnits: usdcBaseUnits.toString(),
      usdcAssociated,
    },
  };
}
