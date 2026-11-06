import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

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
    expect(res.json()).toEqual({ ok: true, db: "ok" });
    expect(existsSync(dbPath)).toBe(true);
    await app.close();
  });
});
