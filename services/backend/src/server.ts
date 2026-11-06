import { sweepExpired } from "./approval/store.js";
import { auditEventForStatus, hederaSubmit, publishAudit, type AuditInput } from "./audit/audit.js";
import { buildApp } from "./app.js";
import { hederaReader } from "./chain/reader.js";
import { EnvError, loadEnv, type Config } from "./env.js";
import { liveEnsDeps } from "./ens/live.js";
import { createEnsPublisher } from "./ens/publisher.js";
import { createIndexer } from "./indexer.js";

// Starts the API, the chain indexer, the ENS publisher, the approval sweeper and the HCS audit publisher
// (each optional one only when its environment group is set), and shuts them down cleanly on SIGINT/SIGTERM.

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
  features: { indexer: Boolean(config.indexer), ens: Boolean(config.ens), audit: Boolean(submit) },
  onAudit: (event: AuditInput) => {
    if (!submit) return;
    void publishAudit(event, { submit, onError: (err) => app.log.warn({ message: (err as Error).message }, "audit publish failed") });
  },
});

for (const feature of config.disabled) app.log.warn(`${feature} is off (its environment variables are not set)`);

const publisher = config.ens
  ? createEnsPublisher({
      db: app.db,
      vault: config.ens.vault,
      deps: {
        ...liveEnsDeps({ name: config.ens.agentName, resolver: config.ens.resolver, publisherKey: config.ens.publisherKey, rpcUrl: config.ens.sepoliaRpcUrl }),
        onError: (err) => app.log.warn({ message: (err as Error).message }, "ens publish attempt failed"), // message only, never keys
      },
    })
  : undefined;
if (publisher) {
  publisher.start();
  app.addHook("onClose", async () => publisher.stop());
}

if (config.indexer) {
  const indexer = createIndexer({
    db: app.db,
    reader: hederaReader(config.indexer.market, config.indexer.rpcUrl),
    startBlock: config.indexer.startBlock,
    onError: (err) => app.log.error({ err }, "indexer poll failed"),
    onChange: (changes) => {
      publisher?.trigger();
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
