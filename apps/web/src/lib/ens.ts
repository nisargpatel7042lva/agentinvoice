import { EnsReadError, ensAgentFixture, readAgentFromEns, type Address, type EnsAgent } from "@agentinvoice/shared";
import { isMock } from "./env";

/** What the create form learns about the buyer the supplier typed. Never a guess: a failed read is "unreachable". */
export type BuyerLookup =
  | { kind: "ok"; vault: Address; name?: string; agent?: EnsAgent }
  | { kind: "notfound" }
  | { kind: "unreachable" };

const isAddress = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v);

/** A 0x vault address is used as typed. A name is read live from ENS (Sepolia); mock mode knows only the sample name. */
export async function lookupBuyer(input: string): Promise<BuyerLookup> {
  const v = input.trim();
  if (!v) return { kind: "notfound" };
  if (isAddress(v)) return { kind: "ok", vault: v as Address };
  if (isMock) return v.toLowerCase() === ensAgentFixture.name.toLowerCase() ? { kind: "ok", vault: ensAgentFixture.vault, name: ensAgentFixture.name, agent: ensAgentFixture } : { kind: "notfound" };
  if (!v.includes(".")) return { kind: "notfound" };
  try {
    const agent = await readAgentFromEns(v.toLowerCase());
    return { kind: "ok", vault: agent.vault, name: agent.name, agent };
  } catch (e) {
    // The name has no agent record set up (or does not exist): the supplier typed something that is not a buyer agent.
    if (e instanceof EnsReadError) return { kind: "notfound" };
    return { kind: "unreachable" };
  }
}
