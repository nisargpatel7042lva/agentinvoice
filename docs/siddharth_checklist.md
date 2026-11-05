# Siddharth checklist: backend, World, ENS, reviewer

Owns `services/backend/`. Edits only that folder (plus notes under `docs/notes/`).
Workflow: one task at a time. Claude completes it, then tells Siddharth which test to run to verify. Tick the box only after Siddharth confirms.
Branch per phase: `<phase_name>_sidd`. Run `npm run verify` before every commit.

## Phase 0: setup (hours 0 to 2) - branch `phase_0_setup_sidd`

- [x] 0.1 `services/backend` with a health route and a SQLite file (test: `GET /health` returns ok)
- [ ] 0.2 Sepolia wallet with test ETH (ENS publisher)
- [ ] 0.3 World app installed, mentor contact noted

## Phase 1: gate spikes (hours 2 to 6) - branch `phase_1_spikes_sidd`

- [ ] 1.1 S3 World AgentKit: notes in `docs/notes/world-agentkit.md` (Prompt 1, step 1)
- [ ] 1.2 `services/backend/src/world/agentkit.ts` with `verifyAgentRequest` and `lookupHuman` (step 2)
- [ ] 1.3 `scripts/register-agent.ts` registers the sponsor agent wallet (step 3)
- [ ] 1.4 Tests: valid, tampered, replayed header, unregistered wallet (step 4)
- [ ] 1.5 S4 ENSv2 notes in `docs/notes/ensv2.md` (Prompt 2, step 1)
- [ ] 1.6 `scripts/ens-register.ts` registers name and `buyer.<name>.eth` (step 2)
- [ ] 1.7 `scripts/ens-grant.ts` grants the publisher least privilege (step 3)
- [ ] 1.8 `scripts/ens-check.ts` reads all seven `agentinvoice.*` keys (step 4)
- [ ] Gate 1: World verification and an ENS write both work, or the fallback is written in the notes

## Phase 2: backend core (hours 6 to 16) - branch `phase_2_backend_sidd`

- [ ] 2.1 Schema and migrations: invoices, events, approvals, agents, meta
- [ ] 2.2 `src/indexer.ts`: poll events every 5s, dedupe by tx hash + log index, re-read last 5 blocks, retries capped at 3, expose `lastSyncedAt`
- [ ] 2.3 `src/score.ts`: paid, late, defaulted, openExposure, onTimeRate, band (table-driven test of band edges)
- [ ] 2.4 Routes with zod: `/health`, `/api/invoices`, `/api/invoices/:id`, `/api/agents/:vault`, `/api/events`
- [ ] 2.5 `scripts/seed.ts`: DEMO rows only when `SEED=1`, `source="seed"`; real rows `source="chain"`
- [ ] 2.6 Tests: indexer dedupe and idempotency, score bands, each route once, tinybar and value conversion
- [ ] Gate 2: a real invoice shows in `/api/invoices` within 10s with a HashScan link, score returns sensible bands

## Phase 3: approval service and ENS publisher (hours 16 to 26) - branch `phase_3_approval_ens_sidd`

- [ ] 3.1 `src/approval/machine.ts`: pending, approved, denied, expired, consumed (table-driven transition tests)
- [ ] 3.2 `POST /api/approval/start`
- [ ] 3.3 `POST /api/approval/verify` with distinct error codes (wrong agent, wrong action, replay, oversize, expired)
- [ ] 3.4 EIP-712 attestation signing (SupplierApproval, LargePayment) using domain and types from `spec.md`
- [ ] 3.5 `POST /api/approval/:id/deny`, `GET /api/approval/:id`, expiry sweep every 30s
- [ ] 3.6 Demo controls behind `DEMO_CONTROLS=1` plus secret header
- [ ] 3.7 `docs/FEEDBACK_WORLD.md`
- [ ] 3.8 ENS publisher `buildRecords` (pure, tested)
- [ ] 3.9 `publishRecords`: writes only changed keys
- [ ] 3.10 `readRecords` exported via `GET /api/agents/:vault`
- [ ] 3.11 Scheduler: after each indexed event and every 60s, retries capped at 3
- [ ] 3.12 Publisher tests with mocked viem: unchanged = zero txs, one change = one tx, failed write retries then gives up
- [ ] 3.13 Review Mann's signature domain against the backend (help him with the testnet attestation test)
- [ ] Gate 3: E2 to E6 pass, backend-signed attestation accepted on-chain, ENS records update within a minute

## Phase 4: scoreboard and hardening (hours 26 to 32) - branch `phase_4_hardening_sidd`

- [ ] 4.1 `scripts/e2e.ts` prints E1 to E10 table, exits non-zero on failure; `e2e:local` and `e2e:testnet`
- [ ] 4.2 Env validation with zod at boot, complete `.env.example` (names only)
- [ ] 4.3 `npm run dev:backend` starts API, indexer, sweeper, ENS publisher; graceful shutdown; `/health` shows db, mirror lag, last ENS publish
- [ ] 4.4 Rate limits and body size limits on approval routes
- [ ] 4.5 Secrets scan across repo and git history
- [ ] 4.6 Fresh-chat security review of the approval service (replay, wrong subject, races, key logging, demo controls)
- [ ] 4.7 Fix review findings
- [ ] Gate 4: E1 to E10 pass twice in a row on testnet, secrets scan clean

## Phase 5: submission (hours 32 to 36) - branch `phase_5_submission_sidd`

- [ ] 5.1 README section "ENS integration": seven keys, how to verify in the ENS app, one honest sentence on the ENS requirement
- [ ] 5.2 Remove dead code and unused dependencies
- [ ] 5.3 Final `docs/FEEDBACK_WORLD.md` pass
- [ ] 5.4 Reviewer duty: read contract and approval changes in a fresh chat before Nisarg merges

## Rules to keep

- A sponsor approval lifts only the approval threshold, never the daily limit.
- Every approval works once. Denied and expired approvals never become valid again.
- Never log or commit keys. Mark anything unchecked as UNVERIFIED in `docs/notes/`.
- Same error twice: stop and tell Siddharth.
