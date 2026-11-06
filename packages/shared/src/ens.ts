import type { EnsAgent } from "./types.js";

// Reads addr, text records (limit, threshold, paid, late, status) and expiresAt from the registry.
// Signature frozen in spec v2; implementation lands later.
export async function readAgentFromEns(name: string): Promise<EnsAgent> {
  throw new Error(`readAgentFromEns(${name}): not implemented`);
}
