import { hederaReader } from "./chain/reader.js";
import { buildApp } from "./app.js";
import { hederaSubmit, publishAudit, auditEventForStatus, type AuditInput } from "./audit/audit.js";
import { sweepExpired } from "./approval/store.js";
import { createEnsPublisher } from "./ens/publisher.js";
import { liveEnsDeps } from "./ens/live.js";
import { createIndexer } from "./indexer.js";

const dbPath = process.env.DB_PATH ?? "agentinvoice.db";
const port = Number(process.env.PORT ?? 3001);

// HCS audit log: needs a topic and a funded Hedera account. Without them events are simply not published.
const { HCS_TOPIC_ID, HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY } = process.env;
let submit: ((message: string) => Promise<void>) | undefined;
if (HCS_TOPIC_ID && HEDERA_ACCOUNT_ID && HEDERA_PRIVATE_KEY) {
  submit = await hederaSubmit({ accountId: HEDERA_ACCOUNT_ID, privateKey: HEDERA_PRIVATE_KEY, topicId: HCS_TOPIC_ID });
}
const app = buildApp({
  dbPath,
  onAudit: (event: AuditInput) => {
    if (!submit) return;
    void publishAudit(event, { submit, onError: (err) => app.log.warn({ message: (err as Error).message }, "audit publish failed") });
  },
});
if (!submit) app.log.warn("HCS audit log disabled: set HCS_TOPIC_ID, HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY");

// The ENS publisher runs only when its wallet, resolver, agent name and vault are all configured.
const { ENS_PUBLISHER_KEY, ENS_RESOLVER_ADDRESS, ENS_AGENT_NAME, DEMO_VAULT_ADDRESS } = process.env;
const publisher =
  ENS_PUBLISHER_KEY && ENS_RESOLVER_ADDRESS && ENS_AGENT_NAME && DEMO_VAULT_ADDRESS
    ? createEnsPublisher({
        db: app.db,
        vault: DEMO_VAULT_ADDRESS,
        deps: {
          ...liveEnsDeps({ name: ENS_AGENT_NAME, resolver: ENS_RESOLVER_ADDRESS as `0x${string}`, publisherKey: ENS_PUBLISHER_KEY as `0x${string}` }),
          onError: (err) => app.log.warn({ message: (err as Error).message }, "ens publish attempt failed"), // message only, never keys
        },
      })
    : undefined;
if (publisher) {
  publisher.start();
  app.addHook("onClose", async () => publisher.stop());
} else {
  app.log.warn("ENS publisher disabled: set ENS_PUBLISHER_KEY, ENS_RESOLVER_ADDRESS, ENS_AGENT_NAME, DEMO_VAULT_ADDRESS");
}

// The indexer only runs once the InvoiceMarket address is known (set after Mann deploys).
const market = process.env.INVOICE_MARKET_ADDRESS;
if (market) {
  const indexer = createIndexer({
    db: app.db,
    reader: hederaReader(market as `0x${string}`, process.env.HEDERA_RPC_URL || undefined),
    startBlock: process.env.INDEXER_START_BLOCK ? BigInt(process.env.INDEXER_START_BLOCK) : undefined,
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
} else {
  app.log.warn("INVOICE_MARKET_ADDRESS not set: indexer disabled");
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

await app.listen({ port, host: "0.0.0.0" });
