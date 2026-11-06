import Database from "better-sqlite3";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it } from "vitest";
import { migrate } from "./db.js";
import { createIndexer, getLastSyncedAt, type ChainInvoice, type ChainReader, type RawLog } from "./indexer.js";

const SUPPLIER = "0x1111111111111111111111111111111111111111";
const VAULT = "0x2222222222222222222222222222222222222222";
const HOLDER = "0x3333333333333333333333333333333333333333";
const ZERO = "0x0000000000000000000000000000000000000000";
const EVIDENCE = `0x${"ab".repeat(32)}` as Hex;
const T0 = `0x${"ee".repeat(32)}` as Hex;

const idTopic = (id: number) => `0x${id.toString(16).padStart(64, "0")}` as const;
const log = (blockNumber: number, logIndex: number, id: number | null, txHash = `0xtx${blockNumber}`): RawLog => ({
  txHash,
  logIndex,
  blockNumber: BigInt(blockNumber),
  topics: id === null ? [T0] : [T0, idTopic(id)],
  data: "0x",
});

function invoice(over: Partial<ChainInvoice> = {}): ChainInvoice {
  return {
    supplier: SUPPLIER,
    buyerVault: VAULT,
    faceAmount: 100n,
    price: 95n,
    dueDate: 2_000_000_000n,
    status: 1,
    bond: ZERO,
    holder: ZERO,
    evidenceHash: EVIDENCE,
    ...over,
  };
}

function fakeReader(init: { head?: number; logs?: RawLog[]; invoices?: Record<number, ChainInvoice>; failTimes?: number } = {}) {
  const state = { head: init.head ?? 100, logs: init.logs ?? [], invoices: init.invoices ?? { 1: invoice() }, failTimes: init.failTimes ?? 0 };
  const calls = { getLogs: [] as [bigint, bigint][], getInvoice: [] as number[] };
  const reader: ChainReader = {
    getBlockNumber: async () => {
      if (state.failTimes > 0) {
        state.failTimes--;
        throw new Error("mirror lag");
      }
      return BigInt(state.head);
    },
    getLogs: async (from, to) => {
      calls.getLogs.push([from, to]);
      return state.logs.filter((l) => l.blockNumber >= from && l.blockNumber <= to);
    },
    getInvoice: async (id) => {
      calls.getInvoice.push(Number(id));
      const inv = state.invoices[Number(id)];
      if (!inv) throw new Error(`no invoice ${id}`);
      return inv;
    },
  };
  return { reader, state, calls };
}

let db: Database.Database;
beforeEach(() => {
  db = new Database(":memory:");
  migrate(db);
});

const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
const sleep = async () => {};

describe("indexer onChange", () => {
  it("reports first sight and a later status change", async () => {
    const { reader, state } = fakeReader({ logs: [log(95, 0, 1)] });
    const seen: unknown[] = [];
    const ix = createIndexer({ db, reader, startBlock: 90n, now: () => 1, sleep, onChange: (c) => void seen.push(c) });
    await ix.pollOnce();

    state.head = 110;
    state.invoices[1] = invoice({ status: 2, holder: HOLDER });
    state.logs.push(log(105, 0, 1, "0xfunded"));
    await ix.pollOnce();
    await ix.pollOnce(); // no new events: no new change

    expect(seen).toEqual([
      [{ invoiceId: "1", from: null, to: "Open" }],
      [{ invoiceId: "1", from: "Open", to: "Funded" }],
    ]);
  });
});

