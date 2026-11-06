import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import type { SupportedResponse, VerifyResponse, SettleResponse } from "@x402/core/types";
import type { FacilitatorClient } from "@x402/core/server";
import { buildPaidExpressApp } from "./expressApp.js";

// Helper to invoke Express middleware in-memory without loopback network restrictions
interface MockRes extends EventEmitter {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  setHeader: (k: string, v: string) => void;
  getHeader: (k: string) => string | undefined;
  status: (code: number) => MockRes;
  json: (data: unknown) => MockRes;
  send: (data: unknown) => MockRes;
  end: (data?: unknown) => MockRes;
}

function makeMockRes(): { res: MockRes; done: Promise<MockRes> } {
  let resolve: (res: MockRes) => void;
  const done = new Promise<MockRes>((r) => {
    resolve = r;
  });

  const res = new EventEmitter() as MockRes;
  res.statusCode = 200;
  res.headers = {};
  res.setHeader = (k, v) => {
    res.headers[k.toLowerCase()] = v;
  };
  res.getHeader = (k) => res.headers[k.toLowerCase()];
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.body = data;
    resolve(res);
    return res;
  };
  res.send = (data) => {
    res.body = data;
    resolve(res);
    return res;
  };
  res.end = (data) => {
    if (data && !res.body) res.body = data;
    resolve(res);
    return res;
  };

  return { res, done };
}

function makeMockReq(options: { url?: string; headers?: Record<string, string> }) {
  return {
    method: "GET",
    url: options.url || "/ping",
    headers: options.headers || { host: "localhost:4020" },
    connection: { encrypted: false },
    socket: { encrypted: false },
    get(name: string) {
      return (this.headers as Record<string, string>)[name.toLowerCase()];
    },
  };
}

function dispatch(app: unknown, req: unknown, res: unknown): void {
  (app as { handle: (req: unknown, res: unknown) => void }).handle(req, res);
}

describe("x402 Express GET /ping (Prompt 4)", () => {
  const mockFacilitator: FacilitatorClient = {
    getSupported: async (): Promise<SupportedResponse> => ({
      kinds: [
        {
          x402Version: 2,
          scheme: "exact",
          network: "hedera:testnet",
          extra: { feePayer: "0.0.7162784" },
        },
      ],
      extensions: [],
      signers: { "hedera:*": ["0.0.7162784"] },
    }),
    verify: async (): Promise<VerifyResponse> => ({
      isValid: false,
      invalidReason: "invalid_exact_hedera_payload_signature_invalid",
      invalidMessage: "Payer signature verification failed",
    }),
    settle: async (): Promise<SettleResponse> => ({
      success: false,
      transaction: "",
      network: "hedera:testnet",
      errorReason: "settlement_failed",
    }),
  };

  const app = buildPaidExpressApp({
    payTo: "0.0.5001",
    price: "10000000", // 0.1 HBAR in tinybars
    facilitatorClient: mockFacilitator,
  });

  it("returns 402 with correct PaymentRequired header when unpaid", async () => {
    const req = makeMockReq({ url: "/ping" });
    const { res, done } = makeMockRes();
    dispatch(app, req, res);
    const result = await done;

    expect(result.statusCode).toBe(402);

    const paymentRequiredHeader = result.getHeader("payment-required");
    expect(paymentRequiredHeader).toBeTruthy();

    const paymentRequired = decodePaymentRequiredHeader(paymentRequiredHeader!);
    expect(paymentRequired.x402Version).toBe(2);
    expect(paymentRequired.accepts).toHaveLength(1);

    const requirement = paymentRequired.accepts[0];
    expect(requirement.scheme).toBe("exact");
    expect(requirement.network).toBe("hedera:testnet");
    expect(requirement.asset).toBe("0.0.0"); // HBAR
    expect(requirement.amount).toBe("10000000"); // 0.1 HBAR in tinybars
    expect(requirement.payTo).toBe("0.0.5001");
    expect(requirement.extra?.feePayer).toBe("0.0.7162784"); // facilitator sponsored
  });

  it("rejects malformed payment header with 402 Payment Required", async () => {
    const req = makeMockReq({
      url: "/ping",
      headers: {
        host: "localhost:4020",
        "payment-signature": "not-valid-base64-json!!!",
      },
    });
    const { res, done } = makeMockRes();
    dispatch(app, req, res);
    const result = await done;

    expect(result.statusCode).toBe(402);
  });

  it("rejects forged or invalid payment payload with 402", async () => {
    const fakePayload = Buffer.from(
      JSON.stringify({
        x402Version: 2,
        accepted: {
          scheme: "exact",
          network: "hedera:testnet",
          asset: "0.0.0",
          amount: "10000000",
          payTo: "0.0.5001",
          extra: { feePayer: "0.0.7162784" },
        },
        payload: { transaction: "fake-unverified-transaction" },
      }),
    ).toString("base64");

    const req = makeMockReq({
      url: "/ping",
      headers: {
        host: "localhost:4020",
        "payment-signature": fakePayload,
      },
    });
    const { res, done } = makeMockRes();
    dispatch(app, req, res);
    const result = await done;

    expect(result.statusCode).toBe(402);
  });
});
