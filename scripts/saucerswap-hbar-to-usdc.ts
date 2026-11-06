#!/usr/bin/env tsx
/**
 * Operator CLI for SaucerSwap HBAR→USDC on Hedera testnet.
 *
 * Usage:
 *   bunx tsx --env-file-if-exists=.env scripts/saucerswap-hbar-to-usdc.ts status
 *   bunx tsx --env-file-if-exists=.env scripts/saucerswap-hbar-to-usdc.ts quote [hbar]
 *   bunx tsx --env-file-if-exists=.env scripts/saucerswap-hbar-to-usdc.ts associate
 *   bunx tsx --env-file-if-exists=.env scripts/saucerswap-hbar-to-usdc.ts swap [hbar]
 *
 * Live broadcast requires SAUCERSWAP_OPERATOR_* and DRY_RUN / SAUCERSWAP_DRY_RUN unset (not "1").
 * Token: SaucerSwap testnet USDC 0.0.5449 (NOT Circle 0.0.429274).
 */
import { formatUnits, parseUnits, SAUCERSWAP_TESTNET_USDC, TINYBAR_PER_HBAR } from "@invoiceagent/shared";
import {
  ensureUsdcAssociated,
  getSaucerSwapStatus,
  loadSaucerSwapConfig,
  quoteHbarToUsdc,
  swapHbarToUsdc,
} from "@invoiceagent/shared/saucerswap";

function usage(): never {
  console.error(`Usage: saucerswap-hbar-to-usdc.ts <status|quote|associate|swap> [hbarAmount]
Token: ${SAUCERSWAP_TESTNET_USDC.label} ${SAUCERSWAP_TESTNET_USDC.tokenId}
${SAUCERSWAP_TESTNET_USDC.caveat}`);
  process.exit(2);
}

async function main() {
  const [cmd, amountArg] = process.argv.slice(2);
  if (!cmd) usage();

  const config = loadSaucerSwapConfig();
  const amountInTinybar = amountArg ? parseUnits(amountArg, 8) : TINYBAR_PER_HBAR;

  if (cmd === "status") {
    const status = await getSaucerSwapStatus(config);
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  if (cmd === "quote") {
    const q = await quoteHbarToUsdc({ amountInTinybar }, config);
    if (!q.ok) {
      console.error(`${q.code}: ${q.reason}`);
      process.exit(1);
    }
    console.log(
      JSON.stringify(
        {
          amountInHbar: formatUnits(q.quote.amountInTinybar, 8),
          amountOutUsdc: formatUnits(q.quote.amountOut, 6),
          amountOutMinimumUsdc: formatUnits(q.quote.amountOutMinimum, 6),
          tokenOut: q.quote.tokenOut,
          label: SAUCERSWAP_TESTNET_USDC.label,
          caveat: SAUCERSWAP_TESTNET_USDC.caveat,
          dryRun: config.dryRun,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (cmd === "associate") {
    const r = await ensureUsdcAssociated(config);
    console.log(JSON.stringify(r, null, 2));
    if (!r.ok) process.exit(1);
    return;
  }

  if (cmd === "swap") {
    const r = await swapHbarToUsdc({ amountInTinybar, associateIfNeeded: true }, config);
    if (!r.ok) {
      console.error(`${r.code}: ${r.reason}`);
      process.exit(1);
    }
    if (r.dryRun) {
      console.log(JSON.stringify({ ok: true, dryRun: true, payableTinybar: r.prepared.payableTinybar.toString() }, null, 2));
      return;
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun: false,
          transactionId: r.transactionId,
          amountOutUsdc: formatUnits(r.amountOut, 6),
          usdcBalanceAfter: formatUnits(r.usdcBalanceAfter, 6),
          tokenOut: SAUCERSWAP_TESTNET_USDC.tokenId,
          label: SAUCERSWAP_TESTNET_USDC.label,
        },
        null,
        2,
      ),
    );
    return;
  }

  usage();
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
