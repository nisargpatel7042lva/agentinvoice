import { ensAgentFixture, readAgentFromEns, type EnsAgent, type BuyerScore } from "@agentinvoice/shared";
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

export async function loadScore(vault: string): Promise<BuyerScore | null> {
  if (!isMock) return null; // real scores are paid (payAndGet) and fetched by agents, not the public UI
  return api.getScoreMock(vault).catch(() => null);
}
