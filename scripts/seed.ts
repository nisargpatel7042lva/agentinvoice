// Inserts clearly labelled DEMO invoices (source="seed"). Does nothing unless SEED=1.
// Usage: SEED=1 bunx tsx scripts/seed.ts   (run under Node: better-sqlite3 crashes Bun 1.3.14). DB_PATH defaults to agentinvoice.db
import { openDb } from "../services/backend/src/db.js";
import { seedDemoInvoices } from "../services/backend/src/seed.js";

if (process.env.SEED !== "1") {
  console.log("SEED is not 1: not inserting demo rows.");
  process.exit(0);
}

const db = openDb(process.env.DB_PATH ?? "agentinvoice.db");
console.log(`Inserted ${seedDemoInvoices(db)} DEMO rows (source="seed").`);
db.close();
