import Database from "better-sqlite3";

// Tables mirror the frozen spec v2 types (packages/shared/src/types.ts). Amounts are decimal strings in base units.
// Every row carries a source: "chain" for rows indexed from Hedera testnet, "seed" for clearly labelled DEMO rows.
// Migrations are append-only: add a new entry, never edit one that has shipped.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE invoices (
    id            TEXT PRIMARY KEY,
    supplier      TEXT NOT NULL,
    buyer_vault   TEXT NOT NULL,
    face_amount   TEXT NOT NULL,
    price         TEXT NOT NULL,
    due_date      INTEGER NOT NULL,
    status        TEXT NOT NULL CHECK (status IN ('Pending','Open','Funded','Paid','Late','Defaulted')),
    bond          TEXT,
    holder        TEXT,
    evidence_hash TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    source        TEXT NOT NULL CHECK (source IN ('chain','seed')),
    updated_at    INTEGER NOT NULL
  );
  CREATE INDEX invoices_status ON invoices (status);
  CREATE INDEX invoices_supplier ON invoices (supplier);
  CREATE INDEX invoices_buyer_vault ON invoices (buyer_vault);

  CREATE TABLE events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    tx_hash      TEXT NOT NULL,
    log_index    INTEGER NOT NULL,
    block_number INTEGER NOT NULL,
    invoice_id   TEXT,
    name         TEXT NOT NULL,
    data         TEXT NOT NULL DEFAULT '{}',
    source       TEXT NOT NULL CHECK (source IN ('chain','seed')),
    UNIQUE (tx_hash, log_index)
  );
  CREATE INDEX events_invoice ON events (invoice_id);

  CREATE TABLE approvals (
    id         TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL,
    state      TEXT NOT NULL CHECK (state IN ('pending','approved','rejected','expired')),
    created_at INTEGER NOT NULL,
    decided_at INTEGER
  );

  CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  // Approval details: what the sponsor approves is derived from the invoice on the server, never from the client.
  `
  ALTER TABLE approvals ADD COLUMN vault TEXT NOT NULL DEFAULT '';
  ALTER TABLE approvals ADD COLUMN amount TEXT NOT NULL DEFAULT '0';
  ALTER TABLE approvals ADD COLUMN action TEXT NOT NULL DEFAULT 'large-payment';
  ALTER TABLE approvals ADD COLUMN nonce TEXT;
  ALTER TABLE approvals ADD COLUMN code_verifier TEXT;
  ALTER TABLE approvals ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE approvals ADD COLUMN step_up_used_at INTEGER;
  ALTER TABLE approvals ADD COLUMN consumed_at INTEGER;
  ALTER TABLE approvals ADD COLUMN subject_hash TEXT;
  CREATE INDEX approvals_invoice ON approvals (invoice_id);
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export function migrate(db: Database.Database): void {
  db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
  const current = row ? Number(row.value) : 0;

  for (let v = current; v < MIGRATIONS.length; v++) {
    const sql = (MIGRATIONS[v] as string).replace("CREATE TABLE meta (", "CREATE TABLE IF NOT EXISTS meta (");
    db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(String(v + 1));
    })();
  }
}

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}
