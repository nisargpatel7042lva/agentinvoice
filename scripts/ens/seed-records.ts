// Writes the initial agentinvoice.* text records on the demo agent subname, using the right wallet for each key:
// sponsor writes limit/threshold/sponsor, the ens-publisher writes paid/late/status (real transactions).
// Usage: bun scripts/ens/seed-records.ts
import { toHex, type Address } from "viem";
import { normalize, packetToBytes } from "viem/ens";
import { abis, publicClient, requireEnv, txLink, walletFor } from "./lib.js";

const resolver = requireEnv("ENS_RESOLVER_ADDRESS") as Address;
const name = toHex(packetToBytes(normalize(requireEnv("ENS_AGENT_NAME"))));
const sponsor = walletFor("SPONSOR_PRIVATE_KEY");
const publisher = walletFor("ENS_PUBLISHER_KEY");

const records: [string, string, typeof sponsor][] = [
  ["agentinvoice.limit", "100", sponsor],
  ["agentinvoice.threshold", "10", sponsor],
  ["agentinvoice.sponsor", "pending", sponsor],
  ["agentinvoice.paid", "0", publisher],
  ["agentinvoice.late", "0", publisher],
  ["agentinvoice.status", "active", publisher],
];

for (const [key, value, wallet] of records) {
  const hash = await wallet.client.writeContract({
    address: resolver,
    abi: abis.resolver,
    functionName: "setText",
    args: [name, key, value],
  });
  const r = await publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${key} reverted: ${txLink(hash)}`);
  console.log(`${key}=${value}: ${txLink(hash)}`);
}
