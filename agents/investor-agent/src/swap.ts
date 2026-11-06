/**
 * Optional HBAR→USDC treasury swap via @invoiceagent/shared/saucerswap.
 * Uses dedicated SAUCERSWAP_OPERATOR_* keys — never the investor invoice key by default.
 */
import { TINYBAR_PER_HBAR, parseUnits } from "@invoiceagent/shared";
import {
  createSaucerSwapConfig,
  getHbarBalance,
  loadSaucerSwapConfig,
  swapHbarToUsdc,
  type ExecuteResult,
  type SaucerSwapConfig,
  type SaucerSwapDeps,
} from "@invoiceagent/shared/saucerswap";

export interface InvestorSwapRules {
  enabled: boolean;
  /** HBAR (tinybar) to swap per attempt when balance allows. */
  swapAmountTinybar: bigint;
  /** Keep at least this much HBAR (tinybar) on the operator after the swap. */
  keepHbarTinybar: bigint;
}

export function swapRulesFromEnv(env: Record<string, string | undefined> = process.env): InvestorSwapRules {
  const enabled = env.SAUCERSWAP_ENABLE_AGENT_SWAP === "1";
  const swapAmountTinybar = env.SAUCERSWAP_SWAP_HBAR?.trim()
    ? parseUnits(env.SAUCERSWAP_SWAP_HBAR.trim(), 8)
    : 1n * TINYBAR_PER_HBAR;
  const keepHbarTinybar = env.SAUCERSWAP_KEEP_HBAR?.trim()
    ? parseUnits(env.SAUCERSWAP_KEEP_HBAR.trim(), 8)
    : 10n * TINYBAR_PER_HBAR;
  return { enabled, swapAmountTinybar, keepHbarTinybar };
}

export function loadInvestorSwapConfig(env: Record<string, string | undefined> = process.env): SaucerSwapConfig | null {
  if (env.SAUCERSWAP_ENABLE_AGENT_SWAP !== "1") return null;
  try {
    return loadSaucerSwapConfig({ env });
  } catch {
    // Fall back to explicit create when env is incomplete in tests.
    if (!env.SAUCERSWAP_OPERATOR_ACCOUNT_ID) return null;
    return createSaucerSwapConfig({
      dryRun: env.DRY_RUN === "1" || env.SAUCERSWAP_DRY_RUN === "1",
      operatorAccountId: env.SAUCERSWAP_OPERATOR_ACCOUNT_ID,
      operatorPrivateKey: env.SAUCERSWAP_OPERATOR_PRIVATE_KEY,
    });
  }
}

export type SwapOnceResult =
  | { action: "disabled" }
  | { action: "skipped"; reason: string }
  | { action: "swapped"; result: ExecuteResult };

/**
 * Swap excess operator HBAR → SaucerSwap testnet USDC when enabled and affordable.
 * Respects dry-run and association (associateIfNeeded).
 */
export async function maybeSwapExcessHbarToUsdc(
  config: SaucerSwapConfig,
  rules: InvestorSwapRules,
  deps: SaucerSwapDeps = {},
  log: (line: string) => void = console.log,
): Promise<SwapOnceResult> {
  if (!rules.enabled) return { action: "disabled" };
  if (!config.operatorAccountId) {
    return { action: "skipped", reason: "no SAUCERSWAP_OPERATOR_ACCOUNT_ID" };
  }

  const balance = await getHbarBalance(config.operatorAccountId, config, deps);
  const needed = rules.swapAmountTinybar + rules.keepHbarTinybar;
  if (balance < needed) {
    const reason = `operator HBAR ${balance} < swap+keep ${needed}`;
    log(`saucerswap skipped reason="${reason}"`);
    return { action: "skipped", reason };
  }

  const result = await swapHbarToUsdc(
    {
      amountInTinybar: rules.swapAmountTinybar,
      associateIfNeeded: true,
    },
    config,
    deps,
  );

  if (!result.ok) {
    log(`saucerswap failed code=${result.code} reason="${result.reason}"`);
    return { action: "swapped", result };
  }
  if (result.dryRun) {
    log(`saucerswap dry-run would swap amountIn=${rules.swapAmountTinybar} tinybar`);
  } else {
    log(`saucerswap swapped amountOut=${result.amountOut} tx=${result.transactionId}`);
  }
  return { action: "swapped", result };
}
