/**
 * HTS token association for the swap operator (required before receiving USDC).
 * Source: https://docs.saucerswap.finance/developers/v2/swap/swap-hbar-for-tokens
 */
import { isTokenAssociated } from "./balance";
import { USDC_TOKEN_ID } from "./config";
import type { SaucerSwapConfig, SaucerSwapDeps, SaucerSwapErrorCode } from "./types";

export type AssociateResult =
  | { ok: true; alreadyAssociated: true }
  | { ok: true; alreadyAssociated: false; dryRun: true; reason: "DRY_RUN: association prepared but not broadcast" }
  | { ok: true; alreadyAssociated: false; dryRun: false; transactionId: string }
  | { ok: false; reason: string; code: SaucerSwapErrorCode; transactionId?: string };

export interface AssociateDeps extends SaucerSwapDeps {
  /**
   * Submit TokenAssociateTransaction. Injected in tests.
   * Must not be called when config.dryRun is true.
   */
  associateBroadcast?: (accountId: string, tokenId: string, config: SaucerSwapConfig) => Promise<{
    status: "success" | "failed" | "uncertain";
    transactionId?: string;
    reason?: string;
  }>;
}

async function defaultAssociateBroadcast(
  accountId: string,
  tokenId: string,
  config: SaucerSwapConfig,
): Promise<{ status: "success" | "failed" | "uncertain"; transactionId?: string; reason?: string }> {
  if (!config.operatorPrivateKey) {
    return { status: "failed", reason: "No swap operator private key configured" };
  }
  try {
    const { Client, PrivateKey, TokenAssociateTransaction, TokenId } = await import("@hashgraph/sdk");
    let key: InstanceType<typeof PrivateKey>;
    try {
      key = PrivateKey.fromStringECDSA(config.operatorPrivateKey.replace(/^0x/, ""));
    } catch {
      key = PrivateKey.fromString(config.operatorPrivateKey);
    }
    const client = Client.forTestnet().setOperator(accountId, key);
    try {
      const tx = await new TokenAssociateTransaction()
        .setAccountId(accountId)
        .setTokenIds([TokenId.fromString(tokenId)])
        .execute(client);
      const txId = tx.transactionId?.toString();
      try {
        const receipt = await tx.getReceipt(client);
        const status = receipt.status?.toString?.() ?? "";
        if (status && status !== "SUCCESS") {
          return { status: "failed", transactionId: txId, reason: `Associate status ${status}` };
        }
      } catch (e) {
        return {
          status: "uncertain",
          transactionId: txId,
          reason: `Association submitted but receipt unavailable: ${(e as Error).message}`,
        };
      }
      return { status: "success", transactionId: txId };
    } finally {
      client.close();
    }
  } catch (e) {
    return { status: "failed", reason: `Association failed: ${(e as Error).message}` };
  }
}

/**
 * Ensure the operator account has associated the output USDC token.
 * When already associated, returns ok without broadcasting.
 * When dryRun and not associated, returns a dry-run success without broadcasting.
 */
export async function ensureUsdcAssociated(
  config: SaucerSwapConfig,
  deps: AssociateDeps = {},
  tokenId: string = USDC_TOKEN_ID,
): Promise<AssociateResult> {
  if (config.network !== "testnet") {
    return { ok: false, code: "MAINNET_REJECTED", reason: "SaucerSwap library rejects mainnet; testnet only" };
  }
  if (!config.operatorAccountId) {
    return { ok: false, code: "NO_OPERATOR", reason: "Set SAUCERSWAP_OPERATOR_ACCOUNT_ID to associate USDC" };
  }

  const accountId = config.operatorAccountId;
  const associated = await isTokenAssociated(accountId, tokenId, config, deps);
  if (associated) return { ok: true, alreadyAssociated: true };

  if (config.dryRun) {
    return {
      ok: true,
      alreadyAssociated: false,
      dryRun: true,
      reason: "DRY_RUN: association prepared but not broadcast",
    };
  }

  if (!config.operatorPrivateKey) {
    return { ok: false, code: "NO_OPERATOR", reason: "Set SAUCERSWAP_OPERATOR_PRIVATE_KEY to associate USDC" };
  }

  const broadcast = deps.associateBroadcast ?? defaultAssociateBroadcast;
  const result = await broadcast(accountId, tokenId, config);
  if (result.status === "uncertain") {
    return {
      ok: false,
      code: "BROADCAST_UNCERTAIN",
      reason: result.reason ?? "Association outcome uncertain; not retrying",
      transactionId: result.transactionId,
    };
  }
  if (result.status !== "success" || !result.transactionId) {
    return {
      ok: false,
      code: "ASSOCIATE_FAILED",
      reason: result.reason ?? "Token association failed",
      transactionId: result.transactionId,
    };
  }
  return { ok: true, alreadyAssociated: false, dryRun: false, transactionId: result.transactionId };
}
