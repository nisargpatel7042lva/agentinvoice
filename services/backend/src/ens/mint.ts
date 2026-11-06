import { getAddress, verifyMessage, type Address, type Hex } from "viem";

// Seller ENS names: <label>.<parent>.eth, registered by the sponsor wallet (it pays Sepolia gas) but owned by the seller.
// The seller proves they control the wallet with a signed message, so nobody can mint a name for someone else.

export const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{1,18})[a-z0-9]$/; // 3 to 20 chars, no leading or trailing dash
const RESERVED = new Set(["buyer", "admin", "agent", "sponsor", "www", "root"]);

export class MintError extends Error {
  constructor(
    readonly code: "bad_label" | "reserved" | "bad_signature" | "taken" | "already_has_name" | "chain_failed",
    message: string,
  ) {
    super(message);
  }
}

export const claimMessage = (label: string, parent: string, owner: Address) => `Claim ${label}.${parent} for ${getAddress(owner)} on Invoice Agent`;

export interface MintDeps {
  parent: string; // e.g. agentinvoicenf71.eth
  isTaken: (label: string) => Promise<boolean>; // on-chain: the registry already has an owner for this label
  existingNameFor: (owner: Address) => string | null; // one name per wallet (local record)
  register: (label: string, owner: Address) => Promise<{ txHash: Hex }>; // registry.register + resolver.setAddress
  remember: (owner: Address, name: string, txHash: Hex) => void;
}

export async function mintSellerName(deps: MintDeps, input: { label: string; owner: Address; signature: Hex }) {
  const label = input.label.trim().toLowerCase();
  if (!LABEL_RE.test(label)) throw new MintError("bad_label", "Use 3 to 20 letters, numbers or dashes.");
  if (RESERVED.has(label)) throw new MintError("reserved", "That name is reserved. Pick another.");
  const ok = await verifyMessage({ address: input.owner, message: claimMessage(label, deps.parent, input.owner), signature: input.signature }).catch(() => false);
  if (!ok) throw new MintError("bad_signature", "The signature does not match this wallet.");
  const had = deps.existingNameFor(input.owner);
  if (had) throw new MintError("already_has_name", `This wallet already has ${had}.`);
  if (await deps.isTaken(label)) throw new MintError("taken", "That name is taken. Pick another.");
  let txHash: Hex;
  try {
    ({ txHash } = await deps.register(label, getAddress(input.owner)));
  } catch (e) {
    throw new MintError("chain_failed", `Sepolia registration failed: ${e instanceof Error ? e.message.slice(0, 120) : "unknown"}`);
  }
  const name = `${label}.${deps.parent}`;
  deps.remember(getAddress(input.owner), name, txHash);
  return { name, txHash };
}
