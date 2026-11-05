# agentinvoice

## Setup

Requirements: Node 20+, Bun 1.4+, git, and [Foundry](https://getfoundry.sh) (`forge` on your PATH).

```bash
git clone https://github.com/nisargpatel7042lva/agentinvoice.git
cd agentinvoice
bun install
bun run verify
```

## Layout

- `packages/*` shared libraries (`@agentinvoice/shared`)
- `services/*`, `agents/*`, `apps/*` workspaces
- `contracts/` Foundry project (owner: Mann)

## Rules

- `main` is protected: open a pull request; CI (`verify-fast`) must pass.
- Run `bun run verify` before every commit.
- Never commit `.env`; see `.env.example`.
