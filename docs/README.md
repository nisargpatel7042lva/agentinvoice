# Documentation

Map of this folder. Prefer the **Submission** links for judges and mentors. **Internal notes** may lag `main`; do not treat dated logs as the product source of truth.

## For reviewers (about 5 minutes)

1. [Root README](../README.md) — pitch, architecture, sponsor tracks, addresses, honest status  
2. [Demo script](DEMO_SCRIPT.md) — what to click and say  
3. [Live demo](https://invoiceagent-ethglobal.vercel.app) · [ENS demo agent](https://sepolia.app.ens.domains/buyer.agentinvoicenf71.eth) · [InvoiceMarket on HashScan](https://hashscan.io/testnet/contract/0xb41048c7369d33d4e396ccb2e95e974b95a06d8b)  
4. [End-to-end checklist](END_TO_END_CHECKLIST.md) — what is merged vs still unchecked live  
5. [World ID debrief](FEEDBACK_WORLD.md) — prize feedback (numbers TBD until a measured live run)

## Submission (polished)

| Doc | What it is |
| --- | --- |
| [DEMO_SCRIPT.md](DEMO_SCRIPT.md) | Mentor demo (~5 minutes) |
| [DEPLOY.md](DEPLOY.md) | Vercel web, AWS backend, ATS bond setup |
| [SELF_HOSTING.md](SELF_HOSTING.md) | Run your own buyer or investor agent |
| [RUNBOOK-testnet.md](RUNBOOK-testnet.md) | Local / testnet real transactions |
| [END_TO_END_CHECKLIST.md](END_TO_END_CHECKLIST.md) | Deploy, product, prize, verify, demo hygiene |
| [FEEDBACK_WORLD.md](FEEDBACK_WORLD.md) | World ID Agent Pass integration debrief |
| [submission/](submission/) | Drafts (e.g. Hedera Agent Accounts early access) |

## Design

| Doc | What it is |
| --- | --- |
| [design/components.md](design/components.md) | UI component inventory |
| [design/copy.md](design/copy.md) | Product copy keys |
| [design/tokens.md](design/tokens.md) | Colour and type tokens |
| [design/wireframes.md](design/wireframes.md) | Screen wireframes |

## Internal notes (`notes/`)

Engineer working notes and integration write-ups. Useful for the team; **not** a polished submission set. Some files are dated snapshots and may be stale relative to current `main`.

README-linked notes (start here if you need depth):

- [ensv2.md](notes/ensv2.md) · [ats.md](notes/ats.md) · [world-agentpass.md](notes/world-agentpass.md)  
- [credit-score.md](notes/credit-score.md) · [x402-hedera.md](notes/x402-hedera.md) · [agent-accounts.md](notes/agent-accounts.md)  
- [saucerswap.md](notes/saucerswap.md) — HBAR→USDC (built; settlement still HBAR on-chain until redeploy)

Other files under [`notes/`](notes/) stay internal (API sketches, security scans, historical e2e logs, etc.).
