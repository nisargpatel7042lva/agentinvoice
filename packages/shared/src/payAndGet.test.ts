import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import { payAndGet, getSpentToday, resetSpentTodayForTesting } from "./payAndGet";

const URL_ = "http://score.test/score?vault=0x2222222222222222222222222222222222222222";
const PAY_TO = "0.0.5005";

// A real x402 v2 challenge, as @x402/express sends it (PAYMENT-REQUIRED header).
function challenge(amount: string, over: Record<string, unknown> = {}) {
  const pr = {
    x402Version: 2,
    error: "Payment required",
    resource: { url: URL_, description: "score", mimeType: "application/json" },
    accepts: [{ scheme: "exact", network: "hedera:testnet", asset: "0.0.0", amount, payTo: PAY_TO, maxTimeoutSeconds: 60, extra: { feePayer: "0.0.7162784" }, ...over }],
  };
  return new Response(JSON.stringify({}), { status: 402, headers: { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(pr as never) } });
}

function settled(body: unknown) {
  const receipt = { success: true, transaction: "0.0.9001@1793952000.000000001", network: "hedera:testnet", payer: "0.0.9001" };
  return new Response(JSON.stringify(body), { status: 200, headers: { "PAYMENT-RESPONSE": encodePaymentResponseHeader(receipt as never) } });
}

const signPayment = vi.fn(async () => ({ "PAYMENT-SIGNATURE": "signed-by-test" }));

beforeEach(() => {
  resetSpentTodayForTesting();
  signPayment.mockClear();
});

describe("payAndGet: real x402 flow with spending controls", () => {
  it("refuses a host outside the policy without sending anything", async () => {
    const f = vi.fn();
    const r = await payAndGet(URL_, { fetch: f, policy: { allowedHosts: ["other.test"] }, signPayment });
    expect(r).toEqual({ ok: false, reason: "Host score.test not allowed by policy" });
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses above the per-call cap before signing", async () => {
    const f = vi.fn(async () => challenge("20000000"));
    const r = await payAndGet(URL_, { fetch: f, policy: { perCallCap: "10000000" }, signPayment });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/exceeds per-call cap/);
    expect(signPayment).not.toHaveBeenCalled();
  });

  it("refuses a recipient that is not allowed, a non-HBAR asset, or another network", async () => {
    const run = (res: Response, policy = {}) => payAndGet(URL_, { fetch: vi.fn(async () => res), policy, signPayment });
    expect(await run(challenge("1000"), { allowedPayTo: ["0.0.1"] })).toMatchObject({ ok: false, reason: `Recipient ${PAY_TO} not allowed` });
    expect(await run(challenge("1000", { asset: "0.0.123" }))).toMatchObject({ ok: false, reason: "Asset 0.0.123 is not native HBAR" });
    expect(await run(challenge("1000", { network: "hedera:mainnet" }))).toMatchObject({ ok: false });
    expect(signPayment).not.toHaveBeenCalled();
  });

  it("signs, retries with the payment header, returns data and the settlement tx, and tracks the daily budget", async () => {
    const calls: RequestInit[] = [];
    const f = vi.fn(async (_u: string, init?: RequestInit) => {
      calls.push(init ?? {});
      return init?.headers ? settled({ band: "A" }) : challenge("5000000");
    });
    const audit = vi.fn();
    const r = await payAndGet<{ band: string }>(URL_, { fetch: f as never, policy: { dailyBudget: "8000000" }, signPayment, onAudit: audit });
    expect(r).toEqual({ ok: true, data: { band: "A" }, txId: "0.0.9001@1793952000.000000001", amount: "5000000" });
    expect(calls[1].headers).toEqual({ "PAYMENT-SIGNATURE": "signed-by-test" });
    expect(getSpentToday()).toBe(5_000_000n);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ type: "x402.payment", amount: "5000000" }));

    const second = await payAndGet(URL_, { fetch: f as never, policy: { dailyBudget: "8000000" }, signPayment });
    expect(second.ok).toBe(false);
    expect(!second.ok && second.reason).toMatch(/Daily budget exhausted/);
  });

  it("refuses to pay with no payer configured, and passes free responses through", async () => {
    const noPayer = await payAndGet(URL_, { fetch: vi.fn(async () => challenge("1000")) });
    expect(noPayer).toMatchObject({ ok: false, reason: expect.stringMatching(/No payer configured/) });
    const free = await payAndGet(URL_, { fetch: vi.fn(async () => new Response(JSON.stringify({ hi: 1 }), { status: 200 })) });
    expect(free).toEqual({ ok: true, data: { hi: 1 } });
  });
});
