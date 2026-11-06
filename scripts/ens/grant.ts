// Task 1.10: gives the ens-publisher wallet the least privilege: it may write ONLY the paid, late and status
// text records. The sponsor (resolver root roles holder) keeps limit, threshold and sponsor, and can revoke.
// Usage: bun scripts/ens/grant.ts
import { encodeFunctionData, keccak256, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { abis, LEGACY_KEYS, PUBLISHER_KEYS, ROLE_SET_TEXT, SPONSOR_KEYS, publicClient, requireEnv, txLink, walletFor } from "./lib.js";

const resolver = requireEnv("ENS_RESOLVER_ADDRESS") as Address;
const { client } = walletFor("SPONSOR_PRIVATE_KEY");
const publisher = privateKeyToAccount(requireEnv("ENS_PUBLISHER_KEY") as Hex).address;

const keyResource = (key: string) => BigInt(keccak256(toHex(key)));
const canSetText = (key: string, who: Address) =>
  publicClient.readContract({
    address: resolver,
    abi: abis.resolver,
    functionName: "hasRoles",
    args: [keyResource(key), ROLE_SET_TEXT, who],
  });

for (const key of PUBLISHER_KEYS) {
  if (await canSetText(key, publisher)) {
    console.log(`already granted: ${key}`);
    continue;
  }
  // The setter is the calldata of setText for that key; only the key scopes the role.
  const setter = encodeFunctionData({ abi: abis.resolver, functionName: "setText", args: ["0x", key, ""] });
  const hash = await client.writeContract({
    address: resolver,
    abi: abis.resolver,
    functionName: "grantSetterRoles",
    args: [setter, publisher],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`grant ${key} reverted: ${txLink(hash)}`);
  console.log(`granted ${key}: ${txLink(hash)}`);
}

// Remove the publisher's roles on the pre-spec keys (least privilege).
for (const key of LEGACY_KEYS) {
  if (!(await canSetText(key, publisher))) continue;
  const hash = await client.writeContract({
    address: resolver,
    abi: abis.resolver,
    functionName: "revokeRoles",
    args: [keyResource(key), ROLE_SET_TEXT, publisher],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`revoke ${key} reverted: ${txLink(hash)}`);
  console.log(`revoked legacy ${key}: ${txLink(hash)}`);
}
await new Promise((r) => setTimeout(r, 4000)); // public RPC can lag a block

console.log("publisher", publisher);
for (const key of [...PUBLISHER_KEYS, ...SPONSOR_KEYS, ...LEGACY_KEYS]) {
  console.log(`  can set ${key}: ${await canSetText(key, publisher)}`);
}
