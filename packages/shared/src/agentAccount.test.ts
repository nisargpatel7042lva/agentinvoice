import { describe, expect, it, vi } from "vitest";
import {
  AgentAccountUnavailableError,
  BuyerVaultAccount,
  createAgentAccount,
  HEDERA_AGENT_ACCOUNTS_UNAVAILABLE,
  HederaAgentAccount,
  parseAgentAccountProvider,
} from "./agentAccount";

const VAULT = "0x2222222222222222222222222222222222222222" as const;
const MARKET = "0xb41048c7369d33d4e396ccb2e95e974b95a06d8b" as const;
const SUPPLIER = "0x1111111111111111111111111111111111111111" as const;
const HASH = `0x${"ab".repeat(32)}` as const;

function fakeChain(state: Record<string, unknown>, status: "success" | "reverted" = "success") {
  const reader = {
    readContract: vi.fn(async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
      const v = state[functionName];
      return typeof v === "function" ? v(...(args ?? [])) : v;
    }),
    waitForTransactionReceipt: vi.fn(async () => ({ status })),
  };
  const writer = {
    writeContract: vi.fn<(call: { functionName: string; args: readonly unknown[] }) => Promise<typeof HASH>>(async () => HASH),
    account: { address: VAULT },
    chain: { id: 296 },
  };
  return { reader, writer };
}

const vaultState = {
  dailyLimit: 5_000_000_000n,
  approvalThreshold: 1_000_000_000n,
  spentToday: 1_200_000_000n,
  isFrozen: false,
  allowedSupplier: (s: string) => s === SUPPLIER,
  supplierLimit: (s: string) => (s === SUPPLIER ? 2_000_000_000n : 0n),
};

describe("BuyerVaultAccount", () => {
  it("reads the on-chain rules and the recipient allowlist", async () => {
    const { reader } = fakeChain(vaultState);
    const acct = new BuyerVaultAccount({ vault: VAULT, reader: reader as never });
    expect(await acct.rules()).toEqual({ dailyLimit: 5_000_000_000n, approvalThreshold: 1_000_000_000n, spentToday: 1_200_000_000n, frozen: false });
    expect(await acct.recipient(SUPPLIER)).toEqual({ allowed: true, limit: 2_000_000_000n });
    expect(await acct.recipient("0x9999999999999999999999999999999999999999")).toEqual({ allowed: false, limit: 0n });
  });

  it("accepts and pays through the vault, passing the approval bytes", async () => {
    const { reader, writer } = fakeChain(vaultState);
    const acct = new BuyerVaultAccount({ vault: VAULT, reader: reader as never, writer: writer as never });
    expect(await acct.accept(MARKET, 7n)).toBe(HASH);
    expect(await acct.pay(MARKET, 7n, "0x1234")).toBe(HASH);
    expect(writer.writeContract.mock.calls.map((c) => [c[0].functionName, c[0].args])).toEqual([
      ["accept", [MARKET, 7n]],
      ["payInvoice", [MARKET, 7n, "0x1234"]],
    ]);
  });

  it("fails on a reverted transaction and when read-only", async () => {
    const reverted = fakeChain(vaultState, "reverted");
    await expect(new BuyerVaultAccount({ vault: VAULT, reader: reverted.reader as never, writer: reverted.writer as never }).pay(MARKET, 1n)).rejects.toThrow(/reverted/);
    const ro = fakeChain(vaultState);
    await expect(new BuyerVaultAccount({ vault: VAULT, reader: ro.reader as never }).accept(MARKET, 1n)).rejects.toBeInstanceOf(AgentAccountUnavailableError);
  });
});

describe("Hedera Agent Accounts placeholder", () => {
  it("fails loudly on every call until Hedera publishes an API", async () => {
    const acct = new HederaAgentAccount(VAULT);
    for (const call of [acct.rules(), acct.recipient(), acct.accept(), acct.pay()]) {
      await expect(call).rejects.toThrow(HEDERA_AGENT_ACCOUNTS_UNAVAILABLE);
    }
  });
});

describe("createAgentAccount", () => {
  it("defaults to the BuyerVault and switches by provider", () => {
    const { reader } = fakeChain(vaultState);
    expect(createAgentAccount({ vault: VAULT, reader: reader as never }).provider).toBe("buyer-vault");
    expect(createAgentAccount({ vault: VAULT, reader: reader as never, provider: "hedera-agent-account" }).provider).toBe("hedera-agent-account");
    expect(parseAgentAccountProvider(undefined)).toBe("buyer-vault");
    expect(() => parseAgentAccountProvider("magic")).toThrow(/AGENT_ACCOUNT_PROVIDER/);
  });
});
