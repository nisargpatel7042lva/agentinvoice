# Invoice Agent

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

## Layout

- `packages/*` shared libraries (`@invoiceagent/shared`)
- `services/*`, `agents/*`, `apps/*` workspaces
- `contracts/` Foundry project (owner: Mann)

## Rules

- `main` is protected: open a pull request; CI (`verify-fast`) must pass.
- Run `bun run verify` before every commit.
- Never commit `.env`; see `.env.example`.
