// Shared helpers for the ENSv2 scripts. Addresses are from https://docs.ens.domains/learn/deployments#sepolia-ensv2
// and the ABIs below were checked against the deployed bytecode (see docs/notes/ensv2.md).
// Run scripts with bun so .env is loaded.
import { appendFileSync, readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  parseAbi,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

export const ENS = {
  ethRegistry: "0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4",
  ethRegistrar: "0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3",
  verifiableFactory: "0xda70306c98e97ece36f997a21368e53298572991",
  permissionedResolverImpl: "0x115eb53f0c60696633855f90b138178fb40b2b2c",
  userRegistryImpl: "0x9bd8a88719068d09ecee662f36c0e3856708366a",
  mockUsdc: "0x240b0316df57887dbbe58b586508b19e633a14aa",
} as const satisfies Record<string, Address>;

// Role bitmaps (docs.ens.domains/ensv2/permissioned-registry and -resolver).
export const ALL_ROLES = 0x1111111111111111111111111111111111111111111111111111111111111111n;
export const ROLE_SET_TEXT = 1n << 4n;

// Record keys from the frozen spec v2 (packages/shared/spec.md section 4): the publisher may write only
// paid, late and status; the sponsor owns limit and threshold (and addr).
export const PUBLISHER_KEYS = ["paid", "late", "status"] as const;
export const SPONSOR_KEYS = ["limit", "threshold"] as const;
// Keys used before the spec was frozen. The publisher's roles on them are revoked by grant.ts.
export const LEGACY_KEYS = ["agentinvoice.paid", "agentinvoice.late", "agentinvoice.status"] as const;

export const abis = {
  registrar: parseAbi([
    "function commit(bytes32 commitment)",
    "function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256)",
    "function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) pure returns (bytes32)",
    "function isAvailable(string label) view returns (bool)",
    "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)",
    "function MIN_COMMITMENT_AGE() view returns (uint64)",
  ]),
  erc20: parseAbi([
    "function mint(address to, uint256 amount)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
  ]),
  factory: parseAbi([
    "function deployProxy(address implementation, uint256 salt, bytes data) returns (address)",
    "event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)",
  ]),
  userRegistryInit: parseAbi(["function initialize((address account, uint256 roleBitmap)[] grants)"]),
  resolverInit: parseAbi([
    "function initialize((address account, uint256 roleBitmap)[] grants, bytes[] calls)",
  ]),
  resolver: parseAbi([
    "function setAddress(bytes name, uint256 coinType, bytes addressBytes)",
    "function setText(bytes name, string key, string value)",
    "function grantSetterRoles(bytes setter, address account)",
    "function revokeRoles(uint256 resource, uint256 roleBitmap, address account) returns (bool)",
    "function hasRoles(uint256 resource, uint256 roleBitmap, address account) view returns (bool)",
  ]),
  registry: parseAbi([
    "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)",
    "function setSubregistry(uint256 anyId, address registry)",
    "function getExpiry(uint256 anyId) view returns (uint64)",
    "function findOwner(string label) view returns (address)",
    "function getSubregistry(string label) view returns (address)",
    "function unregister(uint256 anyId)",
  ]),
};

export const rpcUrl = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
export const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });

export function walletFor(envKey: string) {
  const key = process.env[envKey];
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error(`Missing or invalid env: ${envKey}`);
  const account = privateKeyToAccount(key as Hex);
  const client = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });
  return { account, client };
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

// Appends KEY=value to .env if the key is not there yet (never overwrites, never prints values).
export function saveEnv(key: string, value: string, envPath = new URL("../../.env", import.meta.url)) {
  const current = readFileSync(envPath, "utf8");
  if (new RegExp(`^${key}=`, "m").test(current)) return;
  appendFileSync(envPath, `${current.endsWith("\n") ? "" : "\n"}${key}=${value}\n`);
}

export function labelId(label: string): bigint {
  return BigInt(keccak256(toHex(label)));
}

export const txLink = (hash: Hex) => `https://sepolia.etherscan.io/tx/${hash}`;
export const addrLink = (a: string) => `https://sepolia.etherscan.io/address/${a}`;
