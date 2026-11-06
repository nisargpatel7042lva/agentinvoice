import { EnsReadError, readAgentFromEns, scoreFromInvoices, type Address, type EnsAgent, type BuyerScore } from "@invoiceagent/shared";
import type { EnsState } from "@/components/EnsPanel";
import { loadAllInvoices, loadEverLateIds, readDailyLimit } from "./credit";

/** Mock: the fixture agent is the only known name. Real: live ENS read; any failure is "unreachable", never a guess. */
export async function loadEnsByName(name: string): Promise<EnsState> {
  try {
    return toState(await readAgentFromEns(name));
  } catch {
    return { kind: "unreachable" };
  }
}

export async function loadEnsByVault(vault: string): Promise<EnsState> {
  // No reverse lookup yet: ask ENS for the configured demo name and accept it only if it points at this vault.
  const name = process.env.NEXT_PUBLIC_BUYER_ENS_NAME;
  if (!name) return { kind: "unreachable" };
  try {
    const agent = await readAgentFromEns(name);
    return agent.vault.toLowerCase() === vault.toLowerCase() ? toState(agent) : { kind: "missing" };
  } catch (e) {
    return e instanceof EnsReadError ? { kind: "missing" } : { kind: "unreachable" };
  }
}

export function toState(agent: EnsAgent, now = Date.now() / 1000): EnsState {
  if (agent.status === "defaulted" || agent.status === "paused") return { kind: "present", agent };
  if (agent.expiresAt <= now) return { kind: "expired", agent };
  return { kind: "present", agent };
}

/** Buyer score loader backed by invoices, audit events, and credit report. */
export async function loadScore(vault: string): Promise<BuyerScore | null> {
  const invoices = await loadAllInvoices();
  if (!invoices) return null;
  const addr = vault.toLowerCase() as Address;
  const [everLateIds, dailyLimit] = await Promise.all([loadEverLateIds(), readDailyLimit(addr)]);
  return scoreFromInvoices(addr, invoices, Math.floor(Date.now() / 1000), {
    everLateIds,
    dailyLimit,
  });
}
