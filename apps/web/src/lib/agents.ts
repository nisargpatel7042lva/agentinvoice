import { EnsReadError, readAgentFromEns, scoreFromInvoices, type Address, type EnsAgent, type BuyerScore } from "@invoiceagent/shared";
import type { EnsState } from "@/components/EnsPanel";
import { loadAllInvoices, loadEverLateIds, readDailyLimit } from "./credit";

/** Live ENS read on Sepolia (Sidd's ENSv2 records); any failure is "unreachable", never a guess. */
export async function loadEnsByName(name: string): Promise<EnsState> {
  try {
    return toState(await readAgentFromEns(name));
  } catch {
    return { kind: "unreachable" };
  }
}

// vault -> registered ENS name, from the backend (buyers register their own vault on the profile page). Short cache: the list is tiny and read on every page.
const NAMES_TTL_MS = 30_000;
let namesCache: { at: number; byVault: Map<string, string> } | null = null;

/** Names buyers registered for their vaults. A failed read is an empty list, never a guess. */
export async function registeredNames(): Promise<Map<string, string>> {
  if (namesCache && Date.now() - namesCache.at < NAMES_TTL_MS) return namesCache.byVault;
  const base = (process.env.NEXT_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
  const byVault = new Map<string, string>();
  if (base) {
    try {
      const r = await fetch(`${base}/api/agents`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
      const j = (await r.json()) as { agents?: { vault: string; name: string }[] };
      for (const a of j.agents ?? []) byVault.set(a.vault.toLowerCase(), a.name);
    } catch {
      return namesCache?.byVault ?? byVault; // keep the last list if the backend blips
    }
  }
  namesCache = { at: Date.now(), byVault };
  return byVault;
}

export async function loadEnsByVault(vault: string): Promise<EnsState> {
  // Candidates: the name registered for this vault, then the configured demo name. A name is accepted only if its ENS record points at this vault.
  const registered = (await registeredNames()).get(vault.toLowerCase());
  const candidates = [...new Set([registered, process.env.NEXT_PUBLIC_BUYER_ENS_NAME].filter((n): n is string => Boolean(n)))];
  if (candidates.length === 0) return { kind: "unreachable" };
  let sawUnreachable = false;
  for (const name of candidates) {
    try {
      const agent = await readAgentFromEns(name);
      if (agent.vault.toLowerCase() === vault.toLowerCase()) return toState(agent);
    } catch (e) {
      if (!(e instanceof EnsReadError)) sawUnreachable = true;
    }
  }
  return sawUnreachable ? { kind: "unreachable" } : { kind: "missing" };
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
