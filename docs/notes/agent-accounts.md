# Hedera Agent Accounts (checked 2026-11-06)

Sources: [Introducing Hedera Agent Accounts](https://hedera.com/blog/introducing-hedera-agent-accounts/) (Hedera blog) and [hedera.com/agent-accounts](https://hedera.com/agent-accounts). Hedera's developer docs have **no Agent Accounts page yet**: the AI section lists only the Agent Kit, Agent Lab, MCP servers and x402. The hedera-skills plugins (latest commit 2026-09-03) don't cover it either.

## What it is
- A non-custodial, programmable spending account for an AI agent, funded from the owner's Hedera wallet. The agent gets a capped budget, never the wallet keys, and holds no balance; funds move only when a payment passes the rules.
- Rules are written to a smart contract that neither the agent nor Hedera can override: total spend limit, daily cap, per-transaction maximum, time-based restrictions, and a recipient/merchant allowlist. Large moves can require 2FA approval. The owner can pause or revoke instantly.
- Policies, transactions and agent actions are logged to Hedera Consensus Service.
- Assets: HBAR, USDC and other Hedera tokens. It works with x402 pay-per-request purchases.
- Integration is through "Agentic Payment Services" (MCP server, REST API, relayer). Any MCP or REST agent can connect, and enterprises can self-host the endpoint.
- Listed use cases include **settling invoices**, paying for APIs and gated data, and purchases.

## Availability
Limited-partner testnet in Q4 2026 (early access: hedera.com/agent-accounts/#early-access, ai-studio@hashgraph.com). Public testnet Q1 2027, mainnet targeted Q2 2027. **No public SDK, REST or MCP reference yet**, so nothing can be built against it today.

## How Invoice Agent uses it: the `AgentAccount` adapter
`packages/shared/src/agentAccount.ts` is the one interface agents spend through:

| AgentAccount method | BuyerVault (live today) | Hedera Agent Accounts (when the API ships) |
| --- | --- | --- |
| `rules()` | `dailyLimit`, `approvalThreshold`, `spentToday`, `isFrozen` | account policy: daily/per-tx caps, paused |
| `recipient(supplier)` | `allowedSupplier`, `supplierLimit` | recipient allowlist |
| `accept(market, id)` | `BuyerVault.accept` | contract call through the relayer (or keep on the vault) |
| `pay(market, id, approval)` | `BuyerVault.payInvoice`, plus the World ID sponsor approval above the threshold | spend request validated by the account contract, 2FA for large moves |

- Switch with `AGENT_ACCOUNT_PROVIDER=buyer-vault | hedera-agent-account`. The Hedera implementation (`HederaAgentAccount`) currently fails every call with a clear "not available yet" error, so it never pretends to work.
- The buyer agent (`agents/buyer-agent/src/index.ts`) already spends only through the adapter.
- When access arrives: implement `HederaAgentAccount` against their API, add tests, and switch the env var. No agent or UI changes.

## How to pitch it honestly
"Invoice Agent runs on the Agent Accounts model today, on our own BuyerVault: owner-funded caps, a supplier allowlist, human approval above a threshold, and an HCS audit trail. It's built to switch to Hedera Agent Accounts behind one interface when they launch." Don't claim we use Hedera Agent Accounts until we actually have access.
