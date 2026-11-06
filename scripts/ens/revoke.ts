// Task 1.11: revokes (unregisters) an agent subname and shows its state before and after.
// Usage: bun scripts/ens/revoke.ts [label]   (default label: the demo agent's label from ENS_AGENT_NAME)
// Add --create-temp to register a throwaway subname first, so the real demo agent is not destroyed in a test:
//   bun scripts/ens/revoke.ts revoketest --create-temp
// Only the sponsor (ROLE_UNREGISTER on the user registry) can do this.
import { zeroAddress, type Address } from "viem";
import { abis, labelId, publicClient, requireEnv, txLink, walletFor } from "./lib.js";

const args = process.argv.slice(2);
const createTemp = args.includes("--create-temp");
const label = args.find((a) => !a.startsWith("--")) ?? requireEnv("ENS_AGENT_NAME").split(".")[0]!;
const registry = requireEnv("ENS_USER_REGISTRY_ADDRESS") as Address;
const resolver = requireEnv("ENS_RESOLVER_ADDRESS") as Address;
const { account, client } = walletFor("SPONSOR_PRIVATE_KEY");

async function state() {
  const [owner, expiry] = await Promise.all([
    publicClient.readContract({ address: registry, abi: abis.registry, functionName: "findOwner", args: [label] }),
    publicClient.readContract({ address: registry, abi: abis.registry, functionName: "getExpiry", args: [labelId(label)] }),
  ]);
  const now = BigInt(Math.floor(Date.now() / 1000));
  return { owner, expiry: new Date(Number(expiry) * 1000).toISOString(), active: owner !== zeroAddress && expiry > now };
}

async function wait(hash: `0x${string}`, what: string) {
  const r = await publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${what} reverted: ${txLink(hash)}`);
  console.log(`${what}: ${txLink(hash)}`);
}

if (createTemp) {
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 7 * 86_400);
  await wait(
    await client.writeContract({
      address: registry,
      abi: abis.registry,
      functionName: "register",
      args: [label, account.address, zeroAddress, resolver, 0x1111111111111111111111111111111111111111111111111111111111111111n, expiry],
    }),
    `register temp ${label}`,
  );
  await new Promise((r) => setTimeout(r, 4000)); // public RPC can lag a block
}

console.log("BEFORE", label, await state());
await wait(
  await client.writeContract({ address: registry, abi: abis.registry, functionName: "unregister", args: [labelId(label)] }),
  `unregister ${label}`,
);
await new Promise((r) => setTimeout(r, 4000));
const after = await state();
console.log("AFTER ", label, after);
process.exit(after.active ? 1 : 0);
