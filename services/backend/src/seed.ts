import type Database from "better-sqlite3";
import { STATUSES } from "@invoiceagent/shared";

// Clearly labelled DEMO rows so the UI is never empty before real chain data exists. Every row is tagged
// source = "seed" and its description starts with "DEMO", so the UI can tell it apart from rows indexed from the chain.
// Seed ids start at 9000001 to stay clear of real on-chain ids.
const SEED_BASE_ID = 9_000_000;
const DEMO_SUPPLIER = "0x00000000000000000000000000000000000d3e01";
const DEMO_VAULT = "0x00000000000000000000000000000000000d3e02";
const DEMO_HOLDER = "0x00000000000000000000000000000000000d3e03";
const DEMO_EVIDENCE = `0x${"de".repeat(32)}`;

export function seedDemoInvoices(db: Database.Database, nowSeconds = Math.floor(Date.now() / 1000)): number {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO invoices (id, supplier, buyer_vault, face_amount, price, due_date, status, bond, holder, evidence_hash, description, source, updated_at)
     VALUES (@id, @supplier, @vault, @face, @price, @due, @status, NULL, @holder, @evidence, @description, 'seed', @now)`,
  );
  let inserted = 0;
  db.transaction(() => {
    STATUSES.forEach((status, i) => {
      const funded = status !== "Pending" && status !== "Open";
      const res = insert.run({
        id: String(SEED_BASE_ID + i + 1),
        supplier: DEMO_SUPPLIER,
        vault: DEMO_VAULT,
        face: "100000000",
        price: "95000000",
        due: nowSeconds + (status === "Late" || status === "Defaulted" ? -86_400 : 7 * 86_400),
        status,
        holder: funded ? DEMO_HOLDER : null,
        evidence: DEMO_EVIDENCE,
        description: `DEMO: sample ${status} invoice (not on chain)`,
        now: nowSeconds,
      });
      inserted += res.changes;
    });
  })();
  return inserted;
}

// Removes seed rows only. Rows indexed from the chain are never touched.
export function removeSeed(db: Database.Database): number {
  return db.prepare("DELETE FROM invoices WHERE source = 'seed'").run().changes;
}
