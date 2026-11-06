import {
  AGENTKIT,
  createAgentBookVerifier,
  parseAgentkitHeader,
  validateAgentkitMessage,
  verifyAgentkitSignature,
  type AgentBookVerifier,
} from "@worldcoin/agentkit";

// HONEST NOTE: AgentKit proves that an agent wallet is registered to a unique, World ID-verified
// human. It does NOT approve any single action. The approval service binds agent, action, amount,
// expiry and single use. Do not describe this module as approving anything.

export type AgentRequestReason =
  | "missing_header"
  | "invalid_header"
  | "invalid_message"
  | "replayed_nonce"
  | "invalid_signature"
  | "not_registered"
  | "lookup_failed";

export interface AgentRequestResult {
  ok: boolean;
  humanId?: string;
  agentAddress?: string;
  reason?: AgentRequestReason;
  detail?: string;
}

// Single-use nonces. claim() is synchronous, so two concurrent requests with the same nonce cannot both win.
// In-memory only: it resets on restart and is not shared between processes.
export class NonceStore {
  private seen = new Set<string>();
  claim(nonce: string): boolean {
    if (this.seen.has(nonce)) return false;
    this.seen.add(nonce);
    return true;
  }
}

export interface AgentKitDeps {
  agentBook: Pick<AgentBookVerifier, "lookupHuman">;
  nonces: NonceStore;
  maxAgeMs?: number; // default 5 minutes
  rpcUrl?: string; // for signature verification; defaults to the signed chain's public RPC
}

let defaultDeps: AgentKitDeps | undefined;
function getDefaultDeps(): AgentKitDeps {
  defaultDeps ??= {
    agentBook: createAgentBookVerifier({ rpcUrl: process.env.WORLD_CHAIN_RPC_URL || undefined }),
    nonces: new NonceStore(),
    rpcUrl: process.env.AGENTKIT_SIGNATURE_RPC_URL || undefined,
  };
  return defaultDeps;
}

type HeaderBag = Headers | Record<string, string | string[] | undefined>;

function readHeader(headers: HeaderBag, name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name) return Array.isArray(value) ? value[0] : value;
  }
  return undefined;
}

export async function lookupHuman(address: string, deps: Pick<AgentKitDeps, "agentBook"> = getDefaultDeps()) {
  return deps.agentBook.lookupHuman(address);
}

// Verifies an AgentKit header: parse, check message (resource, age, single-use nonce), check the
// signature, then look the signer up in AgentBook. ok is true only if every step passes.
export async function verifyAgentRequest(
  headers: HeaderBag,
  resourceUri: string,
  deps: AgentKitDeps = getDefaultDeps(),
): Promise<AgentRequestResult> {
  const raw = readHeader(headers, AGENTKIT);
  if (!raw) return { ok: false, reason: "missing_header" };

  let payload;
  try {
    payload = parseAgentkitHeader(raw);
  } catch (err) {
    return { ok: false, reason: "invalid_header", detail: (err as Error).message };
  }

  const message = await validateAgentkitMessage(payload, resourceUri, {
    maxAge: deps.maxAgeMs,
    checkNonce: (nonce) => deps.nonces.claim(nonce),
  });
  if (!message.valid) {
    const replay = message.error?.includes("replay");
    return {
      ok: false,
      reason: replay ? "replayed_nonce" : "invalid_message",
      detail: message.error,
      agentAddress: payload.address,
    };
  }

  const signature = await verifyAgentkitSignature(payload, deps.rpcUrl);
  if (!signature.valid) {
    return { ok: false, reason: "invalid_signature", detail: signature.error, agentAddress: payload.address };
  }
  const agentAddress = signature.address ?? payload.address;

  let humanId: string | null;
  try {
    humanId = await deps.agentBook.lookupHuman(agentAddress);
  } catch (err) {
    return { ok: false, reason: "lookup_failed", detail: (err as Error).message, agentAddress };
  }
  if (!humanId) return { ok: false, reason: "not_registered", agentAddress };

  return { ok: true, humanId, agentAddress };
}
