import { describe, expect, it, vi } from "vitest";
import { invoiceFixtures, scoreFixtures, type Invoice, type BuyerScore } from "@agentinvoice/shared";
import { createInvestorAgent, MAX_RETRIES } from "./agent.js";
import { decide, rulesFromEnv, type Rules } from "./decide.js";
import { createScoreReader, SCORE_TTL_MS } from "./score.js";

const [A, B, C, NEW] = scoreFixtures;
const open = invoiceFixtures.find((i) => i.status === "Open")!; // face 10 HBAR, price 9.5 HBAR (500 bps)
const rules: Rules = { minScore: 650, minBand: "B", minDiscountBps: 100, maxPrice: 2_000_000_000n, maxOpenExposure: 2_000_000_000n };
const forVault = (s: BuyerScore): Invoice => ({ ...open, buyerVault: s.vault });

describe("decide", () => {
  it("buys band A and band B at minimum B and minimum score 650", () => {
    expect(decide(forVault(A), A, rules).action).toBe("buy");
    expect(decide(forVault(B), B, rules).action).toBe("buy");
  });
  it("skips when creditScore is null with 'no credit history yet'", () => {
    expect(decide(forVault(NEW), NEW, rules)).toEqual({ action: "skip", reason: "no credit history yet" });
    const withNull: BuyerScore = { ...A, creditScore: null };
    expect(decide(forVault(withNull), withNull, rules)).toEqual({ action: "skip", reason: "no credit history yet" });
  });
  it("skips when creditScore is below MIN_SCORE", () => {
    const below: BuyerScore = { ...B, creditScore: 612 };
    expect(decide(forVault(below), below, rules)).toEqual({ action: "skip", reason: "credit score 612 below minimum 650" });
  });
  it("skips band C even if creditScore passes when MIN_BAND is B", () => {
    const highCreditLowBand: BuyerScore = { ...C, creditScore: 700 };
    expect(decide(forVault(highCreditLowBand), highCreditLowBand, rules)).toEqual({ action: "skip", reason: "band C below minimum B" });
  });
  it("buys band C only when both MIN_BAND=C and creditScore >= MIN_SCORE", () => {
    const scorePassC: BuyerScore = { ...C, creditScore: 650 };
    expect(decide(forVault(scorePassC), scorePassC, { ...rules, minBand: "C" }).action).toBe("buy");
  });
  it("skips non-Open, missing score, low discount, high price, over exposure", () => {
    const funded = invoiceFixtures.find((i) => i.status === "Funded")!;
    expect(decide(funded, A, rules).reason).toMatch(/not Open/);
    expect(decide(open, null, rules).reason).toBe("no score available");
    expect(decide(open, A, { ...rules, minDiscountBps: 600 }).reason).toMatch(/discount 500 bps below/);
    expect(decide(open, A, { ...rules, maxPrice: 1n }).reason).toMatch(/above max/);
    expect(decide(open, A, rules, 1_500_000_000n).reason).toMatch(/exceed max/);
  });
  it("reads rules from env with MIN_BAND default B and MIN_SCORE default 650", () => {
    expect(rulesFromEnv({}).minBand).toBe("B");
    expect(rulesFromEnv({}).minScore).toBe(650);
    expect(rulesFromEnv({ MIN_SCORE: "750" }).minScore).toBe(750);
    expect(rulesFromEnv({ MAX_PRICE: "1.5" }).maxPrice).toBe(150_000_000n);
    expect(() => rulesFromEnv({ MIN_BAND: "D" })).toThrow();
    expect(() => rulesFromEnv({ MIN_SCORE: "299" })).toThrow(/MIN_SCORE/);
    expect(() => rulesFromEnv({ MIN_SCORE: "901" })).toThrow(/MIN_SCORE/);
    expect(() => rulesFromEnv({ MIN_SCORE: "invalid" })).toThrow(/MIN_SCORE/);
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
    expect(lines[0]).toMatch(/^invoice=10 score=480 band=C discount=500bps skipped reason="credit score 480 below minimum 650"$/);
    expect(lines[1]).toMatch(/^invoice=11 score=782 band=A discount=500bps bought tx=0xabc/);
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
