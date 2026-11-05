# agentinvoice

## Setup

Requirements: Node 20+, git, and [Foundry](https://getfoundry.sh) (`forge` on your PATH).

```bash
git clone https://github.com/nisargpatel7042lva/agentinvoice.git
cd agentinvoice
npm install
npm run verify
```

## Layout

- `packages/*` shared libraries (`@agentinvoice/shared`)
- `services/*`, `agents/*`, `apps/*` workspaces
- `contracts/` Foundry project (owner: Mann)

## Rules

- `main` is protected: open a pull request; CI (`verify-fast`) must pass.
- Run `npm run verify` before every commit.
- Never commit `.env`; see `.env.example`.
