import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "./config.js";
import { runLoop } from "./index.js";

const sample = {
  NEXT_PUBLIC_MOCK: "1",
  NEXT_PUBLIC_BACKEND_URL: "http://localhost:3001",
  PORT: "3001",
  DB_PATH: "agentinvoice.db",
  APP_URL: "http://localhost:3000",
};

describe("buyer-agent", () => {
  const previous = new Map<string, string | undefined>();

  afterEach(() => {
    for (const [key, old] of previous) {
      if (old === undefined) delete process.env[key];
      else process.env[key] = old;
    }
    previous.clear();
    vi.restoreAllMocks();
  });

  it("names a missing environment variable", () => {
    expect(() =>
      loadConfig({
        NEXT_PUBLIC_BACKEND_URL: sample.NEXT_PUBLIC_BACKEND_URL,
        PORT: sample.PORT,
        DB_PATH: sample.DB_PATH,
        APP_URL: sample.APP_URL,
      }),
    ).toThrow(/Missing environment variables:[\s\S]*NEXT_PUBLIC_MOCK/);
  });

  it("stops the loop when the stop flag is set", async () => {
    for (const [key, value] of Object.entries(sample)) {
      previous.set(key, process.env[key]);
      process.env[key] = value;
    }
    vi.spyOn(console, "log").mockImplementation(() => {});
    const stop = { stopped: false };
    const done = runLoop(5_000, stop);
    stop.stopped = true;
    const started = Date.now();
    await done;
    expect(Date.now() - started).toBeLessThan(1_000);
    const lines = vi.mocked(console.log).mock.calls.map((call) => String(call[0]));
    expect(lines.some((line) => line.includes("buyer-agent") && line.includes("stopped"))).toBe(true);
  });
});
