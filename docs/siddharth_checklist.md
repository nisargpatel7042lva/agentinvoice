# Siddharth checklist: backend, World, ENS, reviewer (plan v2)

Owns `services/backend/`. Edits only that folder (plus notes under `docs/notes/`).
Workflow: one task at a time. Claude completes it, then tells Siddharth which test to run to verify. Tick the box only after Siddharth confirms.
Branch per phase: `<phase_name>_sidd`. Run `bun run verify` before every commit.

Plan v2 (from the updated PDF): World prize is now Agent Pass step-up (auth.world.org), not AgentKit. ENS is ENSv2 namespaces (agent = subname with roles, expiry, revocation). New HCS audit log. New order: v2-S1, v2-S2, Prompt 3, v2-S3, Prompt 4 + step-up, Prompt 5 + v2-S4.

## Phase 0: setup (hours 0 to 2) - branch `phase_0_setup_sidd`

- [x] 0.1 `services/backend` with a health route and a SQLite file (test: `GET /health` returns ok)
- [x] 0.2 Sepolia wallet with test ETH (ENS publisher). Address 0x23aBf449e01D6A199851033Bd531c459A863dAd9, key in local `.env`
- [x] 0.3 World app installed, mentor contact noted

## Phase 1: gate spikes (hours 2 to 6) - branch `phase_1_spikes_sidd`

World Agent Pass step-up (v2-S1, replaces old AgentKit Prompt 1; 90 min)
- [ ] 1.1 (mentor not available yet; revisit) Ask the World mentor (10 min): is Agent Pass the auth.world.org step-up flow or AgentKit? Write the answer in `docs/notes/world-agentpass.md`
- [x] 1.2 Notes: portal client registration, redirect URI, scopes, discovery URL, how to request fresh authentication (parameter names UNVERIFIED)
- [x] 1.3 `src/world/stepup.ts`: `startStepUp(approvalId)` builds the authorization URL (state = approval id, random nonce, PKCE)
- [x] 1.4 `handleCallback(code, state)`: exchange code, validate ID token (signature, issuer, audience, nonce, expiry, recent auth time), distinct error codes
- [x] 1.5 Failure-path tests (cancel, expired approval, reused state, wrong nonce, stale auth time): protected action never happens; mocked key set in unit tests
- [x] 1.6 One real flow on the real portal (2026-11-06: step-up validated live via an ngrok callback, Orb acr, auth_time fresh; scripts/world-stepup-live.ts)
- [x] 1.7 (draft started, finish after 1.6) Start `docs/FEEDBACK_WORLD.md` (time to first success, friction, doc gaps, top improvement)

ENSv2 namespaces (Prompt 2 + v2-S2)
- [x] 1.8 Notes in `docs/notes/ensv2.md`: permissioned registry and resolver, roles, expiry and revocation, Sepolia addresses with sources (ask the ENS mentor)
- [x] 1.9 Register or reuse parent name on Sepolia; subname for the demo buyer agent with an expiry and the permissioned resolver; addr record = vault address
- [x] 1.10 Roles via Enhanced Access Control: sponsor wallet sets limit/threshold and revokes; ens-publisher sets only paid, late, status; script proves publisher cannot write `limit`
- [x] 1.11 `scripts/ens-revoke.ts`: revoke/expire subname, show resolution before and after
- [x] 1.12 `src/ens/read.ts`: `readAgentFromEns(name)` returns { vault, limit, threshold, sponsor, paid, late, status, expiresAt }
- [x] 1.13 Older scripts (register, grant, check) keep working
- [ ] Gate 1: World step-up and ENS refused-write + revocation both work, or the fallback is written in the notes (World fallback: wallet-signed sponsor approval; ENS fallback: text records)

## Phase 2: backend core (hours 6 to 16) - branch `phase_2_backend_sidd`

