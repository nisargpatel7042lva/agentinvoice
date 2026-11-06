import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate, SCHEMA_VERSION } from "./db.js";

const tables = (db: Database.Database) =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map(
    (r) => r.name,
  );

describe("migrate", () => {
  it("creates all tables and records the schema version", () => {
    const db = new Database(":memory:");
    migrate(db);

    expect(tables(db)).toEqual(["approvals", "cibil_attestations", "events", "invoices", "meta"]);
    const v = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string };
    expect(Number(v.value)).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(3);
  });

  it("is idempotent and keeps existing rows", () => {
    const db = new Database(":memory:");
    migrate(db);
    db.prepare("INSERT INTO meta (key, value) VALUES ('probe', '1')").run();
    migrate(db);

    expect(db.prepare("SELECT value FROM meta WHERE key = 'probe'").get()).toEqual({ value: "1" });
  });

  it("rejects a bad source and a duplicate event log", () => {
    const db = new Database(":memory:");
    migrate(db);
    const insertInvoice = (source: string) =>
      db
        .prepare(
          `INSERT INTO invoices (id, supplier, buyer_vault, face_amount, price, due_date, status, evidence_hash, source, updated_at)
           VALUES ('1', '0xa', '0xb', '100', '95', 1, 'Open', '0xe', ?, 0)`,
        )
        .run(source);
    expect(() => insertInvoice("nope")).toThrow();
    insertInvoice("chain");

    const insertEvent = () =>
      db.prepare("INSERT INTO events (tx_hash, log_index, block_number, name, source) VALUES ('0xt', 0, 1, 'X', 'chain')").run();
    insertEvent();
    expect(insertEvent).toThrow();
  });
});
