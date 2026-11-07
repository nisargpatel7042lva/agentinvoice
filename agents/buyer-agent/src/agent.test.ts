import { afterEach, describe, expect, it, vi } from "vitest";
import { invoiceFixtures, type Address, type Hash32, type Invoice } from "@invoiceagent/shared";
import { createBuyerAgent, MAX_RETRIES } from "./agent.js";
import { loadConfig } from "./config.js";
import { log } from "./logger.js";

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
    const wired = deps([funded], { now: () => funded.dueDate });
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

  it("stops retrying after three failed transactions", async () => {
    const wired = deps([invoiceFixtures[0]], { accept: vi.fn(async () => { throw new Error("rpc down"); }) });
    const agent = createBuyerAgent(wired);
    for (let i = 0; i < MAX_RETRIES; i += 1) await agent.tick();
    expect(wired.accept).toHaveBeenCalledTimes(MAX_RETRIES);
    await agent.tick();
    expect(wired.accept).toHaveBeenCalledTimes(MAX_RETRIES);
  });

  it("handles HederaAgentAccount in partner demo mode", async () => {
    const lines: string[] = [];
    const wired = deps([invoiceFixtures[0]], {
      log: (line) => lines.push(line),
      accept: vi.fn(async () => `0x${"aa".repeat(32)}` as Hash32),
    });
    await createBuyerAgent(wired).tick();
    expect(wired.accept).toHaveBeenCalled();
    expect(lines.some((line) => line.includes("action=accept"))).toBe(true);
  });
});

describe("many vaults", () => {
  const VAULT_B = "0xb0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0" as Address;
  const VAULT_C = "0xc0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0" as Address;
  const mine = invoiceFixtures[0]; // pending, default vault
  const forB = { ...invoiceFixtures[0], id: "2", buyerVault: VAULT_B, evidenceHash: `0x${"22".repeat(32)}` as Hash32 };
  const forC = { ...invoiceFixtures[0], id: "3", buyerVault: VAULT_C, evidenceHash: `0x${"33".repeat(32)}` as Hash32 };
  const opsFake = () => ({
    readSupplier: vi.fn(async () => ({ allowed: true, limit: 1_000_000_000n })),
    readThreshold: vi.fn(async () => 1_000_000_000n),
    accept: vi.fn(async () => hash),
    pay: vi.fn(async () => hash),
  });

  it("serves the default vault and a registered one in the same tick, each with its own ops", async () => {
    const opsB = opsFake();
    const wired = deps([mine, forB], { extraVaults: async () => [VAULT_B], opsFor: async () => opsB });
    await createBuyerAgent(wired).tick();
    expect(wired.accept).toHaveBeenCalledWith(1n);
    expect(wired.accept).toHaveBeenCalledTimes(1);
    expect(opsB.accept).toHaveBeenCalledWith(2n);
  });

  it("never spends from a vault whose on-chain agent is someone else, and says so once", async () => {
    const lines: string[] = [];
    const opsFor = vi.fn(async () => null);
    const wired = deps([forB], { extraVaults: async () => [VAULT_B], opsFor, log: (l: string) => lines.push(l) });
    const agent = createBuyerAgent(wired);
    await agent.tick();
    await agent.tick();
    expect(wired.accept).not.toHaveBeenCalled();
    expect(opsFor).toHaveBeenCalledTimes(1);
    expect(lines.filter((l) => l.includes("not its on-chain agent"))).toHaveLength(1);
  });

  it("keeps serving the other vaults when one fails, and retries the failed one next tick", async () => {
    const opsB = opsFake();
    let calls = 0;
    const opsFor = vi.fn(async (vault: Address) => {
      if (vault === VAULT_C && calls++ === 0) throw new Error("rpc down");
      return vault === VAULT_B ? opsB : opsFake();
    });
    const wired = deps([mine, forB, forC], { extraVaults: async () => [VAULT_B, VAULT_C], opsFor });
    const agent = createBuyerAgent(wired);
    await agent.tick();
    expect(wired.accept).toHaveBeenCalledWith(1n);
    expect(opsB.accept).toHaveBeenCalledWith(2n);
    await agent.tick();
    expect(opsFor).toHaveBeenCalledWith(VAULT_C);
    expect(calls).toBe(2);
  });

  it("falls back to the default vault when the vault list cannot be read", async () => {
    const wired = deps([mine], { extraVaults: async () => { throw new Error("backend down"); }, opsFor: async () => null });
    await createBuyerAgent(wired).tick();
    expect(wired.accept).toHaveBeenCalledWith(1n);
  });
});

describe("large payments with a sponsor approval", () => {
  const funded = () => invoiceFixtures.find((invoice) => invoice.status === "Funded")!;
  const signed = "0xabcdef" as `0x${string}`;

  it("pays an invoice above the threshold with the signed approval once a human approved it", async () => {
    const inv = funded();
    const approvalFor = vi.fn(async () => signed);
    const wired = deps([inv], { now: () => inv.dueDate, readThreshold: async () => 1n, approvalFor });
    await createBuyerAgent(wired).tick();
    expect(approvalFor).toHaveBeenCalledWith(inv.id);
    expect(wired.pay).toHaveBeenCalledWith(BigInt(inv.id), signed);
  });

  it("does not pay above the threshold while no approval exists, and says it needs one", async () => {
    const inv = funded();
    const lines: string[] = [];
    const wired = deps([inv], { now: () => inv.dueDate, readThreshold: async () => 1n, approvalFor: async () => null, log: (l: string) => lines.push(l) });
    await createBuyerAgent(wired).tick();
    expect(wired.pay).not.toHaveBeenCalled();
    expect(lines.some((l) => l.includes("needs sponsor approval"))).toBe(true);
  });

  it("does not ask for an approval below the threshold or before the due date", async () => {
    const inv = funded();
    const approvalFor = vi.fn(async () => signed);
    const below = deps([inv], { now: () => inv.dueDate, approvalFor });
    await createBuyerAgent(below).tick();
    expect(approvalFor).not.toHaveBeenCalled();
    expect(below.pay).toHaveBeenCalledWith(BigInt(inv.id));
    const early = deps([inv], { now: () => inv.dueDate - 100, readThreshold: async () => 1n, approvalFor });
    await createBuyerAgent(early).tick();
    expect(approvalFor).not.toHaveBeenCalled();
  });

  it("treats a failing approval lookup as no approval", async () => {
    const inv = funded();
    const wired = deps([inv], { now: () => inv.dueDate, readThreshold: async () => 1n, approvalFor: async () => { throw new Error("backend down"); } });
    await createBuyerAgent(wired).tick();
    expect(wired.pay).not.toHaveBeenCalled();
  });
});
