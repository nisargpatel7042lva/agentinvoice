// Task 1.9: registers (or reuses) a parent .eth name on Sepolia ENSv2 and creates the demo buyer-agent
// subname with an expiry (the credit line) and a permissioned resolver. Safe to re-run: every created
// address and name is saved to .env and reused. Run with the SPONSOR wallet, which owns everything.
// Usage: bun scripts/ens/register.ts
import { encodeFunctionData, getAddress, parseEventLogs, toHex, zeroAddress, type Address, type Hex } from "viem";
import { packetToBytes, normalize } from "viem/ens";
import { generatePrivateKey } from "viem/accounts";
import { abis, addrLink, ALL_ROLES, ENS, labelId, publicClient, saveEnv, txLink, walletFor } from "./lib.js";

const { account, client } = walletFor("SPONSOR_PRIVATE_KEY");
const ZERO32 = `0x${"0".repeat(64)}` as Hex;
const DAY = 86_400n;
const SUBLABEL = "buyer";

async function send(label: string, hash: Hex) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${txLink(hash)}`);
  console.log(`${label}: ${txLink(hash)}`);
  return receipt;
}

async function deployProxy(implementation: Address, data: Hex): Promise<Address> {
  const salt = BigInt(generatePrivateKey());
  const hash = await client.writeContract({
    address: ENS.verifiableFactory,
    abi: abis.factory,
    functionName: "deployProxy",
    args: [implementation, salt, data],
  });
  const receipt = await send("deployProxy", hash);
  const [log] = parseEventLogs({ abi: abis.factory, eventName: "ProxyDeployed", logs: receipt.logs });
  if (!log) throw new Error("ProxyDeployed event not found");
  return log.args.proxyAddress;
}

// 1. Permissioned resolver instance, owned by the sponsor.
let resolver = process.env.ENS_RESOLVER_ADDRESS as Address | undefined;
if (!resolver) {
  resolver = await deployProxy(
    ENS.permissionedResolverImpl,
    encodeFunctionData({
      abi: abis.resolverInit,
      functionName: "initialize",
      args: [[{ account: account.address, roleBitmap: ALL_ROLES }], []],
    }),
  );
  saveEnv("ENS_RESOLVER_ADDRESS", resolver);
}
console.log("resolver:", addrLink(resolver));

// 2. Parent name on the .eth registry via the commit-reveal registrar, paid in MockUSDC.
const parentLabel = process.env.ENS_PARENT_LABEL ?? `invoiceagent${Math.random().toString(36).slice(2, 6)}`;
const parentId = labelId(parentLabel);
const existingOwner = await publicClient.readContract({
  address: ENS.ethRegistry,
  abi: abis.registry,
  functionName: "findOwner",
  args: [parentLabel],
});
if (existingOwner === zeroAddress) {
  const available = await publicClient.readContract({
    address: ENS.ethRegistrar,
    abi: abis.registrar,
    functionName: "isAvailable",
    args: [parentLabel],
  });
  if (!available) throw new Error(`${parentLabel}.eth is not available`);
  saveEnv("ENS_PARENT_LABEL", parentLabel);

  const duration = 90n * DAY;
  const secret = generatePrivateKey();
  const commitment = await publicClient.readContract({
    address: ENS.ethRegistrar,
    abi: abis.registrar,
    functionName: "makeCommitment",
    args: [parentLabel, account.address, secret, zeroAddress, resolver, duration, ZERO32],
  });
  await send("commit", await client.writeContract({ address: ENS.ethRegistrar, abi: abis.registrar, functionName: "commit", args: [commitment] }));

  const [base, premium] = await publicClient.readContract({
    address: ENS.ethRegistrar,
    abi: abis.registrar,
    functionName: "getRegisterPrice",
    args: [parentLabel, duration, ENS.mockUsdc],
  });
  const price = base + premium;
  const balance = await publicClient.readContract({ address: ENS.mockUsdc, abi: abis.erc20, functionName: "balanceOf", args: [account.address] });
  if (balance < price) {
    await send("mint MockUSDC", await client.writeContract({ address: ENS.mockUsdc, abi: abis.erc20, functionName: "mint", args: [account.address, price - balance] }));
  }
  await send("approve", await client.writeContract({ address: ENS.mockUsdc, abi: abis.erc20, functionName: "approve", args: [ENS.ethRegistrar, price] }));

  const minAge = await publicClient.readContract({ address: ENS.ethRegistrar, abi: abis.registrar, functionName: "MIN_COMMITMENT_AGE" });
  console.log(`waiting ${Number(minAge) + 5}s for the commitment to age...`);
  await new Promise((r) => setTimeout(r, (Number(minAge) + 5) * 1000));

  await send(
    "register parent",
    await client.writeContract({
      address: ENS.ethRegistrar,
      abi: abis.registrar,
      functionName: "register",
      args: [parentLabel, account.address, secret, zeroAddress, resolver, duration, ENS.mockUsdc, ZERO32],
    }),
  );
} else {
  console.log(`${parentLabel}.eth already registered to ${existingOwner}`);
  if (getAddress(existingOwner) !== account.address) throw new Error("parent is owned by another wallet");
}
const parentExpiry = await publicClient.readContract({ address: ENS.ethRegistry, abi: abis.registry, functionName: "getExpiry", args: [parentId] });
const parentName = `${parentLabel}.eth`;
console.log(`parent ${parentName} expires ${new Date(Number(parentExpiry) * 1000).toISOString()}`);

// 3. User registry (subname registry) attached under the parent.
let userRegistry = process.env.ENS_USER_REGISTRY_ADDRESS as Address | undefined;
if (!userRegistry) {
  userRegistry = await deployProxy(
    ENS.userRegistryImpl,
    encodeFunctionData({
      abi: abis.userRegistryInit,
      functionName: "initialize",
      args: [[{ account: account.address, roleBitmap: ALL_ROLES }]],
    }),
  );
  saveEnv("ENS_USER_REGISTRY_ADDRESS", userRegistry);
  await send(
    "setSubregistry",
    await client.writeContract({ address: ENS.ethRegistry, abi: abis.registry, functionName: "setSubregistry", args: [parentId, userRegistry] }),
  );
}
console.log("user registry:", addrLink(userRegistry));

// 4. Demo buyer agent subname with an expiry (the credit line) and the permissioned resolver.
const subOwner = await publicClient.readContract({ address: userRegistry, abi: abis.registry, functionName: "findOwner", args: [SUBLABEL] });
if (subOwner === zeroAddress) {
  const expiry = parentExpiry - DAY; // must not outlive the parent
  await send(
    `register ${SUBLABEL}.${parentName}`,
    await client.writeContract({
      address: userRegistry,
      abi: abis.registry,
      functionName: "register",
      args: [SUBLABEL, account.address, zeroAddress, resolver, ALL_ROLES, expiry],
    }),
  );
}
const subName = `${SUBLABEL}.${parentName}`;
saveEnv("ENS_AGENT_NAME", subName);

// 5. addr record = the vault address (a placeholder until Mann deploys BuyerVault).
const vault = (process.env.DEMO_VAULT_ADDRESS as Address | undefined) ?? account.address;
await send(
  "setAddress",
  await client.writeContract({
    address: resolver,
    abi: abis.resolver,
    functionName: "setAddress",
    args: [toHex(packetToBytes(normalize(subName))), 60n, vault],
  }),
);
console.log(`DONE. ${subName} -> ${vault}${process.env.DEMO_VAULT_ADDRESS ? "" : " (placeholder: sponsor address, set DEMO_VAULT_ADDRESS after Mann deploys BuyerVault)"}`);
console.log(`Open in the ENS app: https://sepolia.app.ens.domains/${subName}`);
