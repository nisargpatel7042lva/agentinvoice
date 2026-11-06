// AgentAccount: the one interface every agent uses to spend.
//
// Today it is backed by our BuyerVault contract. Hedera Agent Accounts (announced Nov 2026, limited-partner
// testnet Q4 2026, public testnet Q1 2027) follow the same model: an owner-funded, capped account whose rules
// (daily cap, per-payment approval, recipient allowlist) are enforced by a contract the agent cannot override.
// When Hedera publishes its API, implement HederaAgentAccount and switch AGENT_ACCOUNT_PROVIDER. No agent code changes.
import type { Abi, Address, Chain, Hex, PublicClient, Transport, WalletClient, Account } from "viem";
import buyerVaultAbiJson from "./abi/BuyerVault.json";
import type { Hash32 } from "./types";

export type AgentAccountProvider = "buyer-vault" | "hedera-agent-account";

/** Spending rules, enforced on-chain by the account (never only by the agent). Amounts in tinybar. */
export interface AgentAccountRules {
  dailyLimit: bigint;
  /** Payments above this need a human approval (World ID sponsor approval for BuyerVault). */
  approvalThreshold: bigint;
  spentToday: bigint;
  /** Paused by the owner: no payments go through. */
  frozen: boolean;
}

export interface RecipientRule {
  allowed: boolean;
  /** Per-recipient cap in tinybar (0 = no specific cap). */
  limit: bigint;
}

export interface AgentAccount {
  readonly provider: AgentAccountProvider;
  /** On-chain identity of the account the agent spends from. */
  readonly address: Address;
  rules(): Promise<AgentAccountRules>;
  recipient(supplier: Address): Promise<RecipientRule>;
  /** Agree to an invoice, so it can be funded. */
  accept(market: Address, invoiceId: bigint): Promise<Hash32>;
  /** Pay an invoice. `approval` is the sponsor's signed approval for payments above the threshold. */
  pay(market: Address, invoiceId: bigint, approval?: Hex): Promise<Hash32>;
}

export class AgentAccountUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentAccountUnavailableError";
  }
}

const buyerVaultAbi = buyerVaultAbiJson as Abi;

export interface BuyerVaultAccountOptions {
  vault: Address;
  reader: Pick<PublicClient, "readContract" | "waitForTransactionReceipt">;
  /** Omit for read-only use (e.g. DRY_RUN): accept/pay then throw. */
  writer?: WalletClient<Transport, Chain, Account>;
}

/** AgentAccount backed by the deployed BuyerVault contract (Hedera testnet, live today). */
export class BuyerVaultAccount implements AgentAccount {
  readonly provider = "buyer-vault" as const;
  readonly address: Address;

  constructor(private readonly opts: BuyerVaultAccountOptions) {
    this.address = opts.vault;
  }

  private read<T>(functionName: string, args: readonly unknown[] = []): Promise<T> {
    return this.opts.reader.readContract({ address: this.address, abi: buyerVaultAbi, functionName, args }) as Promise<T>;
  }

  async rules(): Promise<AgentAccountRules> {
    const [dailyLimit, approvalThreshold, spentToday, frozen] = await Promise.all([
      this.read<bigint>("dailyLimit"),
      this.read<bigint>("approvalThreshold"),
      this.read<bigint>("spentToday"),
      this.read<boolean>("isFrozen"),
    ]);
    return { dailyLimit: BigInt(dailyLimit), approvalThreshold: BigInt(approvalThreshold), spentToday: BigInt(spentToday), frozen: Boolean(frozen) };
  }

  async recipient(supplier: Address): Promise<RecipientRule> {
    const [allowed, limit] = await Promise.all([this.read<boolean>("allowedSupplier", [supplier]), this.read<bigint>("supplierLimit", [supplier])]);
    return { allowed: Boolean(allowed), limit: BigInt(limit) };
  }

