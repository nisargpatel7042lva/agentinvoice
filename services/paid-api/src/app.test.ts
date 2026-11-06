import { describe, expect, it, vi } from "vitest";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import type { FacilitatorClient } from "@x402/core/server";
import type { SettleResponse, SupportedResponse, VerifyResponse } from "@x402/core/types";
import { invoiceFixtures, type BuyerScore } from "@invoiceagent/shared";
import { buildPaidExpressApp, computeBand } from "./app.js";
import { dispatch, makeMockReq, makeMockRes } from "./testUtils.js";

const VAULT = "0x2222222222222222222222222222222222222222";
const PAY_TO = "0.0.5005";

function facilitator(valid: boolean): FacilitatorClient & { settle: ReturnType<typeof vi.fn> } {
  return {
    getSupported: async (): Promise<SupportedResponse> => ({
      kinds: [{ x402Version: 2, scheme: "exact", network: "hedera:testnet", extra: { feePayer: "0.0.7162784" } }],
      extensions: [],
      signers: { "hedera:*": ["0.0.7162784"] },
    }),
    verify: async (): Promise<VerifyResponse> => (valid ? { isValid: true, payer: "0.0.9001" } : { isValid: false, invalidReason: "invalid_exact_hedera_payload_signature_invalid" }),
    settle: vi.fn(async (): Promise<SettleResponse> => ({ success: true, transaction: "0.0.9001@1793952000.000000001", network: "hedera:testnet", payer: "0.0.9001" })),
  } as never;
}

const payment = Buffer.from(
  JSON.stringify({
    x402Version: 2,
    accepted: { scheme: "exact", network: "hedera:testnet", asset: "0.0.0", amount: "5000000", payTo: PAY_TO, maxTimeoutSeconds: 300, extra: { feePayer: "0.0.7162784" } },
    payload: { transaction: "signed-transfer" },
  }),
).toString("base64");

async function get(app: unknown, url: string, headers: Record<string, string> = {}) {
  const { res, done } = makeMockRes();
  dispatch(app, makeMockReq({ url, headers: { host: "localhost:4020", ...headers } }), res);
  return done;
}

describe("paid-api GET /score (real x402)", () => {
  it("refuses to start without a real payTo account", () => {
    expect(() => buildPaidExpressApp({ payTo: "0x1111111111111111111111111111111111111111", facilitatorClient: facilitator(true) })).toThrow(/PAY_TO/);
  });

  it("returns 400 for a bad vault before asking for payment", async () => {
    const app = buildPaidExpressApp({ payTo: PAY_TO, facilitatorClient: facilitator(true), loadInvoices: async () => [] });
    expect((await get(app, "/score?vault=nope")).statusCode).toBe(400);
  });

  it("answers 402 with tinybar HBAR requirements when unpaid", async () => {
    const app = buildPaidExpressApp({ payTo: PAY_TO, facilitatorClient: facilitator(true), loadInvoices: async () => [] });
    const res = await get(app, `/score?vault=${VAULT}`);
    expect(res.statusCode).toBe(402);
    const req = decodePaymentRequiredHeader(res.getHeader("payment-required")!).accepts[0];
    expect(req).toMatchObject({ scheme: "exact", network: "hedera:testnet", asset: "0.0.0", amount: "5000000", payTo: PAY_TO });
  });

  it("rejects an invalid payment and never computes the score", async () => {
    const load = vi.fn(async () => invoiceFixtures);
    const app = buildPaidExpressApp({ payTo: PAY_TO, facilitatorClient: facilitator(false), loadInvoices: load });
    expect((await get(app, `/score?vault=${VAULT}`, { "payment-signature": payment })).statusCode).toBe(402);
    expect(load).not.toHaveBeenCalled();
  });

  // Settlement (facilitator /settle) is not observable with the in-memory response; the live testnet run covers it.
  it("after a verified payment, returns the score computed from real invoice history", async () => {
    const f = facilitator(true);
    const app = buildPaidExpressApp({ payTo: PAY_TO, facilitatorClient: f, loadInvoices: async () => invoiceFixtures });
    const res = await get(app, `/score?vault=${VAULT}`, { "payment-signature": payment });
    expect(res.statusCode).toBe(200);
    // Fixtures: one invoice per status for this vault → 1 paid, 1 late, 1 defaulted = 33% on time → band C.
    expect(res.body).toMatchObject({ vault: VAULT, paid: 1, late: 1, defaulted: 1, band: "C", onTimeRate: 33, openExposure: "2000000000" });
    const body = res.body as BuyerScore;
    expect(typeof body.creditScore).toBe("number");
    expect(body.credit).toBeDefined();
    expect(body.credit?.score).toBe(body.creditScore);
    expect(body.credit?.factors).toHaveLength(5);
  });
});

describe("computeBand", () => {
  it("bands by on-time rate once there are 3+ settled invoices", () => {
    expect(computeBand(2, 0, 0).band).toBe("New");
    expect(computeBand(10, 0, 0).band).toBe("A");
    expect(computeBand(95, 5, 0).band).toBe("A");
    expect(computeBand(90, 10, 0).band).toBe("B");
    expect(computeBand(70, 30, 0).band).toBe("C");
  });
});
