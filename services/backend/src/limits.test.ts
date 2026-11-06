import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

let app: ReturnType<typeof buildApp>;
afterEach(() => app.close());

describe("request size limit", () => {
  it("rejects a body larger than 16 KiB with 413", async () => {
    app = buildApp({ dbPath: ":memory:", world: null });
    const res = await app.inject({ method: "POST", url: "/api/approvals", payload: { invoiceId: "1", pad: "x".repeat(20 * 1024) } });
    expect(res.statusCode).toBe(413);
  });

  it("accepts a normal body", async () => {
    app = buildApp({ dbPath: ":memory:", world: null });
    const res = await app.inject({ method: "POST", url: "/api/approvals", payload: { invoiceId: "1" } });
    expect(res.statusCode).toBe(503); // reaches the handler (World is not configured)
  });
});

describe("approval rate limits", () => {
  it("answers 429 after too many approval starts from one client, with Retry-After", async () => {
    app = buildApp({ dbPath: ":memory:", world: null, limits: { approvalStartPerMinute: 3 } });
    const post = () => app.inject({ method: "POST", url: "/api/approvals", payload: { invoiceId: "1" } });

    expect([(await post()).statusCode, (await post()).statusCode, (await post()).statusCode]).toEqual([503, 503, 503]);
    const blocked = await post();
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  it("limits the World callback and the approval status route separately", async () => {
    app = buildApp({ dbPath: ":memory:", world: null, limits: { callbackPerMinute: 2, approvalReadPerMinute: 2 } });
    const cb = () => app.inject({ method: "GET", url: "/api/world/callback?state=x" });
    const rd = () => app.inject({ method: "GET", url: "/api/approvals/abc" });

    expect([(await cb()).statusCode, (await cb()).statusCode, (await cb()).statusCode]).toEqual([503, 503, 429]);
    expect([(await rd()).statusCode, (await rd()).statusCode, (await rd()).statusCode]).toEqual([404, 404, 429]);
  });

  it("does not limit the health check or the invoice list", async () => {
    app = buildApp({ dbPath: ":memory:", world: null, limits: { approvalStartPerMinute: 1, callbackPerMinute: 1, approvalReadPerMinute: 1 } });
    for (let i = 0; i < 5; i++) {
      expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url: "/api/invoices" })).statusCode).toBe(200);
    }
  });
});
