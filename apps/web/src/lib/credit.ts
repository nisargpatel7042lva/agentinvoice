import "server-only";
import { cache } from "react";
import {
  buyerVaultAbi,
  computeCreditReport,
  hederaTestnet,
  type Address,
  type CreditReport,
} from "@invoiceagent/shared";
import { createPublicClient, http } from "viem";
import { api } from "./api";

function hederaClient() {
  const rpc = process.env.HEDERA_RPC_URL || process.env.HEDERA_TESTNET_RPC_URL || hederaTestnet.rpcUrl;
  const chain = { id: hederaTestnet.id, name: hederaTestnet.name, nativeCurrency: hederaTestnet.nativeCurrency, rpcUrls: { default: { http: [rpc] } } } as const;
  return createPublicClient({ chain, transport: http(rpc) });
}

/** BuyerVault.spentToday() straight from Hedera (tinybar as a decimal string), or null when it can't be read. */
export const readSpentToday = cache(async (vault: string): Promise<string | null> => {
  if (!/^0x[0-9a-fA-F]{40}$/.test(vault)) return null;
  try {
    const spent = (await hederaClient().readContract({ address: vault as Address, abi: buyerVaultAbi, functionName: "spentToday" })) as bigint;
    return spent.toString();
  } catch {
    return null;
  }
});

/** BuyerVault.approvalThreshold() straight from Hedera (tinybar string), or null when it can't be read. Payments above it need a human. */
export const readApprovalThreshold = cache(async (vault: string): Promise<string | null> => {
  if (!/^0x[0-9a-fA-F]{40}$/.test(vault)) return null;
  try {
    const t = (await hederaClient().readContract({ address: vault as Address, abi: buyerVaultAbi, functionName: "approvalThreshold" })) as bigint;
    return t.toString();
  } catch {
    return null;
  }
});

// One read per request, shared by every credit report computation on the page.
export const loadAllInvoices = cache(async () => {
  try {
    return await api.listInvoices();
  } catch {
    return null;
  }
});

export const loadEverLateIds = cache(async (): Promise<Set<string> | undefined> => {
  try {
    const events = await api.listAudit();
    const ids = new Set<string>();
    for (const ev of events) {
      if (ev.type === "invoice.late" && ev.invoiceId) {
        ids.add(ev.invoiceId);
      }
    }
    return ids;
  } catch {
    return undefined;
  }
});

// The Hedera RPC can take 10 s for one eth_call. The daily limit rarely changes, so keep the last value for a few minutes,
// answer from it instantly, and refresh in the background. A cold read waits at most READ_TIMEOUT_MS.
const LIMIT_TTL_MS = 5 * 60_000;
const READ_TIMEOUT_MS = 4_000;
const limitCache = new Map<string, { value: bigint | undefined; at: number }>();
const limitInflight = new Map<string, Promise<bigint | undefined>>();

function refreshDailyLimit(vault: Address): Promise<bigint | undefined> {
  const key = vault.toLowerCase();
  const running = limitInflight.get(key);
  if (running) return running;
  const rpc = process.env.HEDERA_RPC_URL || process.env.HEDERA_TESTNET_RPC_URL || hederaTestnet.rpcUrl;
  const chain = {
    id: hederaTestnet.id,
    name: hederaTestnet.name,
    nativeCurrency: hederaTestnet.nativeCurrency,
    rpcUrls: { default: { http: [rpc] } },
  } as const;
  const client = createPublicClient({ chain, transport: http(rpc, { timeout: READ_TIMEOUT_MS, retryCount: 0 }) });
  const p = (async () => {
    try {
      const value = (await client.readContract({ address: vault, abi: buyerVaultAbi, functionName: "dailyLimit" })) as bigint;
      limitCache.set(key, { value, at: Date.now() });
      return value;
    } catch {
      return limitCache.get(key)?.value; // keep serving the last known value if the RPC is slow or down
    } finally {
      limitInflight.delete(key);
    }
  })();
  limitInflight.set(key, p);
  return p;
}

export const readDailyLimit = cache(async (vault: Address): Promise<bigint | undefined> => {
  const hit = limitCache.get(vault.toLowerCase());
  if (hit) {
    if (Date.now() - hit.at > LIMIT_TTL_MS) void refreshDailyLimit(vault);
    return hit.value;
  }
  return refreshDailyLimit(vault);
});

/**
 * Server-only loader for a buyer vault's deterministic credit report.
 * Uses React cache() so a page rendering multiple scores makes only 1 invoices call and 1 audit call.
 */
export const loadCreditReport = cache(async (vault: string): Promise<CreditReport | null> => {
  const invoices = await loadAllInvoices();
  if (!invoices) return null;

  const addr = vault.toLowerCase() as Address;
  const [everLateIds, dailyLimit] = await Promise.all([loadEverLateIds(), readDailyLimit(addr)]);

  return computeCreditReport({
    vault: addr,
    invoices,
    everLateIds,
    dailyLimit,
  });
});
