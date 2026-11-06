// Task 1.10 proof: simulates a setText from the ens-publisher wallet for every agentinvoice.* key.
// Publisher keys must be allowed and sponsor keys must be refused (the refused write is part of the demo).
// Usage: bun scripts/ens/refusal.ts
import { toHex, type Address } from "viem";
import { normalize, packetToBytes } from "viem/ens";
import { abis, PUBLISHER_KEYS, publicClient, requireEnv, SPONSOR_KEYS, walletFor } from "./lib.js";

const resolver = requireEnv("ENS_RESOLVER_ADDRESS") as Address;
const name = toHex(packetToBytes(normalize(requireEnv("ENS_AGENT_NAME"))));
const { account } = walletFor("ENS_PUBLISHER_KEY");

let wrong = 0;
for (const [keys, shouldAllow] of [[PUBLISHER_KEYS, true], [SPONSOR_KEYS, false]] as const) {
  for (const key of keys) {
    let allowed = true;
    let detail = "";
    try {
      await publicClient.simulateContract({
        address: resolver,
        abi: abis.resolver,
        functionName: "setText",
        args: [name, key, "probe"],
        account,
      });
    } catch (err) {
      allowed = false;
      detail = (err as Error).message.split("\n")[0] ?? "";
    }
    const ok = allowed === shouldAllow;
    if (!ok) wrong++;
    console.log(`${ok ? "OK  " : "FAIL"} publisher ${allowed ? "CAN" : "CANNOT"} write ${key}${detail ? ` (${detail.slice(0, 90)})` : ""}`);
  }
}
process.exit(wrong ? 1 : 0);
