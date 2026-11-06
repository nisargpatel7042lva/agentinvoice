// Registers the demo agent wallet in World AgentBook through the official CLI, then looks it up.
// Usage: bun scripts/register-agent.ts [--status] [--network base|base-sepolia] [--manual]
// Reads AGENTKIT_AGENT_ADDRESS from .env (bun loads it). Registration needs World App on a phone:
// the CLI shows a QR code and deep link that you scan. See docs/notes/world-agentkit.md.
import { spawnSync } from "node:child_process";
import { createAgentBookVerifier } from "@worldcoin/agentkit";

const address = process.env.AGENTKIT_AGENT_ADDRESS;
if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
  throw new Error("Missing or invalid env: AGENTKIT_AGENT_ADDRESS (a 0x wallet address)");
}

const args = process.argv.slice(2);
const statusOnly = args.includes("--status");
const passthrough = args.filter((a) => a !== "--status");

const agentBook = createAgentBookVerifier({ rpcUrl: process.env.WORLD_CHAIN_RPC_URL || undefined });

async function printLookup() {
  const humanId = await agentBook.lookupHuman(address as string);
  console.log(humanId ? `REGISTERED. humanId: ${humanId}` : "NOT REGISTERED (lookup returned null).");
  console.log(`Explorer (World Chain, UNVERIFIED link pattern): https://worldscan.org/address/${address}`);
  return humanId;
}

if (!statusOnly) {
  console.log(`Registering ${address} with the AgentKit CLI. Scan the QR code with World App.`);
  const res = spawnSync("npx", ["@worldcoin/agentkit-cli", "register", address, ...passthrough], { stdio: "inherit" });
  if (res.status !== 0) {
    console.error(`agentkit-cli register exited with status ${res.status}. Write the blocker in docs/notes/world-agentkit.md.`);
    process.exit(res.status ?? 1);
  }
}

const humanId = await printLookup();
process.exit(humanId ? 0 : statusOnly ? 1 : 2);
