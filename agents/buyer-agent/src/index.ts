import { pathToFileURL } from "node:url";
import { buyerVaultAbi, createAgentAccount, createApiClient, hederaTestnet, type Address } from "@invoiceagent/shared";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createBuyerAgent, type VaultOps } from "./agent.js";
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
  const spender = createAgentAccount({
    provider: config.accountProvider,
    vault: config.buyerVaultAddress,
    reader,
    writer: wallet,
    hederaOptions: {
      apiUrl: process.env.HEDERA_AGENT_ACCOUNT_API_URL,
      apiKey: process.env.HEDERA_AGENT_ACCOUNT_API_KEY,
      partnerDemo: process.env.HEDERA_AGENT_ACCOUNT_DEMO === "1",
      onAudit: (e) => log(`[hedera-agent-account audit] ${e.type}: ${e.detail}${e.txHash ? ` tx=${e.txHash}` : ""}`),
    },
  });

  const api = createApiClient({ baseUrl: config.backendUrl });
  // Vaults buyers registered on the website. This agent serves one only if it is that vault's on-chain agent, so a stranger's vault is never spent from.
  const opsCache = new Map<string, VaultOps>();
  const opsFor = async (vault: Address): Promise<VaultOps | null> => {
    const cached = opsCache.get(vault.toLowerCase());
    if (cached) return cached;
    if (account) {
      const onChainAgent = (await reader.readContract({ address: vault, abi: buyerVaultAbi, functionName: "agent" })) as Address;
      if (onChainAgent.toLowerCase() !== account.address.toLowerCase()) return null;
    }
    const extra = createAgentAccount({ provider: "buyer-vault", vault, reader, writer: wallet });
    const ops: VaultOps = {
      readSupplier: (supplier) => extra.recipient(supplier),
      readThreshold: async () => (await extra.rules()).approvalThreshold,
      accept: (id) => extra.accept(market, id),
      pay: (id) => extra.pay(market, id),
    };
    opsCache.set(vault.toLowerCase(), ops);
    return ops;
  };

  const agent = createBuyerAgent({
    api,
    extraVaults: async () => (await api.listAgents()).agents.map((a) => a.vault),
    opsFor,
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
