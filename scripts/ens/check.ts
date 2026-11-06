// Reads the demo agent from live Sepolia ENS through readAgentFromEns and prints it.
// Usage: bun scripts/ens/check.ts [name]   (default: ENS_AGENT_NAME from .env)
import { isRevoked, readAgentFromEns } from "../../services/backend/src/ens/read.js";
import { requireEnv } from "./lib.js";

const name = process.argv[2] ?? requireEnv("ENS_AGENT_NAME");
const agent = await readAgentFromEns(name);
console.log(agent);
console.log(isRevoked(agent) ? "REVOKED or expired" : `active until ${new Date(agent.expiresAt * 1000).toISOString()}`);
