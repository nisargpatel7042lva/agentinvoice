import type Database from "better-sqlite3";
import { setMeta } from "../db.js";

// Keeps the agent's public ENS record in sync with chain state. The publisher wallet may write ONLY paid, late and status
// (least privilege, enforced on-chain by the resolver roles and again here). limit, threshold and addr belong to the sponsor.

export const PUBLISHER_KEYS = ["paid", "late", "status"] as const;
export type PublisherKey = (typeof PUBLISHER_KEYS)[number];

export interface AgentCounts {
  paid: number;
  late: number; // Late + Defaulted
  defaulted: number;
}

// Pure. A sponsor-set "paused" is kept, except that a default always shows.
export function buildRecords(counts: AgentCounts, currentStatus: string | null): Record<PublisherKey, string> {
  const status = counts.defaulted > 0 ? "defaulted" : currentStatus === "paused" ? "paused" : "active";
  return { paid: String(counts.paid), late: String(counts.late), status };
}

export interface PublisherDeps {
  readText(key: string): Promise<string | null>;
  writeText(key: string, value: string): Promise<void>;
  retries?: number; // attempts per read or write; default 3
  sleep?: (ms: number) => Promise<void>;
  onError?: (err: unknown) => void; // must never be given a key, token or secret
}

export interface PublishResult {
  written: string[];
  unchanged: string[];
  failed: string[];
}

// Reads each current value first and writes only the keys that changed (saves gas, avoids spam). Never throws on a
// network or transaction failure: a key that still fails after the retries is reported in `failed` and retried next run.
export async function publishRecords(records: Record<string, string>, deps: PublisherDeps): Promise<PublishResult> {
  for (const key of Object.keys(records)) {
    if (!(PUBLISHER_KEYS as readonly string[]).includes(key)) throw new Error(`not a publisher key: ${key}`);
  }
  const retries = deps.retries ?? 3;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  async function attempt<T>(fn: () => Promise<T>): Promise<T> {
    for (let n = 1; ; n++) {
      try {
        return await fn();
      } catch (err) {
        deps.onError?.(err);
        if (n >= retries) throw err;
        await sleep(300 * n);
      }
    }
  }

  const result: PublishResult = { written: [], unchanged: [], failed: [] };
  for (const [key, value] of Object.entries(records)) {
    try {
      const current = await attempt(() => deps.readText(key));
      if (current === value) {
        result.unchanged.push(key);
        continue;
      }
      await attempt(() => deps.writeText(key, value));
      result.written.push(key);
    } catch {
      result.failed.push(key);
    }
  }
  return result;
}

// Counts for one buyer vault from indexed chain rows. Seed (DEMO) rows never count.
export function countsFromDb(db: Database.Database, vault: string): AgentCounts {
  const rows = db
    .prepare("SELECT status, COUNT(*) AS n FROM invoices WHERE lower(buyer_vault) = lower(?) AND source = 'chain' GROUP BY status")
    .all(vault) as { status: string; n: number }[];
  const n = (s: string) => rows.find((r) => r.status === s)?.n ?? 0;
  return { paid: n("Paid"), late: n("Late") + n("Defaulted"), defaulted: n("Defaulted") };
}

export interface EnsPublisherOptions {
  db: Database.Database;
  vault: string;
  deps: PublisherDeps;
  intervalMs?: number; // default 60 s
}

// Publishes now, and again after every indexed event that affects the agent (trigger) and on a timer.
export function createEnsPublisher(opts: EnsPublisherOptions) {
  let running = false;
  let pending = false;

  async function publishNow(): Promise<PublishResult> {
    const current = await opts.deps.readText("status").catch(() => null);
    const result = await publishRecords(buildRecords(countsFromDb(opts.db, opts.vault), current), opts.deps);
    const now = String(Math.floor(Date.now() / 1000));
    setMeta(opts.db, "last_ens_check_at", now); // for /health
    if (result.written.length > 0) setMeta(opts.db, "last_ens_publish_at", now);
    return result;
  }

  async function run() {
    if (running) {
      pending = true; // coalesce triggers that arrive during a run
      return;
    }
    running = true;
    try {
      do {
        pending = false;
        await publishNow();
      } while (pending);
    } finally {
      running = false;
    }
  }

  let timer: ReturnType<typeof setInterval> | undefined;
  return {
    publishNow,
    trigger: () => void run(),
    start() {
      if (timer) return;
      void run();
      timer = setInterval(() => void run(), opts.intervalMs ?? 60_000);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
  };
}
