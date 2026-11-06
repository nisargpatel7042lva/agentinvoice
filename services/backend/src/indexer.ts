import type Database from "better-sqlite3";
import { getMeta, setMeta } from "./db.js";
import type { Status } from "@agentinvoice/shared";
import { keccak256, toHex, zeroAddress, type Address, type Hex } from "viem";

// Indexes InvoiceMarket events into SQLite and keeps each referenced invoice in sync with the chain.
// Only InvoiceFunded is frozen in spec v2, so the indexer does not depend on other event names: for every log whose
// first indexed argument is an invoice id it stores the event and then re-reads the invoice with getInvoice(id).
// Rows it writes are tagged source = "chain"; it never touches "seed" rows or the off-chain description.

export interface RawLog {
  txHash: string;
  logIndex: number;
  blockNumber: bigint;
  topics: readonly Hex[];
  data: Hex;
}

export interface ChainInvoice {
  supplier: Address;
  buyerVault: Address;
  faceAmount: bigint;
  price: bigint;
  dueDate: bigint;
  status: number; // enum index: Pending, Open, Funded, Paid, Late, Defaulted
  bond: Address;
  holder: Address;
  evidenceHash: Hex;
}

export interface ChainReader {
  getBlockNumber(): Promise<bigint>;
  getLogs(fromBlock: bigint, toBlock: bigint): Promise<RawLog[]>;
  getInvoice(id: bigint): Promise<ChainInvoice>;
}

export interface InvoiceChange {
  invoiceId: string;
  from: Status | null; // null the first time the invoice is seen
  to: Status;
}

const STATUS_NAMES = ["Pending", "Open", "Funded", "Paid", "Late", "Defaulted"] as const;

const topic0 = (signature: string) => keccak256(toHex(signature));
const KNOWN_EVENTS = new Map<string, string>([[topic0("InvoiceFunded(uint256,address,uint256)"), "InvoiceFunded"]]);

// Writes one invoice read from the chain (source = "chain") and reports its status change. Used by the indexer and by
// POST /api/invoices, so both paths map a ChainInvoice the same way. Never overwrites "seed" rows or the description.
export function upsertChainInvoice(db: Database.Database, id: string, inv: ChainInvoice, nowSeconds: number): InvoiceChange {
  const before = db.prepare("SELECT status FROM invoices WHERE id = ?").get(id) as { status: Status } | undefined;
  const status = STATUS_NAMES[inv.status];
  if (!status) throw new Error(`invoice ${id} has unknown status index ${inv.status}`);
  db.prepare(
    `INSERT INTO invoices (id, supplier, buyer_vault, face_amount, price, due_date, status, bond, holder, evidence_hash, source, updated_at)
     VALUES (@id, @supplier, @buyerVault, @faceAmount, @price, @dueDate, @status, @bond, @holder, @evidenceHash, 'chain', @updatedAt)
     ON CONFLICT (id) DO UPDATE SET
       supplier = excluded.supplier, buyer_vault = excluded.buyer_vault, face_amount = excluded.face_amount,
       price = excluded.price, due_date = excluded.due_date, status = excluded.status, bond = excluded.bond,
       holder = excluded.holder, evidence_hash = excluded.evidence_hash, updated_at = excluded.updated_at
     WHERE invoices.source = 'chain'`,
  ).run({
    id,
    supplier: inv.supplier,
    buyerVault: inv.buyerVault,
    faceAmount: inv.faceAmount.toString(),
    price: inv.price.toString(),
    dueDate: Number(inv.dueDate),
    status,
    bond: inv.bond === zeroAddress ? null : inv.bond,
    holder: inv.holder === zeroAddress ? null : inv.holder,
    evidenceHash: inv.evidenceHash,
    updatedAt: nowSeconds,
  });
  return { invoiceId: id, from: before?.status ?? null, to: status };
}

