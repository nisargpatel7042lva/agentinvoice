import { EnsAgentSchema, type EnsAgent } from "@agentinvoice/shared";
import { createPublicClient, http, keccak256, parseAbi, toHex, zeroAddress, type Address } from "viem";
import { sepolia } from "viem/chains";
import { normalize } from "viem/ens";

// ENS is the source of truth for an agent's public record; the backend only caches it.
// Keys follow the frozen spec v2 (packages/shared/spec.md section 4): addr, limit, threshold, paid, late, status.
// expiresAt comes from the ENSv2 registry, not from a text record. A revoked or expired name is not an error here:
// it comes back with expiresAt in the past, so use isRevoked() to decide.

export type EnsReadErrorCode = "missing_record" | "invalid_record" | "not_found";

export class EnsReadError extends Error {
  constructor(
    readonly code: EnsReadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EnsReadError";
  }
}

export interface EnsReader {
  getAddress(name: string): Promise<string | null>;
  getText(name: string, key: string): Promise<string | null>;
  getExpiry(name: string): Promise<number>; // unix seconds, 0 if unknown
}

const ETH_REGISTRY = "0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4" as const; // docs.ens.domains/learn/deployments#sepolia-ensv2
const registryAbi = parseAbi([
  "function getExpiry(uint256 anyId) view returns (uint64)",
  "function getSubregistry(string label) view returns (address)",
]);

const labelId = (label: string) => BigInt(keccak256(toHex(label)));

export function sepoliaEnsReader(rpcUrl = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"): EnsReader {
  const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  return {
    getAddress: async (name) => client.getEnsAddress({ name: normalize(name) }),
    getText: async (name, key) => client.getEnsText({ name: normalize(name), key }),
    getExpiry: async (name) => {
      // name = [sub.]parent.eth. A subname lives in the registry attached under its parent.
      const labels = normalize(name).split(".");
      if (labels.length < 2 || labels.at(-1) !== "eth") throw new EnsReadError("not_found", `${name} is not a .eth name`);
      const parent = labels.at(-2) as string;
      let registry: Address = ETH_REGISTRY;
      let label = parent;
      if (labels.length === 3) {
        registry = await client.readContract({ address: ETH_REGISTRY, abi: registryAbi, functionName: "getSubregistry", args: [parent] });
        if (registry === zeroAddress) return 0;
        label = labels[0] as string;
      } else if (labels.length > 3) {
        throw new EnsReadError("not_found", `${name} is nested deeper than one subname`);
      }
      const expiry = await client.readContract({ address: registry, abi: registryAbi, functionName: "getExpiry", args: [labelId(label)] });
      return Number(expiry);
    },
  };
}

const nonNegativeInt = (key: string, v: string): number => {
  if (!/^\d+$/.test(v)) throw new EnsReadError("invalid_record", `record ${key} is not a non-negative integer: "${v}"`);
  return Number(v);
};
const amount = (key: string, v: string): string => {
  if (!/^\d+$/.test(v)) throw new EnsReadError("invalid_record", `record ${key} is not an integer amount: "${v}"`);
  return v;
};

export async function readAgentFromEns(name: string, reader: EnsReader = sepoliaEnsReader()): Promise<EnsAgent> {
  const text = async (key: string) => {
    const v = await reader.getText(name, key);
    if (v === null || v === "") throw new EnsReadError("missing_record", `${name} has no "${key}" record`);
    return v;
  };

  const [vault, limit, threshold, paid, late, status, expiresAt] = await Promise.all([
    reader.getAddress(name),
    text("limit"),
    text("threshold"),
    text("paid"),
    text("late"),
    text("status"),
    reader.getExpiry(name),
  ]);
  if (!vault) throw new EnsReadError("missing_record", `${name} has no addr record`);

  const parsed = EnsAgentSchema.safeParse({
    name,
    vault,
    limit: amount("limit", limit),
    threshold: amount("threshold", threshold),
    paid: nonNegativeInt("paid", paid),
    late: nonNegativeInt("late", late),
    status,
    expiresAt,
  });
  if (!parsed.success) throw new EnsReadError("invalid_record", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "));
  return parsed.data;
}

// A name that was unregistered or has passed its expiry is revoked: the agent has no credit line.
export function isRevoked(agent: Pick<EnsAgent, "expiresAt">, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  return agent.expiresAt <= nowSeconds;
}
