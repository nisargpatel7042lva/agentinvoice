# Run Invoice Agent on Hedera testnet (real transactions)

Every step below moves real **testnet** HBAR. Testnet HBAR is free and has no value. Never commit `.env` or paste keys in chat.

Canonical demo buyer name: **`buyer.agentinvoicenf71.eth`** (Sepolia). Deployed contracts: see `packages/shared/src/addresses.json` and the [root README](../README.md).

## 0. Accounts and who needs HBAR

Create ECDSA accounts at **portal.hedera.com** (testnet). Each comes with free test HBAR, an account id (`0.0.x`) and an EVM address. You can also top up at **faucet.hedera.com**.

| Role | Env var(s) | Needs HBAR for | Notes |
| --- | --- | --- | --- |
| Deployer / vault owner | `DEPLOYER_PRIVATE_KEY` | gas, plus the vault's float | Owns BuyerVault: `deposit()`, `allowSupplier`, `allowMarket`, `setLimits` |
| Supplier (wallet create) | MetaMask on chain 296 | gas | Preferred: seller wallet signs `InvoiceMarket.createInvoice` from the website |
| Supplier (backend issuer fallback) | `SUPPLIER_PRIVATE_KEY` | gas | Used by `POST /api/invoices` when the web app has no connected wallet. Must be on the vault's supplier allowlist |
| Buyer agent | `BUYER_AGENT_PRIVATE_KEY` | gas | Must be the address in `BuyerVault.agent()` |
| Approval signer | `APPROVAL_SIGNER_PRIVATE_KEY` or `SPONSOR_PRIVATE_KEY` | none | Must be the vault's on-chain `verifier`; signs EIP-712 `LargePayment` after World ID |
| Investor (website) | MetaMask on chain 296 | the invoice price | Funds invoices and claims repayments |
| Investor agent | `INVESTOR_PRIVATE_KEY` + `INVESTOR_ACCOUNT_ID` | invoice prices + x402 score fees | Same key as a `0.0.x` ECDSA account |
| Paid API payee | `PAY_TO` (account id) | none | Receives x402 score payments |
| HCS audit | `HEDERA_ACCOUNT_ID`, `HEDERA_PRIVATE_KEY`, `HCS_TOPIC_ID` | small fees | Optional; publish/read only when configured |
| World ID approvals | `WORLD_CLIENT_ID`, `WORLD_CLIENT_SECRET`, `WORLD_REDIRECT_URI` | none | Optional; needed for payments above the threshold |

Deployed contracts (`packages/shared/src/addresses.json`): InvoiceMarket `0xb410…6d8b`, BuyerVault `0xbc79…8056`.

**Units:** the contracts store **tinybar** (1 HBAR = 1e8). Transactions send `value = tinybar × 10^10` (weibar). The app already does this conversion.

## 1. One-time vault setup (vault owner)
1. Fund the vault, e.g. 50 HBAR: call `BuyerVault.deposit()` with value 50 HBAR from the owner.
2. Make sure `allowMarket(InvoiceMarket, true)` and `allowSupplier(<supplier EVM address>, <limit in tinybar>)` are set. Sidd's deploy script may already have done this; check on-chain.
3. Keep most demo invoices **below `approvalThreshold`**. Above it, the buyer agent needs a World ID–backed EIP-712 `LargePayment` from the backend (`approvalSignature` routes, signer = vault verifier). Configure World + signer env before demoing that path.

## 2. Configure
- Root `.env`: copy `.env.example` and fill in the names above, plus `INVOICE_MARKET_ADDRESS`, `DEMO_VAULT_ADDRESS`, `BACKEND_URL=http://localhost:3001`, `SCORE_API_URL=http://localhost:4020`, `PAID_API_URL=http://localhost:4020`.
- `apps/web/.env.development.local`: **remove** `NEXT_PUBLIC_MOCK`, set `NEXT_PUBLIC_BACKEND_URL=http://localhost:3001`, and `NEXT_PUBLIC_BUYER_ENS_NAME=buyer.agentinvoicenf71.eth`.

## 3. Start, in this order (separate terminals)
```bash
bun install
```
```bash
bun run dev:backend
```
```bash
bunx tsx --env-file=.env services/paid-api/src/server.ts
```
```bash
bun run dev
```
```bash
bun run e2e:testnet
```
`e2e:testnet` makes live checks: contracts answer, the vault has an agent and a balance, the backend and indexer are up, and the paid API returns a real x402 402. Fix any FAIL before the demo.

Agents (optional, they run the buyer and investor sides automatically):
```bash
bunx tsx --env-file=.env agents/buyer-agent/src/index.ts
```
```bash
bunx tsx --env-file=.env agents/investor-agent/src/main.ts
```
Use `DRY_RUN=1` first to watch their decisions without sending anything.

## 4. The demo, step by step (all real transactions)
1. **Profile:** connect a wallet, choose **seller** (or use a wallet that already has the seller role), claim an ENS name if needed.
2. **Create** (website → Create invoice): buyer `buyer.agentinvoicenf71.eth` (or the vault's 0x address). With the seller wallet connected, the seller signs `createInvoice` on-chain and is the supplier; without a wallet, the backend issuer fallback creates it via `POST /api/invoices`. Status **Pending**. Attach the description when prompted (supplier-signed).
3. **Accept**: the buyer agent does it automatically (supplier must be allowlisted). Or open the invoice with the **buyer agent's wallet** in MetaMask and click **Accept as buyer agent** → **Open**.
4. **Fund**: connect an investor wallet → **Fund invoice for X HBAR** → confirm in MetaMask → **Funded**. You are the holder. (Or the investor agent buys it after paying for the score over x402.)
5. **Pay**: the buyer agent pays from the vault, or click **Pay from the buyer vault** with the agent's wallet → **Paid**. Above the threshold, complete World ID approval first so the agent can fetch the signed approval.
6. **Claim**: as the investor, open any invoice → **Claim X HBAR** → the repayment arrives in your wallet.
7. Optional default path: create one with a near due date and don't pay. After the due date anyone can **Mark as late**, and after the grace period **Mark as defaulted**.
8. Show the receipts: every toast links to HashScan; the invoice Activity section shows HCS events **when** `HCS_TOPIC_ID` is configured; the **Network** page shows the relationships. Optional: **/treasury** for SaucerSwap USDC helpers (settlement on invoices is still HBAR).

## Known gaps (be honest in the demo)
- **Payments above the threshold:** require World ID + approval signer env. Code for EIP-712 signatures is on `main`; without that configuration the agent skips oversized invoices.
- **ATS bond proof card:** needs `ATS_BOND_ADDRESS` set after creating the bond in the ATS admin app ([DEPLOY.md](DEPLOY.md)).
- **HCS activity feed:** optional until `HCS_TOPIC_ID` (and publish keys for writes) are set.
- **Hedera Agent Accounts:** the adapter is ready, but there's no public API yet (`docs/notes/agent-accounts.md`).
- **USDC settlement:** treasury helpers exist; on-chain invoice settlement remains HBAR until redeploy ([notes/saucerswap.md](notes/saucerswap.md)).
- **x402 settlement in unit tests:** facilitator settlement only shows up against a real HTTP server, so it is proven by the live run (`bun run e2e:testnet` plus an investor-agent score purchase). It is not covered by unit tests.
