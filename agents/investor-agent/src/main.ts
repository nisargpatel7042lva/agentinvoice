// Entry point: bun run --cwd agents/investor-agent start
// Env: BACKEND_URL, SCORE_API_URL, MARKET_ADDRESS, INVESTOR_PRIVATE_KEY, HEDERA_TESTNET_RPC_URL,
//      MIN_BAND, MIN_DISCOUNT_BPS, MAX_PRICE, MAX_OPEN_EXPOSURE, DRY_RUN=1, INVESTOR_AGENT_POLL_INTERVAL_MS
import * as shared from "@agentinvoice/shared";
import { createPublicClient, createWalletClient, http, parseAbi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createInvestorAgent } from "./agent.js";
import { rulesFromEnv } from "./decide.js";
import { createScoreReader, type PayAndGet } from "./score.js";

// Spec v2 name is fund(id). Mann's notes call it buy(id); change here if the contract ships as buy.
const MARKET_ABI = parseAbi(["function fund(uint256 id) payable"]);

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

async function main() {
  // Mann's x402 helper, bound to the investor key and a spending policy limited to the score API host.
  const scoreApi = need("SCORE_API_URL");
  const payKey = need("INVESTOR_PRIVATE_KEY") as Hex;
  const payScore: PayAndGet = (url) =>
    shared.payAndGet(url, { privateKey: payKey, policy: { allowedHosts: [new URL(scoreApi).host] } });

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

  const agent = createInvestorAgent({
    api: shared.createApiClient({ baseUrl: need("BACKEND_URL") }),
    getScore: createScoreReader(scoreApi, payScore),
    rules: rulesFromEnv(),
    dryRun,
    txUrl: (h) => `${shared.hederaTestnet.explorerUrl}/transaction/${h}`,
    buy: async (id, value) => {
      if (!wallet || !account) throw new Error("no wallet (DRY_RUN?)");
      const hash = await wallet.writeContract({ address: market, abi: MARKET_ABI, functionName: "fund", args: [id], value, account, chain });
      const receipt = await reader.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`tx reverted ${hash}`);
      return hash;
    },
  });

  process.on("SIGINT", () => { console.log("stopping after this loop"); agent.stop(); });
  console.log(`investor agent started dryRun=${dryRun}`);
  await agent.run(Number(process.env.INVESTOR_AGENT_POLL_INTERVAL_MS ?? 20_000));
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
