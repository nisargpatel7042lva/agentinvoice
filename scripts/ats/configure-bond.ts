// Makes an ATS bond usable by the backend issuer: the deployer (the key that created it, so it is the bond's admin) gets every role the
// issuer service needs, internal KYC is switched on, and the deployer is added to the bond's trusted issuer list (grantKyc refuses an
// issuer that is not listed). Safe to run twice: each step is skipped when it is already done.
// Usage: bunx tsx --env-file=.env scripts/ats/configure-bond.ts <bondAddress>
import { createPublicClient, createWalletClient, getAddress, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hederaTestnet } from "@invoiceagent/shared";
import { ROLES } from "../../services/backend/src/bond/ats.js";

const key = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!key) throw new Error("Missing env: DEPLOYER_PRIVATE_KEY");
const bondArg = process.argv[2];
if (!bondArg) throw new Error("Usage: configure-bond.ts <bondAddress>");
const bond = getAddress(bondArg);

const ROLE_SSI_MANAGER = "0x3120494a82251fe85b0403877539486dbfcf0f94c20741a3229cfad31f625ee1" as const;
const rpc = process.env.HEDERA_RPC_URL || hederaTestnet.rpcUrl;
const chain = { id: hederaTestnet.id, name: hederaTestnet.name, nativeCurrency: hederaTestnet.nativeCurrency, rpcUrls: { default: { http: [rpc] } } } as const;
const account = privateKeyToAccount(key);
const transport = http(rpc, { retryCount: 4, retryDelay: 1500, timeout: 30_000 });
const pub = createPublicClient({ chain, transport });
const wallet = createWalletClient({ account, chain, transport });
const abi = parseAbi([
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function grantRole(bytes32 role, address account) returns (bool)",
  "function isInternalKycActivated() view returns (bool)",
  "function activateInternalKyc() returns (bool)",
  "function isIssuer(address issuer) view returns (bool)",
  "function addIssuer(address issuer) returns (bool)",
]);

const fee = async () => ({ type: "legacy" as const, gasPrice: await pub.getGasPrice() });
async function tx(fn: "grantRole" | "activateInternalKyc" | "addIssuer", args: unknown[], label: string) {
  const hash = await wallet.writeContract({ address: bond, abi, functionName: fn, args: args as never, gas: 400_000n, ...(await fee()) });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} reverted (${hash})`);
  console.log("done:", label);
}

const roles = { ...ROLES, ssiManager: ROLE_SSI_MANAGER };
for (const [name, role] of Object.entries(roles)) {
  if (name === "admin" || name === "pauser") continue; // admin is already ours; the backend never pauses
  if (await pub.readContract({ address: bond, abi, functionName: "hasRole", args: [role, account.address] })) console.log("already:", name);
  else await tx("grantRole", [role, account.address], `grant ${name}`);
}
if (await pub.readContract({ address: bond, abi, functionName: "isInternalKycActivated" })) console.log("already: internal KYC");
else await tx("activateInternalKyc", [], "activate internal KYC");
if (await pub.readContract({ address: bond, abi, functionName: "isIssuer", args: [account.address] })) console.log("already: trusted issuer");
else await tx("addIssuer", [account.address], "add the deployer as a trusted issuer");
console.log("bond ready:", bond);
