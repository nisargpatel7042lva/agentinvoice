import { afterEach, describe, expect, it, vi } from "vitest";
import { invoiceFixtures, type Address, type Hash32, type Invoice } from "@agentinvoice/shared";
import { createBuyerAgent, MAX_RETRIES } from "./agent.js";
import { DUE_WITHIN_SECONDS } from "./decide.js";
import { loadConfig } from "./config.js";
import { log } from "./logger.js";
import type { InvoiceModel } from "./review.js";

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
    expect(() => loadConfig({})).toThrow(/Missing environment variables:[\s\S]*BACKEND_URL/);
  });

  it("stops the loop when the stop flag is set", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const stop = { stopped: false };
    const agent = createBuyerAgent({ ...deps([]), log });
    const done = agent.run(5_000, stop);
    stop.stopped = true;
    const started = Date.now();
    await done;
    expect(Date.now() - started).toBeLessThan(1_000);
    const lines = vi.mocked(console.log).mock.calls.map((call) => String(call[0]));
    expect(lines.some((line) => line.includes("buyer-agent") && line.includes("stopped"))).toBe(true);
  });
});

const VAULT = invoiceFixtures[0].buyerVault;
const hash = `0x${"11".repeat(32)}` as Hash32;

function reviewModel(action: "accept" | "dispute" | "escalate", reason: string): InvoiceModel & { complete: ReturnType<typeof vi.fn> } {
  return { complete: vi.fn(async () => JSON.stringify({ action, reason })) };
}

function deps(invoices: Invoice[], extra: Partial<Parameters<typeof createBuyerAgent>[0]> = {}) {
  return {
    api: {
      listInvoices: vi.fn(async (status?: Invoice["status"]) => invoices.filter((invoice) => invoice.status === status)),
      getInvoice: vi.fn(async (id: string) => {
        const found = invoices.find((invoice) => invoice.id === id);
        if (!found) throw new Error(`missing ${id}`);
        return found;
      }),
    },
    vaultAddress: VAULT,
    marketAddress: "0xb41048c7369d33d4e396ccb2e95e974b95a06d8b" as Address,
    readSupplier: vi.fn(async () => ({ allowed: true, limit: 1_000_000_000n })),
    readThreshold: vi.fn(async () => 1_000_000_000n),
    readDailyLimit: vi.fn(async () => 10_000_000_000n),
    readSpentToday: vi.fn(async () => 0n),
    readBalance: vi.fn(async () => 10_000_000_000n),
    accept: vi.fn(async () => hash),
    pay: vi.fn(async () => hash),
    now: () => invoiceFixtures[0].dueDate - 10,
    log: () => {},
    ...extra,
  };
}

