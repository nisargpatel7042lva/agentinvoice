import { pathToFileURL } from "node:url";
import { createApiClient, hederaTestnet, type Address, type Hash32 } from "@agentinvoice/shared";
import { createPublicClient, createWalletClient, http, type Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import buyerVaultAbi from "../../../packages/shared/src/abi/BuyerVault.json" with { type: "json" };
import { createBuyerAgent } from "./agent.js";
import { loadConfig } from "./config.js";
import { log } from "./logger.js";

const abi = buyerVaultAbi as Abi;

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
  const vault = config.buyerVaultAddress;
  const market = config.marketAddress;

  async function send(functionName: "accept" | "payInvoice", id: bigint): Promise<Hash32> {
    if (!wallet || !account) throw new Error("no wallet (DRY_RUN?)");
    const args = functionName === "accept" ? [market, id] : [market, id, "0x"];
    const hash = await wallet.writeContract({ address: vault, abi, functionName, args, account, chain });
    const receipt = await reader.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`tx reverted ${hash}`);
    return hash;
  }

  const agent = createBuyerAgent({
    api: createApiClient({ baseUrl: config.backendUrl }),
    vaultAddress: vault,
    marketAddress: market,
    dryRun: config.dryRun,
    log,
    readSupplier: async (supplier: Address) => {
      const [allowed, limit] = await Promise.all([
        reader.readContract({ address: vault, abi, functionName: "allowedSupplier", args: [supplier] }),
        reader.readContract({ address: vault, abi, functionName: "supplierLimit", args: [supplier] }),
      ]);
      return { allowed: Boolean(allowed), limit: BigInt(limit as bigint) };
    },
    readThreshold: async () => BigInt(await reader.readContract({ address: vault, abi, functionName: "approvalThreshold" }) as bigint),
    readDailyLimit: async () => BigInt(await reader.readContract({ address: vault, abi, functionName: "dailyLimit" }) as bigint),
    readSpentToday: async () => BigInt(await reader.readContract({ address: vault, abi, functionName: "spentToday" }) as bigint),
    readBalance: () => reader.getBalance({ address: vault }),
    accept: (id) => send("accept", id),
    pay: (id) => send("payInvoice", id),
  });

  log(`buyer agent started dryRun=${config.dryRun}`);
  await agent.run(config.pollIntervalMs, stop);
}
