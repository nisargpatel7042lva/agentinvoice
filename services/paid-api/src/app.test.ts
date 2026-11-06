import { describe, expect, it } from "vitest";
import { buildPaidApp, computeBand } from "./app.js";

describe("paid-api x402 score service (Prompt 5)", () => {
  const app = buildPaidApp({
    payTo: "0x2222222222222222222222222222222222222222",
    price: "1500000000000000000",
  });

  it("returns 200 on /health", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", service: "paid-api" });
  });

  it("returns 400 if vault parameter is missing", async () => {
    const res = await app.inject({ method: "GET", url: "/score" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("Missing required query parameter");
  });

  it("returns 400 if vault parameter is malformed", async () => {
    const res = await app.inject({ method: "GET", url: "/score?vault=invalid-address" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("Invalid vault address");
  });

  it("returns 402 with payment requirements when no payment provided", async () => {
    const validVault = "0x1234567890123456789012345678901234567890";
    const res = await app.inject({ method: "GET", url: `/score?vault=${validVault}` });

    expect(res.statusCode).toBe(402);
    expect(res.headers["www-authenticate"]).toContain("x402");
    expect(res.headers["x402-payment-required"]).toBe("true");

    const body = res.json();
    expect(body.error).toBe("Payment Required");
    expect(body.payTo).toBe("0x2222222222222222222222222222222222222222");
    expect(body.amount).toBe("1500000000000000000");
    expect(body.network).toBe("hedera:testnet");
  });

  it("returns 200 with BuyerScore when x402 payment header is present", async () => {
    const validVault = "0x1234567890123456789012345678901234567890";
    const res = await app.inject({
      method: "GET",
      url: `/score?vault=${validVault}`,
      headers: {
        authorization: "x402 tx=0.0.999@1700000000.000",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.vault).toBe(validVault);
    expect(body.band).toBe("A");
    expect(body.onTimeRate).toBe(100);
    expect(body.paid).toBe(5);
    expect(body.asOf).toBeTypeOf("number");
  });

  it("correctly computes credit score bands", () => {
    expect(computeBand(1, 0, 0).band).toBe("New");
    expect(computeBand(2, 0, 0).band).toBe("New");
    expect(computeBand(10, 0, 0).band).toBe("A");
    expect(computeBand(95, 5, 0).band).toBe("A"); // 95%
    expect(computeBand(90, 10, 0).band).toBe("B"); // 90%
    expect(computeBand(70, 30, 0).band).toBe("C"); // 70%
  });
});
