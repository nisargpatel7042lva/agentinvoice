# End-to-end checklist

The loop: seller creates an invoice, the buyer agent accepts it, an investor funds it, the agent repays at the due date, the investor claims. ENS shows the agent's record, the bond is the receipt, a World-verified human approves large payments.

`[x]` done and checked, `[~]` built but not checked live, `[ ]` not done. Owner in brackets. Last updated 2026-11-07 after the live World approval and ATS bond tests.

## 1. Make it live

- [x] Backend on AWS behind HTTPS, healthy (schema v5) [Sidd]
- [x] Buyer or seller role, buyer vault deploy, vault to name lookup merged (PR #55)
- [x] PR #56 (buyer agent serves every registered vault) merged; checked live: the agent accepted invoice 15 on a registered vault
- [ ] Merge PRs #61 (World diagnostics) and #62 (ATS configure and KYC fixes), then put the AWS server back on `main` with the DEPLOY update command. It runs the #62 branch today [Sidd]
- [x] Vercel env: `NEXT_PUBLIC_BACKEND_URL=https://52.63.226.208.sslip.io` (the live site shows market data and invoices)
- [ ] Vercel env: `NEXT_PUBLIC_AGENT_ADDRESS=0xd2B87eFbfd542eA386cBD1724A2E8DAEb31E0fA3`
- [ ] Vercel env: `NEXT_PUBLIC_VERIFIER_ADDRESS=0x27a3c43158AC762F57B3aBe459a98e67659738EE`
- [ ] Vercel env: `NEXT_PUBLIC_BUYER_ENS_NAME=buyer.agentinvoicenf71.eth`
- [x] Redeploy Vercel; `/market` and `/invoice/15` load with data
- [x] Server `.env`: `APP_URL` is the Vercel address, `TRUST_PROXY=1`, `ATS_BOND_ADDRESS`, World client id, secret and redirect (checked 2026-11-07). A pasted secret was once doubled to 132 characters; the correct one is 66

## 2. Click through the role flow with a wallet

Backend half checked live on 2026-11-07 with a throwaway seller (role 201, change 409, name minted on Sepolia in 39 s, seller as buyer 403). The buyer half needs about 10 testnet HBAR in a throwaway wallet for the vault deploy, or a real wallet click-through.

- [ ] Connect a wallet, choose seller, sign, claim an ENS name
- [ ] Second wallet: choose buyer, deploy a vault, allow the market, register the buyer name
- [ ] Buyer name shows on `/market` and the agent page
- [ ] Buyer wallet does not see the create-invoice form

## 3. Product gaps

- [~] Seller signs `createInvoice` from their own wallet, so the seller is the on-chain supplier (code merged on phase_13, untested with a wallet; falls back to the platform issuer when no wallet is connected). Contract check: any wallet may call `createInvoice`.
- [~] Description attached with a supplier-signed `PUT /api/invoices/:id/description` (backend tests pass)
- [ ] Profile "Invoices you created" works for a real seller wallet (needs the wallet test above)
- [~] Buyer vault panel on the profile: balance, deposit, allow a seller (code on phase_13, untested with a wallet)
- [~] Create form warns when the buyer has not allowed the seller's wallet (the agent skips unallowed suppliers)
- [ ] Buyer allows the seller, the agent accepts the seller's invoice, the investor funds it, the agent repays (the whole loop with new wallets)
- [ ] ENS records (limit, threshold, paid, late, status) published for every registered buyer, not just the demo one. Blocked on a design choice: records are guarded per name and key by resolver roles, so the publisher and sponsor wallets need grants on each new name, which the name's owner (the buyer) controls. Needs a Sepolia experiment
- [~] "Agent wallet" field when a buyer deploys a vault (default: ours; code on phase_13)
- [x] Self-hosting guide for the buyer and investor agents (`docs/SELF_HOSTING.md`)
- [ ] Expose the paid score API (port 4020) so an outside investor agent can fetch scores

## 4. Prize tracks

- [x] World: signed approval so the vault releases a payment above the threshold (issue #31). Verified live 2026-11-07: invoice 15 (3 HBAR, vault threshold 1 HBAR) showed Human approval needed, a World Orb approval, the agent logged `due and sponsor approval is available`, and the invoice went Paid
- [ ] World: fill the TBD numbers in `docs/FEEDBACK_WORLD.md` (your own numbers)
- [x] Tokenize: ATS bond created with the deployer account (`0xf2FF0B14d1C1492289e63F95bC4f9Ef965C8F413`, Hedera `0.0.11348010`). The wizard used its defaults, so it is named "Demo Bond 2026" (`DCB2026`, 6 decimals), not `AINV`. Cosmetic
- [x] Tokenize: `scripts/ats/configure-bond.ts` (PR #62) grants the deployer the roles, turns on internal KYC and lists it as a trusted issuer (without that `grantKyc` reverts). Run once per bond
- [x] Tokenize: `ATS_BOND_ADDRESS` set on the server; units issued live for invoices 8, 13 and 14 (the investor wallet holds the 200M + 100M units of 8 and 13)
- [x] Tokenize: a holder's second invoice works (the service skips the KYC grant when it already exists); an issuance interrupted by a restart is settled against the chain instead of sticking (PR #62)
- [ ] Tokenize: redeem on payment checked live (needs an invoice funded after the bond existed, then paid; invoice 15 was paid before)
- [ ] Tokenize: freeze on default checked live
- [ ] ENS: seller control of their own resolver records (today the sponsor sets them)
- [ ] x402: paid score API reachable and used by the investor agent
- [ ] README prize entries

## 5. Paths nobody has run live

- [ ] Early repayment by the agent wallet, then investor claim, on a registered (non-demo) vault
- [ ] Late invoice, then default, then what the investor sees
- [x] Invoice above the approval threshold with no approval does not pay (checked live: the agent logged `needs sponsor approval` repeatedly until the approval existed)
- [ ] Buyer agent skips a vault that names a different agent (log shows it once). Covered by a unit test, not run live

## 6. Investor side (optional for the demo)

- [ ] Demo investor agent on AWS (systemd service, funded wallet, rules in env)
- [ ] Paid API (port 4020) exposed or reachable by that agent

## 7. Before the demo

- [ ] Pre-create an invoice a few minutes ahead, due in a few days, under 50 HBAR
- [ ] Vault holds at least 50 HBAR; the agent wallet has gas
- [ ] `/health` is `ok: true, degraded: false`; buyer agent log shows polling
- [ ] Demo script (`docs/DEMO_SCRIPT.md`) matches what is live
- [ ] 5-minute demo video recorded

## 8. After the demo

- [ ] Rotate the deployer and sponsor keys, the World client secret and the SSH key (all were exposed in chat)
- [ ] Redeploy contracts with new keys if they will be reused
- [ ] Delete the AWS key pair and Elastic IP if the server is stopped
