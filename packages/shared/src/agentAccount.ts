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
 * Placeholder for Hedera Agent Accounts. Hedera has not published an SDK, REST or MCP reference yet
 * (early access: hedera.com/agent-accounts). Every call fails loudly instead of pretending to work.
 * Planned mapping: rules() ← account policy (total/daily/per-tx caps), recipient() ← recipient allowlist,
 * pay() ← spend request validated by the account contract and submitted by the Agentic Payment Services relayer.
 */
export const HEDERA_AGENT_ACCOUNTS_UNAVAILABLE =
  "Hedera Agent Accounts are in limited-partner testnet with no public API yet. Use AGENT_ACCOUNT_PROVIDER=buyer-vault.";

export class HederaAgentAccount implements AgentAccount {
  readonly provider = "hedera-agent-account" as const;
  constructor(readonly address: Address) {}
  private fail<T>(): Promise<T> {
    return Promise.reject(new AgentAccountUnavailableError(HEDERA_AGENT_ACCOUNTS_UNAVAILABLE));
  }
  rules() {
    return this.fail<AgentAccountRules>();
  }
  recipient() {
    return this.fail<RecipientRule>();
  }
  accept() {
    return this.fail<Hash32>();
  }
  pay() {
    return this.fail<Hash32>();
  }
}

export interface CreateAgentAccountOptions extends BuyerVaultAccountOptions {
  provider?: AgentAccountProvider;
}

/** Picks the implementation from AGENT_ACCOUNT_PROVIDER (default: buyer-vault). */
export function createAgentAccount(opts: CreateAgentAccountOptions): AgentAccount {
  const provider = opts.provider ?? "buyer-vault";
  if (provider === "hedera-agent-account") return new HederaAgentAccount(opts.vault);
  return new BuyerVaultAccount(opts);
}

export function parseAgentAccountProvider(value: string | undefined): AgentAccountProvider {
  const v = (value ?? "buyer-vault").trim();
  if (v === "buyer-vault" || v === "hedera-agent-account") return v;
  throw new Error(`AGENT_ACCOUNT_PROVIDER must be "buyer-vault" or "hedera-agent-account", got "${value}"`);
}
