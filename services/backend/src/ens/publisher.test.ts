import { describe, expect, it } from "vitest";
import { buildRecords, countsFromDb, publishRecords, type PublisherDeps } from "./publisher.js";
import { buildApp } from "../app.js";

function makeDeps(current: Record<string, string | null>, opts: { failWrites?: number; failReads?: boolean } = {}) {
  const writes: [string, string][] = [];
  const errors: string[] = [];
  let failures = opts.failWrites ?? 0;
  const deps: PublisherDeps = {
    readText: async (key) => {
      if (opts.failReads) throw new Error("rpc down");
      return current[key] ?? null;
    },
    writeText: async (key, value) => {
      if (failures > 0) {
        failures--;
        throw new Error("tx failed");
      }
      writes.push([key, value]);
      current[key] = value;
    },
    sleep: async () => {},
    onError: (err) => errors.push((err as Error).message),
  };
  return { deps, writes, errors };
}

describe("buildRecords", () => {
  it("turns counts into the three publisher records", () => {
    expect(buildRecords({ paid: 4, late: 1, defaulted: 0 }, "active")).toEqual({ paid: "4", late: "1", status: "active" });
  });

  it("marks the agent defaulted when any invoice defaulted", () => {
    expect(buildRecords({ paid: 4, late: 1, defaulted: 1 }, "active").status).toBe("defaulted");
  });

  it("keeps a sponsor-set pause but never hides a default", () => {
    expect(buildRecords({ paid: 1, late: 0, defaulted: 0 }, "paused").status).toBe("paused");
    expect(buildRecords({ paid: 1, late: 1, defaulted: 1 }, "paused").status).toBe("defaulted");
  });
});

describe("publishRecords", () => {
  const records = { paid: "4", late: "1", status: "active" };

  it("sends zero transactions when nothing changed", async () => {
    const { deps, writes } = makeDeps({ paid: "4", late: "1", status: "active" });
    const res = await publishRecords(records, deps);

    expect(writes).toEqual([]);
    expect(res).toEqual({ written: [], unchanged: ["paid", "late", "status"], failed: [] });
  });

  it("writes exactly the one key that changed", async () => {
    const { deps, writes } = makeDeps({ paid: "3", late: "1", status: "active" });
    const res = await publishRecords(records, deps);

    expect(writes).toEqual([["paid", "4"]]);
    expect(res.written).toEqual(["paid"]);
  });

  it("retries a failed write up to 3 times and then succeeds", async () => {
    const { deps, writes, errors } = makeDeps({ paid: "3", late: "1", status: "active" }, { failWrites: 2 });
    const res = await publishRecords(records, deps);

    expect(writes).toEqual([["paid", "4"]]);
    expect(res.failed).toEqual([]);
    expect(errors).toHaveLength(2);
  });

  it("gives up after 3 failed attempts without throwing", async () => {
    const { deps, writes } = makeDeps({ paid: "3", late: "1", status: "active" }, { failWrites: 99 });
    const res = await publishRecords(records, deps);

    expect(writes).toEqual([]);
    expect(res.failed).toEqual(["paid"]);
  });

  it("does not crash or write when the ENS read fails", async () => {
    const { deps, writes } = makeDeps({}, { failReads: true });
    const res = await publishRecords(records, deps);

    expect(writes).toEqual([]);
    expect(res.failed).toEqual(["paid", "late", "status"]);
  });

  it("refuses to write a key the publisher is not allowed to set, before sending anything", async () => {
    const { deps, writes } = makeDeps({});
    await expect(publishRecords({ paid: "1", limit: "999999" }, deps)).rejects.toThrow(/not a publisher key: limit/);
    expect(writes).toEqual([]);
  });
});

describe("countsFromDb", () => {
  it("counts paid, late (Late + Defaulted) and defaulted invoices for one vault, ignoring seed rows", () => {
    const app = buildApp({ dbPath: ":memory:", world: null });
    const VAULT = "0x2222222222222222222222222222222222222222";
    const add = (id: string, status: string, vault = VAULT, source = "chain") =>
      app.db
        .prepare(
          `INSERT INTO invoices (id, supplier, buyer_vault, face_amount, price, due_date, status, evidence_hash, source, updated_at)
           VALUES (?, '0xa', ?, '1', '1', 1, ?, '0xe', ?, 0)`,
        )
        .run(id, vault, status, source);
    add("1", "Paid");
    add("2", "Paid");
    add("3", "Late");
    add("4", "Defaulted");
    add("5", "Open");
    add("6", "Paid", "0x3333333333333333333333333333333333333333");
    add("7", "Paid", VAULT, "seed");

    expect(countsFromDb(app.db, VAULT.toUpperCase().replace("0X", "0x"))).toEqual({ paid: 2, late: 2, defaulted: 1 });
  });
});
