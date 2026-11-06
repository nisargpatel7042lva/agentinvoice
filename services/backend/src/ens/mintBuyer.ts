import { getAddress, verifyMessage, type Address, type Hex } from "viem";
import { LABEL_RE, RESERVED_LABELS, type MintDeps } from "./mint.js";

// Buyer ENS names: <label>.<parent>.eth whose address record is the buyer's BuyerVault, so ENS (and the website) can go from a vault to its agent.
// The buyer must own the vault on Hedera and sign the request, so nobody can name a vault they do not control.

export class BuyerMintError extends Error {
  constructor(
    readonly code: "bad_label" | "reserved" | "bad_signature" | "not_buyer" | "not_vault_owner" | "taken" | "already_registered" | "chain_failed",
    message: string,
  ) {
    super(message);
  }
}

export const buyerClaimMessage = (label: string, parent: string, vault: Address, owner: Address) =>
  `Register ${label}.${parent} for vault ${getAddress(vault)} owned by ${getAddress(owner)} on Invoice Agent`;

export interface BuyerMintDeps extends Pick<MintDeps, "parent" | "isTaken" | "register"> {
  roleOf: (owner: Address) => "buyer" | "seller" | null;
  vaultOwner: (vault: Address) => Promise<Address | null>; // BuyerVault.owner() on Hedera, null when it is not a vault
  existing: (owner: Address, vault: Address) => string | null; // a name this wallet or vault already has
  remember: (vault: Address, owner: Address, name: string, txHash: Hex) => void;
}

export async function mintBuyerName(deps: BuyerMintDeps, input: { label: string; owner: Address; vault: Address; signature: Hex }) {
  const label = input.label.trim().toLowerCase();
  const owner = getAddress(input.owner);
  const vault = getAddress(input.vault);
  if (!LABEL_RE.test(label)) throw new BuyerMintError("bad_label", "Use 3 to 20 letters, numbers or dashes.");
  if (RESERVED_LABELS.has(label)) throw new BuyerMintError("reserved", "That name is reserved. Pick another.");
  const ok = await verifyMessage({ address: owner, message: buyerClaimMessage(label, deps.parent, vault, owner), signature: input.signature }).catch(() => false);
  if (!ok) throw new BuyerMintError("bad_signature", "The signature does not match this wallet.");
  if (deps.roleOf(owner) !== "buyer") throw new BuyerMintError("not_buyer", "Choose the buyer role on your profile first.");
  const actual = await deps.vaultOwner(vault).catch(() => null);
  if (!actual || getAddress(actual) !== owner) throw new BuyerMintError("not_vault_owner", "This wallet does not own that vault.");
  const had = deps.existing(owner, vault);
  if (had) throw new BuyerMintError("already_registered", `Already registered as ${had}.`);
  if (await deps.isTaken(label)) throw new BuyerMintError("taken", "That name is taken. Pick another.");
  let txHash: Hex;
  try {
    ({ txHash } = await deps.register(label, owner, vault));
  } catch (e) {
    throw new BuyerMintError("chain_failed", `Sepolia registration failed: ${e instanceof Error ? e.message.slice(0, 120) : "unknown"}`);
  }
  const name = `${label}.${deps.parent}`;
  deps.remember(vault, owner, name, txHash);
  return { name, vault, txHash };
}
