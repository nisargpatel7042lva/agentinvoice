import { pathToFileURL } from "node:url";
import { createAgentAccount, createApiClient, hederaTestnet } from "@invoiceagent/shared";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createBuyerAgent } from "./agent.js";
import { loadConfig } from "./config.js";
import { log } from "./logger.js";

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const stop = { stopped: false };
  process.on("SIGINT", () => {
    stop.stopped = true;
  });
  start(stop).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "agent failed";
    console.error(message);
    process.exitCode = 1;
  });
}

async function start(stop: { stopped: boolean }): Promise<void> {
  const config = loadConfig();
  const chain = {
    id: hederaTestnet.id,
    name: hederaTestnet.name,
    nativeCurrency: hederaTestnet.nativeCurrency,
    rpcUrls: { default: { http: [config.rpcUrl] } },
  } as const;
  const reader = createPublicClient({ chain, transport: http(config.rpcUrl) });
  const account = config.dryRun || !config.privateKey ? undefined : privateKeyToAccount(config.privateKey);
  const wallet = account ? createWalletClient({ account, chain, transport: http(config.rpcUrl) }) : undefined;
  const market = config.marketAddress;
  // All spending goes through the AgentAccount adapter: BuyerVault today, Hedera Agent Accounts when their API ships.
  const spender = createAgentAccount({ provider: config.accountProvider, vault: config.buyerVaultAddress, reader, writer: wallet });

  const agent = createBuyerAgent({
    api: createApiClient({ baseUrl: config.backendUrl }),
    vaultAddress: spender.address,
    marketAddress: market,
    dryRun: config.dryRun,
    log,
    readSupplier: (supplier) => spender.recipient(supplier),
    readThreshold: async () => (await spender.rules()).approvalThreshold,
    accept: (id) => spender.accept(market, id),
    pay: (id) => spender.pay(market, id),
  });

  log(`buyer agent started dryRun=${config.dryRun} account=${spender.provider}`);
  await agent.run(config.pollIntervalMs, stop);
}
