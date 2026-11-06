import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, parseAbiParameters } from "viem";
import { buildApp } from "../app.js";
import { testSaucerSwapConfig } from "./saucerswap.js";

function quoteHex(amountOut: bigint) {
  return encodeAbiParameters(parseAbiParameters("uint256, uint160[], uint32[], uint256"), [amountOut, [], [], 1n]);
}

describe("saucerswap routes", () => {
  const apps: { close: () => Promise<void> }[] = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  it("returns 503 when saucerswap is disabled", async () => {
    const app = buildApp({ dbPath: ":memory:", world: null, saucerswap: { enabled: false, config: null } });
    apps.push(app);
    expect((await app.inject({ method: "GET", url: "/api/saucerswap/status" })).statusCode).toBe(503);
    expect((await app.inject({ method: "GET", url: "/api/saucerswap/quote" })).statusCode).toBe(503);
  });

  it("returns status and quote when configured (mocked Mirror)", async () => {
    const fetchAll = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/contracts/call")) {
        return new Response(JSON.stringify({ result: quoteHex(2_425_296n) }), { status: 200 });
      }
      if (url.includes("/tokens")) {
        return new Response(JSON.stringify({ tokens: [{ token_id: "0.0.5449", balance: 0 }] }), { status: 200 });
      }
      if (url.includes("/accounts/")) {
        return new Response(JSON.stringify({ balance: { balance: 1_000_000_000 } }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;

    const app = buildApp({
      dbPath: ":memory:",
      world: null,
      saucerswap: {
        enabled: true,
        config: testSaucerSwapConfig({ operatorAccountId: "0.0.9001" }),
        fetchImpl: fetchAll,
      },
    });
    apps.push(app);

    const status = await app.inject({ method: "GET", url: "/api/saucerswap/status" });
    expect(status.statusCode).toBe(200);
    const body = status.json();
    expect(body.usdc.tokenId).toBe("0.0.5449");
    expect(body.usdc.caveat).toMatch(/Circle/);
    expect(body.operator.accountId).toBe("0.0.9001");
    expect(body.dryRun).toBe(true);

    const quote = await app.inject({ method: "GET", url: "/api/saucerswap/quote" });
    expect(quote.statusCode).toBe(200);
    expect(quote.json()).toMatchObject({ ok: true, tokenOut: "0.0.5449" });
  });
});
