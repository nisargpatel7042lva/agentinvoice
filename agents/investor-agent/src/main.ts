// Entry point: bun run --cwd agents/investor-agent start
// Env: BACKEND_URL, SCORE_API_URL, MARKET_ADDRESS, INVESTOR_PRIVATE_KEY, HEDERA_TESTNET_RPC_URL,
//      MIN_BAND, MIN_DISCOUNT_BPS, MAX_PRICE, MAX_OPEN_EXPOSURE, DRY_RUN=1, INVESTOR_AGENT_POLL_INTERVAL_MS
import * as shared from "@invoiceagent/shared";
import { payAndGet } from "@invoiceagent/shared/payAndGet";
import { createPublicClient, createWalletClient, http, parseAbi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createInvestorAgent } from "./agent.js";
import { rulesFromEnv } from "./decide.js";
import { createScoreReader, type PayAndGet } from "./score.js";
import { loadInvestorSwapConfig, maybeSwapExcessHbarToUsdc, swapRulesFromEnv } from "./swap.js";
import { fundInUsdc } from "./usdcFund.js";
import { quoteHbarToUsdc } from "@invoiceagent/shared/saucerswap/quote";
import { createSaucerSwapConfig } from "@invoiceagent/shared/saucerswap/config";

// fund(id) is not payable: it pulls the price in USDC (approved first) from this wallet to the supplier.
const MARKET_ABI = parseAbi(["function fund(uint256 id)"]);

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

async function main() {
  // Mann's x402 helper, bound to the investor key and a spending policy limited to the score API host.
  const scoreApi = need("SCORE_API_URL");
  const payKey = need("INVESTOR_PRIVATE_KEY") as Hex;
  // Real x402: pays the score API in HBAR from the investor's Hedera account (0.0.x + its ECDSA key),
  // never more than these caps (tinybars). The facilitator co-signs as fee payer.
  const payScore: PayAndGet = (url) =>
    payAndGet(url, {
      accountId: need("INVESTOR_ACCOUNT_ID"),
      privateKey: payKey,
      policy: {
        allowedHosts: [new URL(scoreApi).host],
        perCallCap: process.env.SCORE_MAX_PRICE_TINYBAR ?? "10000000", // 0.1 HBAR
        dailyBudget: process.env.SCORE_DAILY_BUDGET_TINYBAR ?? "100000000", // 1 HBAR
      },
      onAudit: (e) => console.log(`x402 ${e.type} amount=${e.amount ?? "?"}${e.txId ? ` tx=${e.txId}` : ""}${e.reason ? ` reason="${e.reason}"` : ""}`),
    });

  const dryRun = process.env.DRY_RUN === "1";
  const chain = {
    id: shared.hederaTestnet.id,
    name: shared.hederaTestnet.name,
    nativeCurrency: shared.hederaTestnet.nativeCurrency,
    rpcUrls: { default: { http: [process.env.HEDERA_TESTNET_RPC_URL ?? shared.hederaTestnet.rpcUrl] } },
  } as const;
  const market = need("MARKET_ADDRESS") as Address;
  const account = dryRun ? undefined : privateKeyToAccount(payKey);
  const wallet = account ? createWalletClient({ account, chain, transport: http() }) : undefined;
  const reader = createPublicClient({ chain, transport: http() });

  // Most HBAR one USDC top-up may swap (USDC_TOPUP_MAX_HBAR, default 20).
  const maxSwapTinybar = shared.parseUnits(process.env.USDC_TOPUP_MAX_HBAR ?? "20", 8);
  const swapConfig = loadInvestorSwapConfig();
  const swapRules = swapRulesFromEnv();

  const agent = createInvestorAgent({
    api: shared.createApiClient({ baseUrl: need("BACKEND_URL") }),
    getScore: createScoreReader(scoreApi, payScore),
    rules: rulesFromEnv(),
    dryRun,
    txUrl: (h) => `${shared.hederaTestnet.explorerUrl}/transaction/${h}`,
    buy: async (id, price) => {
      if (!wallet || !account) throw new Error("no wallet (DRY_RUN?)");
      const confirm = async (hash: Hex) => {
        const receipt = await reader.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error(`tx reverted ${hash}`);
        return hash as shared.Hash32;
      };
      const usdc = shared.contracts.usdc;
      const swapCfg = createSaucerSwapConfig({ dryRun: true, maxSwapHbarTinybar: maxSwapTinybar, maxSlippageBps: 100 });
      return fundInUsdc(id, price, {
        maxSwapTinybar,
        log: (l) => console.log(`invoice=${id} ${l}`),
        usdcBalance: () => reader.readContract({ address: usdc, abi: shared.settlementTokenAbi, functionName: "balanceOf", args: [account.address] }) as Promise<bigint>,
        allowance: () => reader.readContract({ address: usdc, abi: shared.settlementTokenAbi, functionName: "allowance", args: [account.address, market] }) as Promise<bigint>,
        quoteMinOut: async (amountIn) => {
          const q = await quoteHbarToUsdc({ amountInTinybar: amountIn }, swapCfg);
          if (!q.ok) throw new Error(`SaucerSwap quote failed: ${q.reason}`);
          return q.quote.amountOutMinimum;
        },
        swap: async (amountIn, minOut) => {
          const tx = shared.buildHbarToUsdcSwap({ amountInTinybar: amountIn, amountOutMinimum: minOut, recipient: account.address, deadline: Math.floor(Date.now() / 1000) + 600 });
          return confirm(await wallet.sendTransaction({ to: tx.to, data: tx.data, value: shared.tinybarToWeibar(tx.valueTinybar), gas: 400_000n, account, chain }));
        },
        approve: async (amount) => confirm(await wallet.writeContract({ address: usdc, abi: shared.settlementTokenAbi, functionName: "approve", args: [market, amount], account, chain })),
        fund: async (invoiceId) => confirm(await wallet.writeContract({ address: market, abi: MARKET_ABI, functionName: "fund", args: [invoiceId], account, chain, gas: 400_000n })),
      });
    },
    treasurySwap: swapConfig
      ? () => maybeSwapExcessHbarToUsdc(swapConfig, swapRules).then(() => undefined)
      : undefined,
  });

  process.on("SIGINT", () => { console.log("stopping after this loop"); agent.stop(); });
  console.log(`investor agent started dryRun=${dryRun} saucerswap=${swapRules.enabled && swapConfig ? "on" : "off"}`);
  await agent.run(Number(process.env.INVESTOR_AGENT_POLL_INTERVAL_MS ?? 20_000));
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
