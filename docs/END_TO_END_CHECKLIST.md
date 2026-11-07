# End-to-end checklist

The loop: seller creates an invoice, the buyer agent accepts it, an investor funds it, the agent repays at the due date, the investor claims. ENS shows the agent's record, the bond is the receipt, a World-verified human approves large payments.

`[x]` done and checked, `[~]` built but not checked live, `[ ]` not done. Owner in brackets.

## 1. Make it live

- [x] Backend on AWS behind HTTPS, healthy (schema v5) [Sidd]
- [x] Buyer or seller role, buyer vault deploy, vault to name lookup merged (PR #55)
- [ ] Merge PR #56 (buyer agent serves every registered vault) [Nisarg or Sidd]
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

- [ ] World: signed approval so the vault releases a payment above the threshold (issue #31)
- [ ] World: fill the TBD numbers in `docs/FEEDBACK_WORLD.md` (your own numbers)
- [ ] Tokenize: create the ATS bond with the deployer account (`0.0.11326618`) in the ATS admin app, send the bond address [Sidd]
- [ ] Tokenize: set `ATS_BOND_ADDRESS` on the server, restart `ai-backend`, fund a small invoice, see units and the bond link on the proof card
- [ ] Tokenize: redeem on payment and freeze on default checked live
- [ ] ENS: seller control of their own resolver records (today the sponsor sets them)
- [ ] x402: paid score API reachable and used by the investor agent
- [ ] README prize entries

## 5. Paths nobody has run live

- [ ] Early repayment by the agent wallet, then investor claim, on a registered (non-demo) vault
- [ ] Late invoice, then default, then what the investor sees
- [ ] Invoice above the approval threshold with no approval: it must not pay
- [ ] Buyer agent skips a vault that names a different agent (log shows it once)

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
