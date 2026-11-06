import { beforeEach, describe, expect, it, vi } from "vitest";
import { payAndGet, resetSpentTodayForTesting } from "./payAndGet";

describe("payAndGet spending controls (v2-M4)", () => {
  beforeEach(() => {
    resetSpentTodayForTesting();
    vi.restoreAllMocks();
  });

  it("refuses request if host is not in allowedHosts policy", async () => {
    const onAudit = vi.fn();
    const result = await payAndGet("http://evil.com/score", {
      policy: {
        allowedHosts: ["localhost", "api.agentinvoice.xyz"],
      },
      onAudit,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("not allowed by policy");
    }
    expect(onAudit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "x402.refusal" })
    );
  });

  it("refuses request if requested amount exceeds perCallCap", async () => {
    // Mock 402 response demanding 5 HBAR
    global.fetch = vi.fn().mockResolvedValueOnce({
      status: 402,
      ok: false,
      headers: new Headers({ "x402-payment-required": "true" }),
      json: async () => ({
        amount: "5000000000000000000", // 5 HBAR
        payTo: "0x1111111111111111111111111111111111111111",
      }),
    } as unknown as Response);

    const onAudit = vi.fn();
    const result = await payAndGet("http://localhost:3000/score", {
      policy: {
        perCallCap: "2000000000000000000", // 2 HBAR cap
      },
      onAudit,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("exceeds per-call cap");
    }
    expect(onAudit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "x402.refusal" })
    );
  });

  it("refuses request if daily budget is exhausted", async () => {
    // Mock 402 response demanding 8 HBAR
    global.fetch = vi.fn().mockResolvedValueOnce({
      status: 402,
      ok: false,
      headers: new Headers({ "x402-payment-required": "true" }),
      json: async () => ({
        amount: "8000000000000000000", // 8 HBAR
        payTo: "0x1111111111111111111111111111111111111111",
      }),
    } as unknown as Response);

    const result = await payAndGet("http://localhost:3000/score", {
      policy: {
        dailyBudget: "5000000000000000000", // 5 HBAR budget
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Daily budget exhausted");
    }
  });


  it("pays and returns data when within budget and limits", async () => {
    // 1st request -> 402
    // 2nd request -> 200 with score
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        status: 402,
        ok: false,
        headers: new Headers({ "x402-payment-required": "true" }),
        json: async () => ({
          amount: "1000000000000000000", // 1 HBAR
          payTo: "0x1111111111111111111111111111111111111111",
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({
          vault: "0x1111111111111111111111111111111111111111",
          band: "A",
          onTimeRate: 100,
        }),
      } as unknown as Response);

    const onAudit = vi.fn();
    const result = await payAndGet("http://localhost:3000/score", {
      policy: {
        perCallCap: "2000000000000000000",
        dailyBudget: "10000000000000000000",
      },
      onAudit,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        vault: "0x1111111111111111111111111111111111111111",
        band: "A",
        onTimeRate: 100,
      });
      expect(result.txId).toBeDefined();
    }
    expect(onAudit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "x402.payment" })
    );
  });
});