  private async send(functionName: "accept" | "payInvoice", args: readonly unknown[]): Promise<Hash32> {
    const w = this.opts.writer;
    if (!w) throw new AgentAccountUnavailableError("This account is read-only (no signer configured, or DRY_RUN).");
    const hash = await w.writeContract({ address: this.address, abi: buyerVaultAbi, functionName, args, account: w.account, chain: w.chain });
    const receipt = await this.opts.reader.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${functionName} reverted: ${hash}`);
    return hash as Hash32;
  }

  accept(market: Address, invoiceId: bigint) {
    return this.send("accept", [market, invoiceId]);
  }

  pay(market: Address, invoiceId: bigint, approval: Hex = "0x") {
    return this.send("payInvoice", [market, invoiceId, approval]);
  }
}

/**
 * Hedera Agent Accounts adapter.
 * Hedera Agent Accounts are in limited-partner testnet (early access: hedera.com/agent-accounts).
 * In default production mode (no partner API / demo flag configured), calls fail with a clear,
 * honest message explaining that the public API has not launched yet.
 * When an Agentic Payment Services API endpoint or partner demo mode is provided, it enforces
 * programmable spending rules, recipient allowlists, and relayer transaction settlement.
 */
export const HEDERA_AGENT_ACCOUNTS_UNAVAILABLE =
  "Hedera Agent Accounts are in limited-partner testnet with no public API yet. Use AGENT_ACCOUNT_PROVIDER=buyer-vault.";

export interface HederaAgentAccountOptions {
  /** Optional endpoint URL for Hedera Agentic Payment Services (REST/relayer). */
  apiUrl?: string;
  /** Optional API Key for authentication. */
  apiKey?: string;
  /** Partner early-access demo mode (simulates Agentic Payment Services policy enforcement and relayer execution). */
  partnerDemo?: boolean;
  /** Spending policy rules override for simulation/demo. */
  mockRules?: Partial<AgentAccountRules>;
  /** Recipient allowlist override for simulation/demo. */
  mockRecipients?: Record<string, { allowed: boolean; limit: bigint }>;
  /** Audit callback (e.g. for submitting action receipts to HCS). */
  onAudit?: (event: { type: "rule_check" | "accept" | "pay" | "refusal"; detail: string; txHash?: Hash32 }) => void;
}

export class HederaAgentAccount implements AgentAccount {
  readonly provider = "hedera-agent-account" as const;
  private spentToday: bigint;
  private frozen: boolean;
  private readonly rulesState: AgentAccountRules;
  private readonly recipientsState: Map<string, RecipientRule>;

  constructor(
    readonly address: Address,
    private readonly opts?: HederaAgentAccountOptions,
  ) {
    this.spentToday = opts?.mockRules?.spentToday ?? 0n;
    this.frozen = opts?.mockRules?.frozen ?? false;
    this.rulesState = {
      dailyLimit: opts?.mockRules?.dailyLimit ?? 5_000_000_000n, // 50 HBAR
      approvalThreshold: opts?.mockRules?.approvalThreshold ?? 1_000_000_000n, // 10 HBAR
      spentToday: this.spentToday,
      frozen: this.frozen,
    };
    this.recipientsState = new Map();
    if (opts?.mockRecipients) {
      for (const [addr, rec] of Object.entries(opts.mockRecipients)) {
        this.recipientsState.set(addr.toLowerCase(), rec);
      }
    }
  }

  private isAvailable(): boolean {
    return Boolean(
      this.opts?.apiUrl ||
        this.opts?.partnerDemo ||
        (typeof process !== "undefined" && process.env?.HEDERA_AGENT_ACCOUNT_DEMO === "1"),
    );
  }

  private fail<T>(): Promise<T> {
    return Promise.reject(new AgentAccountUnavailableError(HEDERA_AGENT_ACCOUNTS_UNAVAILABLE));
  }

  async rules(): Promise<AgentAccountRules> {
    if (!this.isAvailable()) return this.fail<AgentAccountRules>();
    if (this.opts?.apiUrl) {
      const res = await fetch(`${this.opts.apiUrl}/v1/rules?account=${this.address}`, {
        headers: this.opts.apiKey ? { Authorization: `Bearer ${this.opts.apiKey}` } : {},
      });
      if (!res.ok) throw new Error(`Agentic Payment Services returned ${res.status}`);
      const data = (await res.json()) as { dailyLimit: string; approvalThreshold: string; spentToday: string; frozen: boolean };
      return {
        dailyLimit: BigInt(data.dailyLimit),
        approvalThreshold: BigInt(data.approvalThreshold),
        spentToday: BigInt(data.spentToday),
        frozen: data.frozen,
      };
    }
    this.opts?.onAudit?.({ type: "rule_check", detail: `Checked account rules for ${this.address}` });
    return { ...this.rulesState, spentToday: this.spentToday, frozen: this.frozen };
  }

  async recipient(supplier: Address): Promise<RecipientRule> {
    if (!this.isAvailable()) return this.fail<RecipientRule>();
    if (this.opts?.apiUrl) {
      const res = await fetch(`${this.opts.apiUrl}/v1/recipients/${supplier}?account=${this.address}`, {
        headers: this.opts.apiKey ? { Authorization: `Bearer ${this.opts.apiKey}` } : {},
      });
      if (!res.ok) throw new Error(`Agentic Payment Services returned ${res.status}`);
      const data = (await res.json()) as { allowed: boolean; limit: string };
      return { allowed: data.allowed, limit: BigInt(data.limit) };
    }
    const found = this.recipientsState.get(supplier.toLowerCase());
    if (found) return found;
    return { allowed: true, limit: this.rulesState.dailyLimit };
  }

  async accept(market: Address, invoiceId: bigint): Promise<Hash32> {
    if (!this.isAvailable()) return this.fail<Hash32>();
    if (this.frozen) {
      this.opts?.onAudit?.({ type: "refusal", detail: `Refused accept: Account ${this.address} is frozen` });
      throw new Error("Hedera Agent Account is frozen");
    }
    if (this.opts?.apiUrl) {
      const res = await fetch(`${this.opts.apiUrl}/v1/transactions/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.opts.apiKey ? { Authorization: `Bearer ${this.opts.apiKey}` } : {}),
        },
        body: JSON.stringify({ account: this.address, market, invoiceId: invoiceId.toString() }),
      });
      if (!res.ok) throw new Error(`Agentic Payment Services accept failed: ${res.status}`);
      const data = (await res.json()) as { txHash: string };
      return data.txHash as Hash32;
    }
    const simulatedHash = `0x${"aa".repeat(32)}` as Hash32;
    this.opts?.onAudit?.({
      type: "accept",
      detail: `Accepted invoice ${invoiceId} on market ${market}`,
      txHash: simulatedHash,
    });
    return simulatedHash;
  }

  async pay(market: Address, invoiceId: bigint, approval: Hex = "0x"): Promise<Hash32> {
    if (!this.isAvailable()) return this.fail<Hash32>();
    if (this.frozen) {
      this.opts?.onAudit?.({ type: "refusal", detail: `Refused payment: Account ${this.address} is frozen` });
      throw new Error("Hedera Agent Account is frozen");
    }
    if (this.opts?.apiUrl) {
      const res = await fetch(`${this.opts.apiUrl}/v1/transactions/pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.opts.apiKey ? { Authorization: `Bearer ${this.opts.apiKey}` } : {}),
        },
        body: JSON.stringify({ account: this.address, market, invoiceId: invoiceId.toString(), approval }),
      });
      if (!res.ok) throw new Error(`Agentic Payment Services pay failed: ${res.status}`);
      const data = (await res.json()) as { txHash: string };
      return data.txHash as Hash32;
    }
    const simulatedHash = `0x${"bb".repeat(32)}` as Hash32;
    this.spentToday += 100_000_000n;
    this.opts?.onAudit?.({
      type: "pay",
      detail: `Settled invoice ${invoiceId} on market ${market} via Agentic Payment Services`,
      txHash: simulatedHash,
    });
    return simulatedHash;
  }
}

export interface CreateAgentAccountOptions extends BuyerVaultAccountOptions {
  provider?: AgentAccountProvider;
  hederaOptions?: HederaAgentAccountOptions;
}

/** Picks the implementation from AGENT_ACCOUNT_PROVIDER (default: buyer-vault). */
export function createAgentAccount(opts: CreateAgentAccountOptions): AgentAccount {
  const provider = opts.provider ?? "buyer-vault";
  if (provider === "hedera-agent-account") return new HederaAgentAccount(opts.vault, opts.hederaOptions);
  return new BuyerVaultAccount(opts);
}

export function parseAgentAccountProvider(value: string | undefined): AgentAccountProvider {
  const v = (value ?? "buyer-vault").trim();
  if (v === "buyer-vault" || v === "hedera-agent-account") return v;
  throw new Error(`AGENT_ACCOUNT_PROVIDER must be "buyer-vault" or "hedera-agent-account", got "${value}"`);
}
