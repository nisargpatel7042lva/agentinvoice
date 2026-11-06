# agentinvoice

## Setup

Requirements: Node 20+, Bun 1.4+, git, and [Foundry](https://getfoundry.sh) (`forge` on your PATH).

```bash
git clone https://github.com/nisargpatel7042lva/agentinvoice.git
cd agentinvoice
bun install
bun run verify
```

## Run the backend

```bash
cp .env.example .env   # fill in only what you need; optional features are off until their variables are set
bun run dev:backend    # API, chain indexer, ENS publisher, approval sweeper; Ctrl+C shuts it down cleanly
curl localhost:3001/health
```

The backend checks `.env` at boot and lists any half-configured feature by variable name (never by value). `/health` reports the database, how long ago the indexer last synced, and the last ENS publish. Code that opens the database must run under Node (`tsx`, `vitest`): `better-sqlite3` crashes Bun 1.3.x.

## ENS integration

Each buyer agent is an ENSv2 name on Sepolia, and ENS is the public source of truth for its credit line and payment record. The demo agent is `buyer.agentinvoicenf71.eth` ([open in the ENS app](https://sepolia.app.ens.domains/buyer.agentinvoicenf71.eth)), a subname of `agentinvoicenf71.eth` with an expiry (its credit line) and a permissioned resolver.

| Record | Set by | Meaning |
| --- | --- | --- |
| text `limit` | sponsor | daily limit, base units |
| text `threshold` | sponsor | approval threshold, base units |
| text `paid` | publisher | invoices paid |
| text `late` | publisher | invoices late or defaulted |
| text `status` | publisher | `active`, `paused` or `defaulted` |

Also on the name: `addr` (the BuyerVault address, a placeholder until the vault is deployed) and the registry expiry (`expiresAt`). Roles are enforced on-chain by the resolver: the publisher wallet can write only `paid`, `late` and `status`, and `bun scripts/ens/refusal.ts` shows a write to `limit` being refused. The sponsor can revoke the name (`bun scripts/ens/revoke.ts`), after which `readAgentFromEns` reports it as revoked.

To verify: open the link above in the ENS app, or run `bunx tsx --env-file=.env scripts/ens/check.ts` to read the records and expiry back through viem.

How this meets the ENS requirement, honestly: ENSv2 on Sepolia is the only place an agent's limits, payment record and expiry live, each agent is a subname with its own permissions, expiry and revocation, and the backend publisher and `readAgentFromEns` read and write them from chain state; this is a testnet prototype with no public live demo link yet.

## Smart Contracts (Hedera Testnet)

The on-chain money rails and financial settlements run on **Hedera Testnet (Chain ID 296)**.

| Contract | Address | Explorer Link |
| --- | --- | --- |
| **`InvoiceMarket`** | `0xb41048c7369d33d4e396ccb2e95e974b95a06d8b` | [HashScan Explorer](https://hashscan.io/testnet/address/0xb41048c7369d33d4e396ccb2e95e974b95a06d8b) |
| **`BuyerVault`** | `0xbc792de2be972434a996f222da426b590e858056` | [HashScan Explorer](https://hashscan.io/testnet/address/0xbc792de2be972434a996f222da426b590e858056) |
| **`Deployer`** | `0xd2B87eFbfd542eA386cBD1724A2E8DAEb31E0fA3` | [HashScan Explorer](https://hashscan.io/testnet/address/0xd2B87eFbfd542eA386cBD1724A2E8DAEb31E0fA3) |
| **`Verifier`** | `0x27a3c43158AC762F57B3aBe459a98e67659738EE` | [HashScan Explorer](https://hashscan.io/testnet/address/0x27a3c43158AC762F57B3aBe459a98e67659738EE) |

### Plain-English Payout Rules & Money Rails
1. **Invoice Lifecycle:**
   - **Creation:** A verified supplier creates an invoice with a face amount, discounted price, and due date. Initial status is `Pending`.
   - **Acceptance:** The buyer's autonomous `BuyerVault` accepts the invoice (`Open`) if the supplier is allowlisted and within daily credit limits.
2. **Immediate Financing:**
   - An investor funds the invoice by paying the discounted `price` in HBAR.
   - The funds are immediately routed to the supplier, and the investor's address is recorded on-chain as the immutable `holder`.
   - An `InvoiceFunded` event triggers off-chain minting of the corresponding Asset Tokenization Studio (ATS) bond.
3. **Maturity & Repayment:**
   - On or before maturity, the `BuyerVault` pays the full `faceAmount` back into `InvoiceMarket`.
   - Repayments are credited to the investor's claim balance.
4. **Pull-Payment Claims:**
   - The investor retrieves their repayment yield at any time via `claim()`. This pull-payment architecture safeguards all participants against reentrancy and unexpected recipient revert conditions.
5. **Overdue Invoices:**
   - If an invoice is unpaid past the due date, it can be marked as `Late`. Past the due date plus the grace period (60 seconds for testnet demo mode), anyone can mark it as `Defaulted`.

## Layout

- `packages/*` shared libraries (`@agentinvoice/shared`)
- `services/*`, `agents/*`, `apps/*` workspaces
- `contracts/` Foundry project (owner: Mann)

## Rules

- `main` is protected: open a pull request; CI (`verify-fast`) must pass.
- Run `bun run verify` before every commit.
- Never commit `.env`; see `.env.example`.
