import { describe, expect, it, vi } from "vitest";
import { invoiceFixtures, scoreFixtures, type Invoice, type BuyerScore } from "@agentinvoice/shared";
import { createInvestorAgent, MAX_RETRIES } from "./agent.js";
import { decide, rulesFromEnv, type Rules } from "./decide.js";
import { createScoreReader, SCORE_TTL_MS } from "./score.js";

const [A, B, C, NEW] = scoreFixtures;
const open = invoiceFixtures.find((i) => i.status === "Open")!; // face 10 HBAR, price 9.5 HBAR (500 bps)
const rules: Rules = { minBand: "B", minDiscountBps: 100, maxPrice: 2_000_000_000n, maxOpenExposure: 2_000_000_000n };
const forVault = (s: BuyerScore): Invoice => ({ ...open, buyerVault: s.vault });

describe("decide", () => {
  it("buys band A and band B at minimum B", () => {
    expect(decide(forVault(A), A, rules).action).toBe("buy");
    expect(decide(forVault(B), B, rules).action).toBe("buy");
  });
  it("skips band C", () => {
    expect(decide(forVault(C), C, rules)).toEqual({ action: "skip", reason: "band C below minimum B" });
  });
  it("skips band New", () => {
    expect(decide(forVault(NEW), NEW, rules)).toEqual({ action: "skip", reason: "band New: no payment history" });
  });
  it("buys band C only when MIN_BAND=C", () => {
    expect(decide(forVault(C), C, { ...rules, minBand: "C" }).action).toBe("buy");
  });
  it("skips non-Open, missing score, low discount, high price, over exposure", () => {
    const funded = invoiceFixtures.find((i) => i.status === "Funded")!;
    expect(decide(funded, A, rules).reason).toMatch(/not Open/);
    expect(decide(open, null, rules).reason).toBe("no score available");
    expect(decide(open, A, { ...rules, minDiscountBps: 600 }).reason).toMatch(/discount 500 bps below/);
    expect(decide(open, A, { ...rules, maxPrice: 1n }).reason).toMatch(/above max/);
    expect(decide(open, A, rules, 1_500_000_000n).reason).toMatch(/exceed max/);
  });
  it("reads rules from env with MIN_BAND default B", () => {
    expect(rulesFromEnv({}).minBand).toBe("B");
    expect(rulesFromEnv({ MAX_PRICE: "1.5" }).maxPrice).toBe(150_000_000n);
    expect(() => rulesFromEnv({ MIN_BAND: "D" })).toThrow();
  });

  it("skips when CIBIL risk recommendation is Reject or below minimum score", () => {
    const badCibil = {
      invoiceId: open.id,
      supplier: {
        address: open.supplier,
        role: "supplier" as const,
        score: 420,
        tier: "Poor" as const,
        totalInvoices: 3,
        settledInvoices: 3,
        defaultedInvoices: 1,
        summary: "Poor rating",
        asOf: Date.now(),
      },
      buyer: {
        address: open.buyerVault,
        role: "buyer" as const,
        score: 750,
        tier: "Excellent" as const,
        totalInvoices: 5,
        settledInvoices: 5,
        defaultedInvoices: 0,
        summary: "Excellent rating",
        asOf: Date.now(),
      },
      investmentGrade: false,
      riskRecommendation: "Reject" as const,
      recommendedDiscountBps: 2000,
      asOf: Date.now(),
    };

    const res = decide(forVault(A), A, rules, 0n, badCibil);
    expect(res.action).toBe("skip");
    expect(res.reason).toMatch(/CIBIL risk recommendation: Reject/);
  });
});

describe("score cache", () => {
  it("pays once per vault per 60 s and re-pays after", async () => {
    let t = 0;
    const pay = vi.fn(async () => ({ ok: true as const, data: A }));
    const getScore = createScoreReader("https://score.test", pay, () => t);
    await getScore(A.vault);
    await getScore(A.vault.toUpperCase().replace("0X", "0x"));
    expect(pay).toHaveBeenCalledTimes(1);
    expect(pay).toHaveBeenCalledWith(`https://score.test/score?vault=${A.vault}`);
    t = SCORE_TTL_MS + 1;
    await getScore(A.vault);
    expect(pay).toHaveBeenCalledTimes(2);
  });
  it("does not cache a failed payment", async () => {
    const pay = vi.fn().mockResolvedValueOnce({ ok: false, reason: "402 failed" }).mockResolvedValue({ ok: true, data: A });
    const getScore = createScoreReader("https://score.test", pay);
    await expect(getScore(A.vault)).rejects.toThrow();
    await expect(getScore(A.vault)).resolves.toEqual(A);
  });
});

describe("agent loop", () => {
  function setup(invoices: Invoice[], buy = vi.fn(async () => "0xabc" as const)) {
    const lines: string[] = [];
    const scores = new Map(scoreFixtures.map((s) => [s.vault.toLowerCase(), s]));
    const agent = createInvestorAgent({
      api: { listInvoices: vi.fn(async () => invoices) },
      getScore: async (v) => scores.get(v.toLowerCase())!,
      buy,
      rules,
      log: (l) => lines.push(l),
    });
    return { agent, lines, buy };
  }

  it("skips band C and buys band A, one line each", async () => {
    const c = { ...forVault(C), id: "10" };
    const a = { ...forVault(A), id: "11" };
    const { agent, lines, buy } = setup([c, a]);
    expect(await agent.tick()).toBe("11");
    expect(buy).toHaveBeenCalledWith(11n, 950_000_000n * 10n ** 10n);
    expect(lines[0]).toMatch(/^invoice=10 band=C discount=500bps skipped reason="band C below minimum B"$/);
    expect(lines[1]).toMatch(/^invoice=11 band=A discount=500bps bought tx=0xabc/);
  });

  it("buys at most one invoice per loop", async () => {
    const { agent, lines, buy } = setup([{ ...forVault(A), id: "1" }, { ...forVault(B), id: "2" }]);
    await agent.tick();
    expect(buy).toHaveBeenCalledTimes(1);
    expect(lines[1]).toMatch(/already bought one invoice this loop/);
  });

  it("caps retries at 3", async () => {
    const buy = vi.fn(async () => { throw new Error("rpc down"); });
    const { agent, lines } = setup([{ ...forVault(A), id: "7" }], buy);
    for (let i = 0; i < MAX_RETRIES + 1; i++) await agent.tick();
    expect(buy).toHaveBeenCalledTimes(MAX_RETRIES);
    expect(lines.at(-1)).toMatch(/gave up after 3 failed buys/);
  });

  it("DRY_RUN never calls buy, stop() ends the loop", async () => {
    const buy = vi.fn();
    const agent = createInvestorAgent({
      api: { listInvoices: async () => [forVault(A)] },
      getScore: async () => A,
      buy,
      rules,
      dryRun: true,
      log: () => {},
    });
    const run = agent.run(1);
    agent.stop();
    await run;
    expect(buy).not.toHaveBeenCalled();
  });
});
