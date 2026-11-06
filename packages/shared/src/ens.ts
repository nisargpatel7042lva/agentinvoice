import type { EnsAgent } from "./types";

export type EnsSetter = "sponsor" | "publisher" | "registry";

/** Who may change each ENS value (spec v2 §4). UI permission panels render from this, never hand-typed. */
export const ENS_ROLES: { record: keyof EnsAgent; ens: string; setBy: EnsSetter }[] = [
  { record: "vault", ens: "addr", setBy: "sponsor" },
  { record: "limit", ens: "text:limit", setBy: "sponsor" },
  { record: "threshold", ens: "text:threshold", setBy: "sponsor" },
  { record: "paid", ens: "text:paid", setBy: "publisher" },
  { record: "late", ens: "text:late", setBy: "publisher" },
  { record: "status", ens: "text:status", setBy: "publisher" },
  { record: "expiresAt", ens: "registry expiry", setBy: "registry" },
];

// Reads addr, text records (limit, threshold, paid, late, status) and expiresAt from the registry.
// Signature frozen in spec v2; implementation lands later.
export async function readAgentFromEns(name: string): Promise<EnsAgent> {
  throw new Error(`readAgentFromEns(${name}): not implemented`);
}
