import { z } from "zod";

// Reads and validates the process environment once, at boot. Each optional feature is configured as a group:
// all of its variables or none. A half-configured group fails fast with the names of the missing variables.
// Error messages name variables and never include their values (they may be keys or secrets).

export class EnvError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid environment:\n${problems.map((p) => `  - ${p}`).join("\n")}\nCopy .env.example to .env and fill the variables above.`);
    this.name = "EnvError";
  }
}

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "must be a 0x address (40 hex characters)");
const privateKey = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "must be a 0x private key (64 hex characters)");
const hederaId = z.string().regex(/^\d+\.\d+\.\d+$/, "must look like 0.0.12345");
const url = z.url("must be a URL");
const int = z.string().regex(/^\d+$/, "must be a non-negative integer");

export interface Config {
  port: number;
  dbPath: string;
  appUrl: string;
  approvalTtlSeconds?: number;
  world?: { clientId: string; clientSecret: string; redirectUri: string };
  ens?: { publisherKey: `0x${string}`; resolver: `0x${string}`; agentName: string; vault: `0x${string}`; sepoliaRpcUrl?: string };
  indexer?: { market: `0x${string}`; startBlock?: bigint; rpcUrl?: string };
  issuer?: { privateKey: `0x${string}` }; // wallet that creates invoices for POST /api/invoices (needs the market address)
  hcs?: { topicId: string; submit?: { accountId: string; privateKey: string } };
  disabled: string[]; // human-readable names of the features that are off
}

type Env = Record<string, string | undefined>;

export function loadEnv(raw: Env = process.env): Config {
  const env: Env = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined && v !== ""));
  const problems: string[] = [];
  const disabled: string[] = [];

  // Validates one variable. Returns the parsed value, or undefined (recording a problem if it was set but invalid).
  const get = <T>(name: string, schema: z.ZodType<T>): T | undefined => {
    const v = env[name];
    if (v === undefined) return undefined;
    const r = schema.safeParse(v);
    if (r.success) return r.data;
    problems.push(`${name}: ${r.error.issues[0]?.message ?? "invalid"}`);
    return undefined;
  };

  // A group is all-or-nothing: returns true when every name is set, false when none is, and records a problem when only some are.
  const group = (label: string, names: string[]): boolean => {
    const set = names.filter((n) => env[n] !== undefined);
    if (set.length === 0) return false;
    const missing = names.filter((n) => env[n] === undefined);
    if (missing.length > 0) problems.push(`${label}: set ${missing.join(", ")} (or unset ${set.join(", ")} to turn it off)`);
    return missing.length === 0;
  };

  const port = get("PORT", int.transform(Number).pipe(z.number().max(65535, "must be at most 65535"))) ?? 3001;
  const dbPath = env.DB_PATH ?? "agentinvoice.db";
  const appUrl = get("APP_URL", url) ?? "http://localhost:3000";
  const approvalTtlSeconds = get("APPROVAL_TTL_SECONDS", int.transform(Number).pipe(z.number().min(1, "must be at least 1")));

  let world: Config["world"];
  if (group("World approvals", ["WORLD_CLIENT_ID", "WORLD_CLIENT_SECRET", "WORLD_REDIRECT_URI"])) {
    const redirectUri = get("WORLD_REDIRECT_URI", url);
    if (redirectUri) world = { clientId: env.WORLD_CLIENT_ID as string, clientSecret: env.WORLD_CLIENT_SECRET as string, redirectUri };
  } else disabled.push("World approvals");

  let ens: Config["ens"];
  if (group("ENS publisher", ["ENS_PUBLISHER_KEY", "ENS_RESOLVER_ADDRESS", "ENS_AGENT_NAME", "DEMO_VAULT_ADDRESS"])) {
    const publisherKey = get("ENS_PUBLISHER_KEY", privateKey);
    const resolver = get("ENS_RESOLVER_ADDRESS", address);
    const vault = get("DEMO_VAULT_ADDRESS", address);
    const sepoliaRpcUrl = get("SEPOLIA_RPC_URL", url);
    if (publisherKey && resolver && vault) {
      ens = { publisherKey: publisherKey as `0x${string}`, resolver: resolver as `0x${string}`, agentName: env.ENS_AGENT_NAME as string, vault: vault as `0x${string}`, sepoliaRpcUrl };
    }
  } else disabled.push("ENS publisher");

  let indexer: Config["indexer"];
  const market = get("INVOICE_MARKET_ADDRESS", address);
  if (market) {
    const startBlock = get("INDEXER_START_BLOCK", int.transform(BigInt));
    indexer = { market: market as `0x${string}`, startBlock, rpcUrl: get("HEDERA_RPC_URL", url) };
  } else if (env.INVOICE_MARKET_ADDRESS === undefined) disabled.push("Chain indexer");

  // POST /api/invoices creates invoices from this wallet, which then is their supplier. It needs the market to call.
  let issuer: Config["issuer"];
  const supplierKey = get("SUPPLIER_PRIVATE_KEY", privateKey);
  if (env.SUPPLIER_PRIVATE_KEY !== undefined && env.INVOICE_MARKET_ADDRESS === undefined) {
    problems.push("Invoice issuer: set INVOICE_MARKET_ADDRESS (or unset SUPPLIER_PRIVATE_KEY to turn POST /api/invoices off)");
  }
  if (supplierKey && indexer) issuer = { privateKey: supplierKey as `0x${string}` };
  else if (env.SUPPLIER_PRIVATE_KEY === undefined) disabled.push("Invoice issuer (POST /api/invoices)");

  // HCS: a topic alone lets the API read the audit log; an account and key as well let it publish.
  let hcs: Config["hcs"];
  const topicId = get("HCS_TOPIC_ID", hederaId);
  const wantsSubmit = group("HCS audit publishing", ["HEDERA_ACCOUNT_ID", "HEDERA_PRIVATE_KEY"]);
  const accountId = get("HEDERA_ACCOUNT_ID", hederaId);
  if (wantsSubmit && env.HCS_TOPIC_ID === undefined) problems.push("HCS audit publishing: set HCS_TOPIC_ID (create one with scripts/hcs-create-topic.ts)");
  if (topicId) hcs = { topicId, submit: wantsSubmit && accountId ? { accountId, privateKey: env.HEDERA_PRIVATE_KEY as string } : undefined };
  if (!wantsSubmit) disabled.push("HCS audit publishing");
  if (!topicId && env.HCS_TOPIC_ID === undefined) disabled.push("HCS audit reading");

  if (problems.length > 0) throw new EnvError(problems);
  return { port, dbPath, appUrl, approvalTtlSeconds, world, ens, indexer, issuer, hcs, disabled };
}