describe("indexer", () => {
  it("stores events and the invoice they refer to as chain rows", async () => {
    const { reader } = fakeReader({ logs: [log(95, 0, 1)] });
    const ix = createIndexer({ db, reader, startBlock: 90n, now: () => 1000, sleep });
    await ix.pollOnce();

    expect(count("events")).toBe(1);
    const row = db.prepare("SELECT * FROM invoices WHERE id = '1'").get() as Record<string, unknown>;
    expect(row).toMatchObject({ supplier: SUPPLIER, buyer_vault: VAULT, face_amount: "100", price: "95", status: "Open", bond: null, holder: null, source: "chain" });
    expect(getLastSyncedAt(db)).toBe(1000);
  });

  it("dedupes the same log across polls", async () => {
    const { reader } = fakeReader({ logs: [log(95, 0, 1)] });
    const ix = createIndexer({ db, reader, startBlock: 90n, now: () => 1, sleep });
    await ix.pollOnce();
    await ix.pollOnce();
    await ix.pollOnce();

    expect(count("events")).toBe(1);
    expect(count("invoices")).toBe(1);
  });

  it("re-reads the last 5 blocks on the next poll", async () => {
    const { reader, calls } = fakeReader({ head: 100, logs: [] });
    const ix = createIndexer({ db, reader, startBlock: 90n, now: () => 1, sleep });
    await ix.pollOnce(); // indexes 90..100
    await ix.pollOnce();

    expect(calls.getLogs[0]).toEqual([90n, 100n]);
    expect(calls.getLogs[1]).toEqual([96n, 100n]);
  });

  it("picks up a late log inside the re-read window", async () => {
    const { reader, state } = fakeReader({ head: 100, logs: [] });
    const ix = createIndexer({ db, reader, startBlock: 90n, now: () => 1, sleep });
    await ix.pollOnce();
    state.logs.push(log(99, 0, 1)); // mirror lag: a block we already passed shows up late
    await ix.pollOnce();

    expect(count("events")).toBe(1);
  });

  it("updates an invoice on a later event and keeps its description and seed rows untouched", async () => {
    const { reader, state } = fakeReader({ logs: [log(95, 0, 1)] });
    db.prepare(
      `INSERT INTO invoices (id, supplier, buyer_vault, face_amount, price, due_date, status, evidence_hash, description, source, updated_at)
       VALUES ('1', ?, ?, '100', '95', 1, 'Open', ?, 'Printing job', 'chain', 0), ('99', ?, ?, '5', '4', 1, 'Open', ?, 'DEMO', 'seed', 0)`,
    ).run(SUPPLIER, VAULT, EVIDENCE, SUPPLIER, VAULT, EVIDENCE);
    const ix = createIndexer({ db, reader, startBlock: 90n, now: () => 1, sleep });
    await ix.pollOnce();

    state.head = 110;
    state.invoices[1] = invoice({ status: 2, holder: HOLDER, bond: ZERO });
    state.logs.push(log(105, 0, 1, "0xfunded"));
    await ix.pollOnce();

    const row = db.prepare("SELECT status, holder, description FROM invoices WHERE id = '1'").get();
    expect(row).toEqual({ status: "Funded", holder: HOLDER, description: "Printing job" });
    expect(db.prepare("SELECT source FROM invoices WHERE id = '99'").get()).toEqual({ source: "seed" });
  });

  it("stores events without an indexed id and does not read an invoice for them", async () => {
    const { reader, calls } = fakeReader({ logs: [log(95, 0, null)] });
    const ix = createIndexer({ db, reader, startBlock: 90n, now: () => 1, sleep });
    await ix.pollOnce();

    expect(count("events")).toBe(1);
    expect(calls.getInvoice).toEqual([]);
  });

  it("retries a failing mirror read up to 3 times, then gives up without advancing", async () => {
    const ok = fakeReader({ failTimes: 2, logs: [log(95, 0, 1)] });
    await createIndexer({ db, reader: ok.reader, startBlock: 90n, now: () => 7, sleep }).pollOnce();
    expect(getLastSyncedAt(db)).toBe(7);

    const db2 = new Database(":memory:");
    migrate(db2);
    const bad = fakeReader({ failTimes: 3 });
    await expect(createIndexer({ db: db2, reader: bad.reader, startBlock: 90n, now: () => 9, sleep }).pollOnce()).rejects.toThrow("mirror lag");
    expect(getLastSyncedAt(db2)).toBeNull();
  });

  it("splits a long range into chunks", async () => {
    const { reader, calls } = fakeReader({ head: 2500 });
    const ix = createIndexer({ db, reader, startBlock: 1n, maxRange: 1000n, now: () => 1, sleep });
    await ix.pollOnce();

    expect(calls.getLogs).toEqual([[1n, 1000n], [1001n, 2000n], [2001n, 2500n]]);
  });
});