describe("buyer flow", () => {
  it("accepts a pending invoice for our vault", async () => {
    const wired = deps([invoiceFixtures[0]]);
    await createBuyerAgent(wired).tick();
    expect(wired.accept).toHaveBeenCalledWith(1n);
    expect(wired.pay).not.toHaveBeenCalled();
  });

  it("ignores an invoice for another vault", async () => {
    const other = { ...invoiceFixtures[0], buyerVault: "0x9999999999999999999999999999999999999999" as Address };
    const wired = deps([other]);
    await createBuyerAgent(wired).tick();
    expect(wired.api.getInvoice).not.toHaveBeenCalled();
    expect(wired.accept).not.toHaveBeenCalled();
  });

  it("pays a due funded invoice below the threshold with no sponsor bytes", async () => {
    const funded = invoiceFixtures.find((invoice) => invoice.status === "Funded")!;
    const wired = deps([funded], { now: () => funded.dueDate, model: reviewModel("accept", "delivery matches the evidence") });
    await createBuyerAgent(wired).tick();
    expect(wired.pay).toHaveBeenCalledWith(BigInt(funded.id));
    expect(wired.accept).not.toHaveBeenCalled();
  });

  it("logs needs sponsor approval and does not pay above the threshold", async () => {
    const funded = invoiceFixtures.find((invoice) => invoice.status === "Funded")!;
    const lines: string[] = [];
    const wired = deps([funded], {
      now: () => funded.dueDate,
      readThreshold: async () => 1n,
      log: (line) => lines.push(line),
    });
    await createBuyerAgent(wired).tick();
    expect(wired.pay).not.toHaveBeenCalled();
    expect(lines.some((line) => line.includes("needs sponsor approval"))).toBe(true);
  });

  it("does not send a transaction in dry run", async () => {
    const wired = deps([invoiceFixtures[0]], { dryRun: true });
    await createBuyerAgent(wired).tick();
    expect(wired.accept).not.toHaveBeenCalled();
  });

  it("does not pay when the model disputes the invoice", async () => {
    const funded = invoiceFixtures.find((invoice) => invoice.status === "Funded")!;
    const lines: string[] = [];
    const wired = deps([funded], {
      now: () => funded.dueDate,
      model: reviewModel("dispute", "delivery does not match"),
      log: (line) => lines.push(line),
    });
    await createBuyerAgent(wired).tick();
    expect(wired.pay).not.toHaveBeenCalled();
    expect(lines.some((line) => line.includes("action=dispute") && line.includes("delivery does not match"))).toBe(true);
  });

  it("does not pay when the model escalates", async () => {
    const funded = invoiceFixtures.find((invoice) => invoice.status === "Funded")!;
    const lines: string[] = [];
    const wired = deps([funded], {
      now: () => funded.dueDate,
      model: reviewModel("escalate", "a person should check this"),
      log: (line) => lines.push(line),
    });
    await createBuyerAgent(wired).tick();
    expect(wired.pay).not.toHaveBeenCalled();
    expect(lines.some((line) => line.includes("sponsor approval is needed"))).toBe(true);
  });

  it("does not pay when the model call fails", async () => {
    const funded = invoiceFixtures.find((invoice) => invoice.status === "Funded")!;
    const lines: string[] = [];
    const wired = deps([funded], {
      now: () => funded.dueDate,
      model: { complete: vi.fn(async () => { throw new Error("sk-ant-secret123"); }) },
      log: (line) => lines.push(line),
    });
    await createBuyerAgent(wired).tick();
    expect(wired.pay).not.toHaveBeenCalled();
    expect(lines.join("\n")).not.toContain("sk-ant-secret123");
    expect(lines.some((line) => line.includes("sponsor approval is needed"))).toBe(true);
  });

  it("does not pay when the vault balance is below the face amount", async () => {
    const funded = invoiceFixtures.find((invoice) => invoice.status === "Funded")!;
    const lines: string[] = [];
    const model = reviewModel("accept", "delivery matches the evidence");
    const wired = deps([funded], {
      now: () => funded.dueDate,
      model,
      readBalance: async () => BigInt(funded.faceAmount) - 1n,
      log: (line) => lines.push(line),
    });
    await createBuyerAgent(wired).tick();
    expect(model.complete).not.toHaveBeenCalled();
    expect(wired.pay).not.toHaveBeenCalled();
    expect(lines.some((line) => line.includes("vault balance is too low"))).toBe(true);
  });

  it("does not pay when today's spend plus the invoice would pass the daily limit", async () => {
    const funded = invoiceFixtures.find((invoice) => invoice.status === "Funded")!;
    const lines: string[] = [];
    const model = reviewModel("accept", "delivery matches the evidence");
    const wired = deps([funded], {
      now: () => funded.dueDate,
      model,
      readDailyLimit: async () => BigInt(funded.faceAmount),
      readSpentToday: async () => 1n,
      log: (line) => lines.push(line),
    });
    await createBuyerAgent(wired).tick();
    expect(model.complete).not.toHaveBeenCalled();
    expect(wired.pay).not.toHaveBeenCalled();
    expect(lines.some((line) => line.includes("daily limit would be exceeded"))).toBe(true);
  });

  it("does not let an accept review override a vault rule", async () => {
    const funded = invoiceFixtures.find((invoice) => invoice.status === "Funded")!;
    const model = reviewModel("accept", "delivery matches the evidence");
    const wired = deps([funded], { now: () => funded.dueDate, readThreshold: async () => 1n, model });
    await createBuyerAgent(wired).tick();
    expect(model.complete).not.toHaveBeenCalled();
    expect(wired.pay).not.toHaveBeenCalled();
  });

  it("does not ask the model before accepting a pending invoice", async () => {
    const model = reviewModel("dispute", "delivery does not match");
    const wired = deps([invoiceFixtures[0]], { model });
    await createBuyerAgent(wired).tick();
    expect(model.complete).not.toHaveBeenCalled();
    expect(wired.accept).toHaveBeenCalledWith(1n);
  });

  it("reviews an invoice once until its evidence hash changes", async () => {
    const funded = { ...invoiceFixtures.find((invoice) => invoice.status === "Funded")! };
    const model = reviewModel("dispute", "delivery does not match");
    const wired = deps([funded], { now: () => funded.dueDate, model });
    const agent = createBuyerAgent(wired);
    await agent.tick();
    await agent.tick();
    expect(model.complete).toHaveBeenCalledTimes(1);
    expect(wired.pay).not.toHaveBeenCalled();
    funded.evidenceHash = `0x${"ee".repeat(32)}` as Hash32;
    await agent.tick();
    expect(model.complete).toHaveBeenCalledTimes(2);
  });

  it("does not call the model again after a failed review", async () => {
    const funded = invoiceFixtures.find((invoice) => invoice.status === "Funded")!;
    const model = { complete: vi.fn(async () => { throw new Error("model down"); }) };
    const wired = deps([funded], { now: () => funded.dueDate, model });
    const agent = createBuyerAgent(wired);
    await agent.tick();
    await agent.tick();
    expect(model.complete).toHaveBeenCalledTimes(1);
    expect(wired.pay).not.toHaveBeenCalled();
  });

  it("pays an invoice due within 10 seconds", async () => {
    const funded = invoiceFixtures.find((invoice) => invoice.status === "Funded")!;
    const model = reviewModel("accept", "delivery matches the evidence");
    const wired = deps([funded], { now: () => funded.dueDate - DUE_WITHIN_SECONDS, model });
    await createBuyerAgent(wired).tick();
    expect(wired.pay).toHaveBeenCalledWith(BigInt(funded.id));
  });

  it("does not pay an invoice due in more than 10 seconds", async () => {
    const funded = invoiceFixtures.find((invoice) => invoice.status === "Funded")!;
    const model = reviewModel("accept", "delivery matches the evidence");
    const wired = deps([funded], { now: () => funded.dueDate - DUE_WITHIN_SECONDS - 1, model });
    await createBuyerAgent(wired).tick();
    expect(model.complete).not.toHaveBeenCalled();
    expect(wired.pay).not.toHaveBeenCalled();
  });

  it("pays the oldest due invoice first", async () => {
    const funded = invoiceFixtures.find((invoice) => invoice.status === "Funded")!;
    const newer = { ...funded, id: "1", dueDate: funded.dueDate + DUE_WITHIN_SECONDS };
    const older = { ...funded, id: "9", dueDate: funded.dueDate };
    const model = reviewModel("accept", "delivery matches the evidence");
    const pay = vi.fn(async () => hash);
    const wired = deps([newer, older], { now: () => funded.dueDate, model, pay });
    const agent = createBuyerAgent(wired);
    await agent.tick();
    expect(pay).toHaveBeenCalledTimes(1);
    expect(pay).toHaveBeenNthCalledWith(1, 9n);
    await agent.tick();
    expect(pay).toHaveBeenNthCalledWith(2, 1n);
  });

  it("pays the next invoice on the following pass after a dispute", async () => {
    const funded = invoiceFixtures.find((invoice) => invoice.status === "Funded")!;
    const older = { ...funded, id: "9", dueDate: funded.dueDate };
    const newer = { ...funded, id: "1", dueDate: funded.dueDate + DUE_WITHIN_SECONDS };
    const pay = vi.fn(async () => hash);
    const model = {
      complete: vi.fn(async (request: { user: string }) => {
        const disputed = request.user.includes("id: 9");
        return JSON.stringify({
          action: disputed ? "dispute" : "accept",
          reason: disputed ? "delivery does not match" : "delivery matches the evidence",
        });
      }),
    };
    const wired = deps([newer, older], { now: () => funded.dueDate, model, pay });
    const agent = createBuyerAgent(wired);
    await agent.tick();
    expect(pay).not.toHaveBeenCalled();
    await agent.tick();
    expect(pay).toHaveBeenCalledTimes(1);
    expect(pay).toHaveBeenNthCalledWith(1, 1n);
  });

  it("does not pay the same invoice twice in one run", async () => {
    const funded = invoiceFixtures.find((invoice) => invoice.status === "Funded")!;
    const model = reviewModel("accept", "delivery matches the evidence");
    const wired = deps([funded], { now: () => funded.dueDate, model });
    const agent = createBuyerAgent(wired);
    await agent.tick();
    await agent.tick();
    expect(wired.pay).toHaveBeenCalledTimes(1);
    expect(model.complete).toHaveBeenCalledTimes(1);
  });

  it("stops retrying after three failed transactions", async () => {
    const wired = deps([invoiceFixtures[0]], { accept: vi.fn(async () => { throw new Error("rpc down"); }) });
    const agent = createBuyerAgent(wired);
    for (let i = 0; i < MAX_RETRIES; i += 1) await agent.tick();
    expect(wired.accept).toHaveBeenCalledTimes(MAX_RETRIES);
    await agent.tick();
    expect(wired.accept).toHaveBeenCalledTimes(MAX_RETRIES);
  });
});

