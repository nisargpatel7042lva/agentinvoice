import "server-only";
import { cache } from "react";
import {
  buyerVaultAbi,
  computeCreditReport,
  ensAgentFixture,
  hederaTestnet,
  type Address,
  type CreditReport,
} from "@agentinvoice/shared";
import { createPublicClient, http } from "viem";
import { api, isMock } from "./api";

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

export const readDailyLimit = cache(async (vault: Address): Promise<bigint | undefined> => {
  if (isMock) {
    if (vault.toLowerCase() === ensAgentFixture.vault.toLowerCase()) {
      return BigInt(ensAgentFixture.limit);
    }
    return undefined;
  }

  try {
    const rpc = process.env.HEDERA_RPC_URL || process.env.HEDERA_TESTNET_RPC_URL || hederaTestnet.rpcUrl;
    const chain = {
      id: hederaTestnet.id,
      name: hederaTestnet.name,
      nativeCurrency: hederaTestnet.nativeCurrency,
      rpcUrls: { default: { http: [rpc] } },
    } as const;
    const client = createPublicClient({ chain, transport: http(rpc) });
    const limit = (await client.readContract({
      address: vault,
      abi: buyerVaultAbi,
      functionName: "dailyLimit",
    })) as bigint;
    return limit;
  } catch {
    return undefined;
  }
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