export interface IndexerOptions {
  db: Database.Database;
  reader: ChainReader;
  startBlock?: bigint; // first block to index when the database is empty; defaults to the chain head
  reorgDepth?: number; // how many recent blocks to re-read on every poll
  maxRange?: bigint; // getLogs window; Hedera's RPC limit is UNVERIFIED, so this is configurable
  retries?: number;
  now?: () => number; // unix seconds
  sleep?: (ms: number) => Promise<void>;
  onError?: (err: unknown) => void;
  onChange?: (changes: InvoiceChange[]) => void; // called after invoices were refreshed from new events
}

export function getLastSyncedAt(db: Database.Database): number | null {
  const v = getMeta(db, "last_synced_at");
  return v === null ? null : Number(v);
}

export function createIndexer(opts: IndexerOptions) {
  const { db, reader } = opts;
  const reorgDepth = BigInt(opts.reorgDepth ?? 5);
  const maxRange = opts.maxRange ?? 1000n;
  const retries = opts.retries ?? 3;
  const now = opts.now ?? (() => Math.floor(Date.now() / 1000));
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (attempt >= retries) throw err;
        await sleep(200 * attempt);
      }
    }
  }

  const insertEvent = db.prepare(
    `INSERT OR IGNORE INTO events (tx_hash, log_index, block_number, invoice_id, name, data, source)
     VALUES (@txHash, @logIndex, @blockNumber, @invoiceId, @name, @data, 'chain')`,
  );
  async function refreshInvoice(id: string): Promise<InvoiceChange> {
    const inv = await withRetry(() => reader.getInvoice(BigInt(id)));
    return upsertChainInvoice(db, id, inv, now());
  }

  async function indexRange(from: bigint, to: bigint) {
    const logs = await withRetry(() => reader.getLogs(from, to));
    const touched = new Set<string>();
    db.transaction(() => {
      for (const l of logs) {
        const invoiceId = l.topics[1] ? BigInt(l.topics[1]).toString() : null;
        const name = KNOWN_EVENTS.get(l.topics[0] ?? "") ?? `Unknown:${(l.topics[0] ?? "").slice(0, 10)}`;
        const res = insertEvent.run({
          txHash: l.txHash,
          logIndex: l.logIndex,
          blockNumber: Number(l.blockNumber),
          invoiceId,
          name,
          data: JSON.stringify({ topics: l.topics, data: l.data }),
        });
        if (res.changes > 0 && invoiceId !== null) touched.add(invoiceId); // only new events cause a refresh
      }
    })();
    const changes: InvoiceChange[] = [];
    for (const id of touched) changes.push(await refreshInvoice(id));
    if (changes.length > 0) opts.onChange?.(changes);
  }

  // One poll: read from (last indexed block - reorgDepth + 1) to the head, in chunks. Progress is saved only
  // after every chunk succeeded, so a failure is simply retried on the next poll.
  async function pollOnce() {
    const head = await withRetry(() => reader.getBlockNumber());
    const lastBlock = getMeta(db, "last_block");
    let from: bigint;
    if (lastBlock !== null) {
      from = BigInt(lastBlock) - reorgDepth + 1n;
      if (opts.startBlock !== undefined && from < opts.startBlock) from = opts.startBlock;
    } else {
      from = opts.startBlock ?? head - reorgDepth + 1n;
    }
    if (from < 0n) from = 0n;

    for (let start = from; start <= head; start += maxRange) {
      const end = start + maxRange - 1n < head ? start + maxRange - 1n : head;
      await indexRange(start, end);
    }
    setMeta(db, "last_block", head.toString());
    setMeta(db, "last_synced_at", String(now()));
  }

  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;
  return {
    pollOnce,
    start(intervalMs = 5000) {
      if (timer) return;
      timer = setInterval(async () => {
        if (running) return; // never overlap polls
        running = true;
        try {
          await pollOnce();
        } catch (err) {
          opts.onError?.(err);
        } finally {
          running = false;
        }
      }, intervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
  };
}
