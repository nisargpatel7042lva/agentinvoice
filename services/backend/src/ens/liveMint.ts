import { createPublicClient, createWalletClient, http, parseAbi, toHex, keccak256, zeroAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { normalize, packetToBytes } from "viem/ens";
import type { MintDeps } from "./mint.js";

const ALL_ROLES = 0x1111111111111111111111111111111111111111111111111111111111111111n;
const DAY = 86_400n;
const ETH_REGISTRY: Address = "0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4";
const registryAbi = parseAbi([
  "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)",
  "function findOwner(string label) view returns (address)",
  "function getExpiry(uint256 anyId) view returns (uint64)",
]);
const resolverAbi = parseAbi(["function setAddress(bytes name, uint256 coinType, bytes addressBytes)"]);

export interface LiveMintOptions {
  sponsorKey: Hex; // pays Sepolia gas and holds the registry and resolver roles; read from env by the caller, never logged
  userRegistry: Address;
  resolver: Address;
  parentLabel: string; // e.g. agentinvoicenf71
  rpcUrl?: string;
}

// The chain-facing half of the seller mint: is the label free, and register it with the seller as owner.
export function liveMintDeps(o: LiveMintOptions): Pick<MintDeps, "parent" | "isTaken" | "register"> {
  const rpcUrl = o.rpcUrl ?? (process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com");
  const account = privateKeyToAccount(o.sponsorKey);
  const wallet = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });
  const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const parent = `${o.parentLabel}.eth`;
  const wait = async (hash: Hex) => {
    const r = await client.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error("transaction reverted");
  };
  return {
    parent,
    isTaken: async (label) => (await client.readContract({ address: o.userRegistry, abi: registryAbi, functionName: "findOwner", args: [label] })) !== zeroAddress,
    register: async (label, owner) => {
      const parentExpiry = await client.readContract({ address: ETH_REGISTRY, abi: registryAbi, functionName: "getExpiry", args: [BigInt(keccak256(toHex(o.parentLabel)))] });
      const txHash = await wallet.writeContract({ address: o.userRegistry, abi: registryAbi, functionName: "register", args: [label, owner, zeroAddress, o.resolver, ALL_ROLES, parentExpiry - DAY] });
      await wait(txHash);
      const name = toHex(packetToBytes(normalize(`${label}.${parent}`)));
      await wait(await wallet.writeContract({ address: o.resolver, abi: resolverAbi, functionName: "setAddress", args: [name, 60n, owner] }));
      return { txHash };
    },
  };
}
