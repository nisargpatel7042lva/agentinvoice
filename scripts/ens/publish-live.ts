// Writes publisher records on the live demo name through the real publishRecords (changed keys only).
// Usage: bunx tsx scripts/ens/publish-live.ts paid=1 late=0 status=active
// Keys other than paid, late and status are refused before anything is sent.
import { publishRecords } from "../../services/backend/src/ens/publisher.js";
import { liveEnsDeps } from "../../services/backend/src/ens/live.js";
import { requireEnv } from "./lib.js";

const records = Object.fromEntries(process.argv.slice(2).map((a) => a.split("=") as [string, string]));
const deps = liveEnsDeps({
  name: requireEnv("ENS_AGENT_NAME"),
  resolver: requireEnv("ENS_RESOLVER_ADDRESS") as `0x${string}`,
  publisherKey: requireEnv("ENS_PUBLISHER_KEY") as `0x${string}`,
});
console.log(await publishRecords(records, { ...deps, onError: (e) => console.log("attempt failed:", (e as Error).message) }));
