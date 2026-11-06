import { cache } from "react";
import { ensAgentFixture, readAgentFromEns, scoreFromInvoices, type Address, type EnsAgent, type BuyerScore } from "@agentinvoice/shared";
import type { EnsState } from "@/components/EnsPanel";
import { api, isMock } from "./api";

/** Mock: the fixture agent is the only known name. Real: live ENS read; any failure is "unreachable", never a guess. */
export async function loadEnsByName(name: string): Promise<EnsState> {
  if (isMock) return name === ensAgentFixture.name ? toState(ensAgentFixture) : { kind: "missing" };
  try {
    return toState(await readAgentFromEns(name));
  } catch {
    return { kind: "unreachable" };
  }
}

export async function loadEnsByVault(vault: string): Promise<EnsState> {
  if (isMock) return vault.toLowerCase() === ensAgentFixture.vault.toLowerCase() ? toState(ensAgentFixture) : { kind: "missing" };
  return { kind: "unreachable" }; // reverse lookup lands with the ENS step
}

export function toState(agent: EnsAgent, now = Date.now() / 1000): EnsState {
  if (agent.status === "defaulted" || agent.status === "paused") return { kind: "present", agent };
  if (agent.expiresAt <= now) return { kind: "expired", agent };
  return { kind: "present", agent };
}

// One backend read per request, shared by every score on the page.
const allInvoices = cache(() => api.listInvoices().catch(() => null));

/** Demo: fixture scores. Real: computed from on-chain invoice history (same rules as the paid score API). */
export async function loadScore(vault: string): Promise<BuyerScore | null> {
  if (isMock) return api.getScoreMock(vault).catch(() => null);
  const invoices = await allInvoices();
  return invoices ? scoreFromInvoices(vault as Address, invoices) : null;
}
