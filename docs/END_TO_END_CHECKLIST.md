# End-to-end checklist

The loop: seller creates an invoice, the buyer agent accepts it, an investor funds it, the agent repays at the due date, the investor claims. ENS shows the agent's record, the bond is the receipt, a World-verified human approves large payments.

`[x]` done and checked, `[~]` built / merged but not checked live (or only partially), `[ ]` not done. Owner in brackets.

**How to read prize items:** **code on `main`** is not the same as **live verified** on the hosted stack. Tick live boxes only after a human run.

Docs map: [README.md](README.md) (this folder’s index).

## 1. Make it live

- [x] Backend on AWS behind HTTPS, healthy (schema v5) [Sidd]
- [x] Buyer or seller role, buyer vault deploy, vault to name lookup merged (PR #55)
- [x] Buyer agent serves every registered vault where it is the on-chain agent — **merged** (PR #56)
- [ ] AWS server follows `main`, restart `ai-backend ai-paid-api ai-buyer-agent` [Sidd]
- [ ] Vercel env: `NEXT_PUBLIC_BACKEND_URL=https://52.63.226.208.sslip.io`
- [ ] Vercel env: `NEXT_PUBLIC_AGENT_ADDRESS=0xd2B87eFbfd542eA386cBD1724A2E8DAEb31E0fA3`
- [ ] Vercel env: `NEXT_PUBLIC_VERIFIER_ADDRESS=0x27a3c43158AC762F57B3aBe459a98e67659738EE`
- [ ] Vercel env: `NEXT_PUBLIC_BUYER_ENS_NAME=buyer.agentinvoicenf71.eth`
- [ ] Redeploy Vercel without the build cache; `/market` shows invoices
- [ ] Server `.env`: `APP_URL` = the Vercel address, `TRUST_PROXY=1`

## 2. Click through the role flow with a wallet

Backend half checked live on 2026-11-07 with a throwaway seller (role 201, change 409, name minted on Sepolia in 39 s, seller as buyer 403). The buyer half needs about 10 testnet HBAR in a throwaway wallet for the vault deploy, or a real wallet click-through.

- [ ] Connect a wallet, choose seller, sign, claim an ENS name
- [ ] Second wallet: choose buyer, deploy a vault, allow the market, register the buyer name
- [ ] Buyer name shows on `/market` and the agent page
- [ ] Buyer wallet does not see the create-invoice form

## 3. Product gaps

- [~] Seller signs `createInvoice` from their own wallet, so the seller is the on-chain supplier (code merged; falls back to the platform issuer when no wallet is connected). Contract check: any wallet may call `createInvoice`. Wallet click-through still open.
- [~] Description attached with a supplier-signed `PUT /api/invoices/:id/description` (backend tests pass)
- [ ] Profile "Invoices you created" works for a real seller wallet (needs the wallet test above)
- [~] Buyer vault panel on the profile: balance, deposit, allow a seller (code merged; untested with a wallet in this checklist)
- [~] Create form warns when the buyer has not allowed the seller's wallet (the agent skips unallowed suppliers)
- [ ] Buyer allows the seller, the agent accepts the seller's invoice, the investor funds it, the agent repays (the whole loop with new wallets)
- [ ] ENS records (limit, threshold, paid, late, status) published for every registered buyer, not just the demo one. Blocked on a design choice: records are guarded per name and key by resolver roles, so the publisher and sponsor wallets need grants on each new name, which the name's owner (the buyer) controls. Needs a Sepolia experiment
- [~] "Agent wallet" field when a buyer deploys a vault (default: ours; code merged)
- [x] Self-hosting guide for the buyer and investor agents (`docs/SELF_HOSTING.md`)
- [ ] Expose the paid score API (port 4020) so an outside investor agent can fetch scores

## 4. Prize tracks

### World ID

- [x] **Code on `main`:** World step-up → EIP-712 `LargePayment` approval signature for payments above the vault threshold (PRs #59 / #60; `approvalSignature` routes)
- [ ] **Live verified:** full path on the hosted stack (approval link → Orb → agent pays; payment without approval must revert)
- [ ] Fill the measured numbers in `docs/FEEDBACK_WORLD.md` (your own timings — do not invent)

### Tokenize (ATS)

- [ ] Create the ATS bond with the deployer account (`0.0.11326618`) in the ATS admin app, send the bond address [Sidd]
- [ ] Set `ATS_BOND_ADDRESS` on the server, restart `ai-backend`, fund a small invoice, see units and the bond link on the proof card
- [ ] Redeem on payment and freeze on default checked live

### Other

- [ ] ENS: seller control of their own resolver records (today the sponsor sets them)
- [ ] x402: paid score API reachable and used by the investor agent on the hosted stack
- [x] README prize track write-ups (ENS / ATS / World sections on root README after docs refresh)

## 5. Paths nobody has run live

- [ ] Early repayment by the agent wallet, then investor claim, on a registered (non-demo) vault
- [ ] Late invoice, then default, then what the investor sees
- [ ] Invoice above the approval threshold with no approval: it must not pay
- [ ] Buyer agent skips a vault that names a different agent (log shows it once)

## 6. Investor side (optional for the demo)

- [ ] Demo investor agent on AWS (systemd service, funded wallet, rules in env)
- [ ] Paid API (port 4020) exposed or reachable by that agent

## 7. Tech verify

- [ ] `bun run typecheck`
- [ ] `bun run lint`
- [ ] `bun run test`
- [ ] `bun run forge`
- [ ] `bun run verify:fast` (matches CI `verify-fast`)
- [ ] Optional: `bun run verify` when e2e env is available
- [ ] CI green on the branch you will demo from

## 8. Docs freshness

- [ ] [DEMO_SCRIPT.md](DEMO_SCRIPT.md) matches what is live (roles, hosting, threshold, honest “not done” list)
- [ ] [RUNBOOK-testnet.md](RUNBOOK-testnet.md) and [DEPLOY.md](DEPLOY.md) match current env and flows
- [ ] [docs/README.md](README.md) index links still resolve
- [ ] Root README Documentation section points at the right docs

## 9. Screenshots / video

- [ ] 5-minute demo video recorded (add link here only after it exists — do not invent a URL)
- [ ] Optional stills for marketplace, invoice fund, ENS agent page, World approval (store or link only after capture)

## 10. Before the demo

- [ ] Pre-create an invoice a few minutes ahead, due in a few days, **below the vault approval threshold** (demo vault often 50 HBAR)
- [ ] Vault holds at least 50 HBAR; the agent wallet has gas
- [ ] `/health` is `ok: true, degraded: false`; buyer agent log shows polling
- [ ] World / ATS / HCS beats only if those env vars are configured

## 11. Repo hygiene (after the demo / before public reuse)

- [ ] Rotate the deployer and sponsor keys, the World client secret and the SSH key (all were exposed in chat)
- [ ] Redeploy contracts with new keys if they will be reused
- [ ] Delete the AWS key pair and Elastic IP if the server is stopped
- [ ] Confirm no secrets in git history before making the repo more public (see internal `docs/notes/secrets-scan.md` for prior scan notes)