describe("six invoice reviews", () => {
  const cases: {
    name: string;
    action: "accept" | "dispute";
    reason: string;
    pay: boolean;
    askModel: boolean;
    overDailyLimit?: boolean;
  }[] = [
    {
      name: "delivery matches the invoice and evidence",
      action: "accept",
      reason: "delivery matches the evidence",
      pay: true,
      askModel: true,
    },
    {
      name: "delivery details do not match",
      action: "dispute",
      reason: "delivery details do not match",
      pay: false,
      askModel: true,
    },
    {
      name: "amount exceeds the vault limit",
      action: "accept",
      reason: "delivery matches the evidence",
      pay: false,
      askModel: false,
      overDailyLimit: true,
    },
    {
      name: "evidence is missing",
      action: "dispute",
      reason: "evidence is missing",
      pay: false,
      askModel: true,
    },
    {
      name: "invoice appears to be a duplicate",
      action: "dispute",
      reason: "invoice appears to be a duplicate",
      pay: false,
      askModel: true,
    },
    {
      name: "invoice amount appears suspicious",
      action: "dispute",
      reason: "invoice amount appears suspicious",
      pay: false,
      askModel: true,
    },
  ];

  it.each(cases)("$name", async (row) => {
    const invoice = invoiceFixtures.find((item) => item.status === "Funded")!;
    const lines: string[] = [];
    const model = reviewModel(row.action, row.reason);
    const wired = deps([invoice], {
      now: () => invoice.dueDate,
      model,
      log: (line) => lines.push(line),
      ...(row.overDailyLimit
        ? { readDailyLimit: async () => BigInt(invoice.faceAmount), readSpentToday: async () => 1n }
        : {}),
    });
    await createBuyerAgent(wired).tick();
    if (row.pay) expect(wired.pay).toHaveBeenCalledTimes(1);
    else expect(wired.pay).not.toHaveBeenCalled();
    if (row.askModel) expect(model.complete).toHaveBeenCalledTimes(1);
    else expect(model.complete).not.toHaveBeenCalled();
    const expected = row.overDailyLimit ? "daily limit would be exceeded" : row.pay ? "action=pay" : row.reason;
    expect(lines.some((line) => line.includes(expected))).toBe(true);
  });
});
