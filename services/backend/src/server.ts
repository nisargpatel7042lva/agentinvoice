import { buyerVaultAbi, hederaTestnet } from "@invoiceagent/shared";
import { createPublicClient, http } from "viem";
import { sweepExpired } from "./approval/store.js";
import { auditEventForStatus, hederaSubmit, publishAudit, type AuditInput } from "./audit/audit.js";
import { buildApp } from "./app.js";
import { hederaIssuer } from "./chain/issuer.js";
import { hederaReader } from "./chain/reader.js";
import { errorMessage } from "./errors.js";
import { EnvError, loadEnv, type Config } from "./env.js";
import { liveEnsDeps } from "./ens/live.js";
import { liveMintDeps } from "./ens/liveMint.js";
import { createApprovalSigner } from "./approval/sign.js";
import { createEnsPublisher } from "./ens/publisher.js";
import { atsIssuer } from "./bond/ats.js";
import { createBondService } from "./bond/service.js";
import { createIndexer } from "./indexer.js";

// Starts the API, the chain indexer, the ENS publisher, the approval sweeper and the HCS audit publisher
// (each optional one only when its environment group is set), and shuts them down cleanly on SIGINT/SIGTERM.

// Seller ENS minting is on only when the sponsor key, user registry, resolver and parent name are all set.
function mintFromEnv() {
  const e = process.env;
  if (!e.SPONSOR_PRIVATE_KEY || !e.ENS_USER_REGISTRY_ADDRESS || !e.ENS_RESOLVER_ADDRESS || !e.ENS_PARENT_LABEL) return undefined;
  return liveMintDeps({ sponsorKey: e.SPONSOR_PRIVATE_KEY as `0x${string}`, userRegistry: e.ENS_USER_REGISTRY_ADDRESS as `0x${string}`, resolver: e.ENS_RESOLVER_ADDRESS as `0x${string}`, parentLabel: e.ENS_PARENT_LABEL, rpcUrl: e.SEPOLIA_RPC_URL || undefined });
}

function buyerMintFromEnv() {
  const base = mintFromEnv();
  if (!base) return undefined;
  const rpc = process.env.HEDERA_RPC_URL || process.env.HEDERA_TESTNET_RPC_URL || hederaTestnet.rpcUrl;
  const client = createPublicClient({ chain: { id: hederaTestnet.id, name: hederaTestnet.name, nativeCurrency: hederaTestnet.nativeCurrency, rpcUrls: { default: { http: [rpc] } } }, transport: http(rpc, { timeout: 15_000, retryCount: 1 }) });
  return { ...base, vaultOwner: async (vault: `0x${string}`) => (await client.readContract({ address: vault, abi: buyerVaultAbi, functionName: "owner" })) as `0x${string}` };
}

// Large-payment approvals are signed by the vault's verifier key (the sponsor wallet), only after World ID approval.
function approvalSignerFromEnv() {
  const key = process.env.APPROVAL_SIGNER_PRIVATE_KEY || process.env.SPONSOR_PRIVATE_KEY;
  return key ? createApprovalSigner(key as `0x${string}`, hederaTestnet.id) : undefined;
}

let config: Config;
try {
  config = loadEnv();
} catch (err) {
  if (err instanceof EnvError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

let submit: ((message: string) => Promise<void>) | undefined;
if (config.hcs?.submit) {
  submit = await hederaSubmit({ ...config.hcs.submit, topicId: config.hcs.topicId });
}

const app = buildApp({
  dbPath: config.dbPath,
  world: config.world ? { ...config.world, appUrl: config.appUrl, ttlSeconds: config.approvalTtlSeconds } : null,
  audit: { topicId: config.hcs?.topicId },
  issuer: config.issuer && config.indexer ? hederaIssuer({ market: config.indexer.market, privateKey: config.issuer.privateKey, rpcUrl: config.indexer.rpcUrl }) : undefined,
  minter: mintFromEnv(),
  buyerMinter: buyerMintFromEnv(),
  approvalSigner: approvalSignerFromEnv(),
  trustProxy: process.env.TRUST_PROXY === "1",
  features: { indexer: Boolean(config.indexer), ens: Boolean(config.ens), audit: Boolean(submit) },
  onAudit: (event: AuditInput) => {
    if (!submit) return;
    void publishAudit(event, { submit, onError: (err) => app.log.warn({ message: errorMessage(err) }, "audit publish failed") });
  },
});

for (const feature of config.disabled) app.log.warn(`${feature} is off (its environment variables are not set)`);

const publisher = config.ens
  ? createEnsPublisher({
      db: app.db,
      vault: config.ens.vault,
      deps: {
        ...liveEnsDeps({ name: config.ens.agentName, resolver: config.ens.resolver, publisherKey: config.ens.publisherKey, rpcUrl: config.ens.sepoliaRpcUrl }),
        onError: (err) => app.log.warn({ message: errorMessage(err) }, "ens publish attempt failed"), // message only, never keys
      },
    })
  : undefined;
if (publisher) {
  publisher.start();
  app.addHook("onClose", async () => publisher.stop());
}

// Hedera Tokenize: mirror funded invoices as ATS bond units. On only when ATS_BOND_ADDRESS is set and an issuer wallet exists.
const bondService =
  process.env.ATS_BOND_ADDRESS && config.issuer
    ? createBondService({ db: app.db, ats: atsIssuer(config.issuer.privateKey), bond: process.env.ATS_BOND_ADDRESS as `0x${string}`, onError: (err, id) => app.log.warn({ message: errorMessage(err), invoiceId: id }, "bond step failed, will retry") })
    : undefined;
if (bondService) {
  const timer = setInterval(() => void bondService.reconcile(), 20_000);
  app.addHook("onClose", async () => clearInterval(timer));
}

if (config.indexer) {
  const indexer = createIndexer({
    db: app.db,
    reader: hederaReader(config.indexer.market, config.indexer.rpcUrl),
    startBlock: config.indexer.startBlock,
    onError: (err) => app.log.error({ err }, "indexer poll failed"),
    onChange: (changes) => {
      publisher?.trigger();
      void bondService?.reconcile();
      for (const c of changes) {
        if (c.from !== c.to) app.audit({ type: auditEventForStatus(c.to), invoiceId: c.invoiceId, data: { from: c.from, to: c.to } });
      }
    },
  });
  indexer.start(5000);
  app.addHook("onClose", async () => indexer.stop());
}

// Expire approvals nobody used, every 30 seconds.
const sweeper = setInterval(() => {
  try {
    for (const id of sweepExpired(app.db, Math.floor(Date.now() / 1000))) {
      app.audit({ type: "approval.expired", invoiceId: null, data: { approvalId: id } });
    }
  } catch (err) {
    app.log.error({ err }, "approval sweep failed");
  }
}, 30_000);
app.addHook("onClose", async () => clearInterval(sweeper));

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  app.log.info(`${signal} received: shutting down`);
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  try {
    await app.close(); // stops the indexer, publisher and sweeper, then closes the database
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, "error during shutdown");
    process.exit(1);
  }
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port: config.port, host: "0.0.0.0" });
