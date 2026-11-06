import { hederaReader } from "./chain/reader.js";
import { buildApp } from "./app.js";
import { sweepExpired } from "./approval/store.js";
import { createIndexer } from "./indexer.js";

const dbPath = process.env.DB_PATH ?? "agentinvoice.db";
const port = Number(process.env.PORT ?? 3001);

const app = buildApp({ dbPath });

// The indexer only runs once the InvoiceMarket address is known (set after Mann deploys).
const market = process.env.INVOICE_MARKET_ADDRESS;
if (market) {
  const indexer = createIndexer({
    db: app.db,
    reader: hederaReader(market as `0x${string}`, process.env.HEDERA_RPC_URL || undefined),
    startBlock: process.env.INDEXER_START_BLOCK ? BigInt(process.env.INDEXER_START_BLOCK) : undefined,
    onError: (err) => app.log.error({ err }, "indexer poll failed"),
  });
  indexer.start(5000);
  app.addHook("onClose", async () => indexer.stop());
} else {
  app.log.warn("INVOICE_MARKET_ADDRESS not set: indexer disabled");
}

// Expire approvals nobody used, every 30 seconds.
const sweeper = setInterval(() => {
  try {
    sweepExpired(app.db, Math.floor(Date.now() / 1000));
  } catch (err) {
    app.log.error({ err }, "approval sweep failed");
  }
}, 30_000);
app.addHook("onClose", async () => clearInterval(sweeper));

await app.listen({ port, host: "0.0.0.0" });
