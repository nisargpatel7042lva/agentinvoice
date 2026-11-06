import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { setMeta } from "./db.js";

describe("GET /health", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("returns ok and creates the SQLite file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentinvoice-"));
    dirs.push(dir);
    const dbPath = join(dir, "test.db");

    const app = buildApp({ dbPath });
    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      ok: true,
      db: "ok",
      degraded: false,
      indexer: { enabled: false, lastSyncedAt: null, lagSeconds: null },
      ens: { enabled: false, lastCheckAt: null, lastPublishAt: null },
      audit: { enabled: false },
    });
    expect(existsSync(dbPath)).toBe(true);
    await app.close();
  });

  it("reports indexer lag and the last ENS publish, and flags a stuck indexer as degraded", async () => {
    const app = buildApp({ dbPath: ":memory:", world: null, features: { indexer: true, ens: true } });
    const now = Math.floor(Date.now() / 1000);

    const fresh = (await app.inject({ method: "GET", url: "/health" })).json();
    expect(fresh).toMatchObject({ degraded: true, indexer: { enabled: true, lastSyncedAt: null, lagSeconds: null } }); // never synced

    setMeta(app.db, "last_synced_at", String(now - 5));
    setMeta(app.db, "last_ens_publish_at", String(now - 30));
    const ok = (await app.inject({ method: "GET", url: "/health" })).json();
    expect(ok.degraded).toBe(false);
    expect(ok.indexer.lagSeconds).toBeGreaterThanOrEqual(5);
    expect(ok.ens.lastPublishAt).toBe(now - 30);

    setMeta(app.db, "last_synced_at", String(now - 600));
    expect((await app.inject({ method: "GET", url: "/health" })).json().degraded).toBe(true);
    await app.close();
  });
});