- [x] 2.1 Schema and migrations: invoices, events, approvals, agents, meta
- [x] 2.2 `src/indexer.ts`: poll events every 5s, dedupe by tx hash + log index, re-read last 5 blocks, retries capped at 3, expose `lastSyncedAt`
- [x] 2.3 `src/score.ts`: paid, late, defaulted, openExposure, onTimeRate, band (table-driven test of band edges)
- [x] 2.4 Routes with zod: `/health`, `GET /api/invoices`, `GET /api/invoices/:id` (spec v2 API; `/api/agents/:vault` and `/api/events` are not in spec v2, so not built; POST /api/invoices, /api/approvals, /api/world/callback, /api/audit come later)
- [x] 2.5 `scripts/seed.ts`: DEMO rows only when `SEED=1`, `source="seed"`; real rows `source="chain"`
- [x] 2.6 Tests: indexer dedupe and idempotency, score bands, each route once, tinybar and value conversion
- [ ] Gate 2: a real invoice shows in `/api/invoices` within 10s with a HashScan link, score returns sensible bands

HCS audit log (v2-S3, Phase 2 or 3; notes in `docs/notes/hcs.md`)
- [ ] 2.7 (script written, NOT run: needs a funded Hedera testnet account HEDERA_ACCOUNT_ID/HEDERA_PRIVATE_KEY) `scripts/hcs-create-topic.ts`: topic with submit key, prints topic id and HashScan link, id in env
- [x] 2.8 `src/audit/publish.ts`: `publishAudit(event)` typed events with payload hash, no personal data
- [x] 2.9 Retries capped at 3; a failure is logged and never blocks the main action
- [x] 2.10 `GET /api/audit` reads topic back via mirror node, newest first
- [x] 2.11 (indexer status changes and approval events hooked; Mann's payAndGet onAudit is not wired: no endpoint for it in spec v2) Hook into indexer, approval service and Mann's `payAndGet` `onAudit` callback
- [x] 2.12 Tests: event shape, retry cap, failed publish does not throw

## Phase 3: approval service and ENS publisher (hours 16 to 26) - branch `phase_3_approval_ens_sidd`

Approval service (Prompt 4 + v2-S4: step-up replaces AgentKit)
- [x] 3.1 `src/approval/machine.ts`: pending, approved, denied, expired, consumed (table-driven transition tests)
- [x] 3.2 `POST /api/approval/start`: creates approval, returns authorization URL
- [x] 3.3 (distinct codes via StepUpError and ApprovalUseError) Callback validates the ID token, then checks subject, action, amount, expiry, not consumed; distinct error codes (wrong agent, wrong action, replay, oversize, expired, stale auth time, other approval id)
- [ ] 3.4 (NOT IN SPEC v2: no EIP-712 domain or types are frozen, so no attestation is signed; ask Nisarg/Mann) EIP-712 attestation signing (SupplierApproval, LargePayment) using domain and types from `spec.md`; store hashed subject only
- [x] 3.5 `POST /api/approval/:id/deny`, `GET /api/approval/:id`, expiry sweep every 30s; action `buyer-acceptance` if a sponsor must approve a new supplier
- [ ] 3.6 (NOT IN SPEC v2 API, not built; ask Nisarg) Demo controls behind `DEMO_CONTROLS=1` plus secret header
- [x] 3.7 (draft in docs/FEEDBACK_WORLD.md; finish after the real flow) `docs/FEEDBACK_WORLD.md` finished

ENS publisher (Prompt 5 + v2-S4)
- [x] 3.8 `buildRecords` (pure, tested)
- [x] 3.9 `publishRecords` through v2-S2 roles (publisher wallet only), writes only changed keys
- [x] 3.10 `readRecords` via `readAgentFromEns`, exported via `GET /api/agents/:vault`
- [x] 3.11 Scheduler: after each indexed event and every 60s, retries capped at 3
- [ ] 3.12 (publisher writes status defaulted; the sponsor revoke is scripts/ens/revoke.ts, not run by the backend) On default: sponsor flow revokes/expires subname, publisher writes status `defaulted`
- [x] 3.13 Tests with mocked viem: unchanged = zero txs, one change = one tx, failed write retries then gives up, publisher writing `limit` is refused
- [ ] 3.14 Review Mann's signature domain against the backend (help him with the testnet attestation test)
- [ ] Gate 3: E2 to E6 pass, backend-signed attestation accepted on-chain, a revoked name shows as revoked in `readAgentFromEns`

## Phase 4: scoreboard and hardening (hours 26 to 32) - branch `phase_4_hardening_sidd`

- [ ] 4.1 (NOT STARTED: scripts/e2e.ts is still Nisarg's placeholder; needs the deployed contracts) `scripts/e2e.ts` prints E1 to E10 table, exits non-zero on failure; `e2e:local` and `e2e:testnet`
- [x] 4.2 Env validation with zod at boot, complete `.env.example` (names only)
- [x] 4.3 (`bun run dev:backend`) `dev:backend` starts API, indexer, sweeper, ENS publisher; graceful shutdown; `/health` shows db, mirror lag, last ENS publish
- [x] 4.4 Rate limits and body size limits on approval routes
- [x] 4.5 Secrets scan across repo and git history
- [ ] 4.6 Fresh-chat security review of the approval service (replay, wrong subject, races, key logging, demo controls)
- [ ] 4.7 Fix review findings
- [ ] Gate 4: E1 to E10 pass twice in a row on testnet, secrets scan clean

## Phase 5: submission (hours 32 to 36) - branch `phase_5_submission_sidd`

- [x] 5.1 README section "ENS integration": agent subnames, roles, expiry and revocation, how to verify in the ENS app, one honest sentence on the ENS requirement
- [x] 5.2 Remove dead code and unused dependencies
- [ ] 5.3 Final `docs/FEEDBACK_WORLD.md` pass (integration debrief for the World prize)
- [ ] 5.4 Reviewer duty: read contract and approval changes in a fresh chat before Nisarg merges

## Phase 6: Hedera Tokenize prize (ATS bond per funded invoice) - branch `phase_9_tokenize_sidd`

Prize: Tokenize Anything with Hedera Studios ($5,000: 1st $2,500, 2nd $1,500, 3rd $1,000). Needs ATS or Stablecoin Studio, deployed and demoed on Hedera testnet,
a public repo (contracts verified on HashScan where applicable), and a demo video of 5 minutes or less showing issuance, configuration and one lifecycle operation.
Extra points: compliance controls (KYC, freeze, transfer restrictions, pause), scheduled transactions, oracle/NAV feed, contributions back to ATS.
Route is decided: T1b (see `docs/notes/ats.md`, spec section "Bond routes"). The funded invoice is tokenized as an ATS bond: the token is the investor's proof of the invoice, and repayment goes to the investor (`holder`).

- [ ] 6.1 Create the ATS bond on testnet (admin app or `@hashgraph/asset-tokenization-sdk`): name, symbol, nominal value, maturity. Write the token address in `docs/notes/ats.md` and in `packages/shared/src/addresses.json`
- [ ] 6.2 Backend issuer service (`IBondIssuer`): on `InvoiceFunded`, grant KYC to the investor and `issue` bond units to the holder; store the token address in the invoice's `bond` field; idempotent and retried (never issue twice)
- [ ] 6.3 Settlement: when the invoice is Paid and the holder claims, `redeem` (burn) the units; show it as the lifecycle operation in the demo
- [ ] 6.4 Compliance demo: KYC list for investors, transfer restriction or freeze/lock on default (ties to the ENS revoke), pause as a bonus
- [ ] 6.5 Decide and write down who is paid if bond units move: the market contract pays the stored `holder`. Recommended: restrict bond transfers so units and `holder` can never diverge. Disclose the trusted off-chain issuer step
- [ ] 6.6 Web: on the invoice page show "Your proof of ownership" (bond token, units, HashScan link) and who gets repaid; plain-language copy
- [ ] 6.7 Verify contracts on HashScan (Sourcify), public repo, README prize map entry
- [ ] 6.8 Demo video (5 minutes or less): issuance, configuration (KYC, restriction), funding issues the bond, repayment redeems it, one freeze or lock
- [ ] Gate 6: a funded invoice on testnet has a bond token in the investor's wallet visible on HashScan, and repayment burns it

## Rules to keep

- A sponsor approval lifts only the approval threshold, never the daily limit.
- Every approval works once. Denied, expired and cancelled approvals never become valid again.
- World proves a fresh human authentication; our server binds it to one agent, action, amount, expiry and single use.
- Never log or commit keys. Mark anything unchecked as UNVERIFIED in `docs/notes/`.
- Same error twice: stop and tell Siddharth.
