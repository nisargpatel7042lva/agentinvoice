# Frontend actions: what every button does (2026-11-06)

The web app works end to end today, so everyone can build and demo in parallel. Every button calls **one** function in `apps/web/src/app/actions.ts` (server actions) or uses the **real wallet** (wagmi). To swap the temporary behaviour for the real system, change that one function. No screen changes are needed.

## Modes
- `NEXT_PUBLIC_MOCK=1` (put it in `apps/web/.env.development.local`): pages read a **temporary in-memory store** (`apps/web/src/lib/mockStore.ts`), seeded from the shared fixtures. Clicks change it, and it resets on server restart or with **Reset demo data**. A **Demo controls** box on each invoice lets you act as the buyer agent. It only appears in this mode.
- Mock off: pages read the real backend (`NEXT_PUBLIC_BACKEND_URL`). Server actions that are not wired yet answer with a clear "not connected yet (owner: …)" toast instead of failing silently.

## Wallet (real, no mock)
- wagmi + viem, injected browser wallets (MetaMask, Rabby, Coinbase extension…) via EIP-6963, on **Hedera testnet, chain 296**. The RPC can be overridden with `NEXT_PUBLIC_HEDERA_RPC_URL`.
- Header button states: Get a wallet (none installed) → Connect wallet → Switch to Hedera testnet (wrong network) → address menu (balance, copy, HashScan, disconnect).
- Files: `lib/wagmi.ts`, `components/Providers.tsx`, `components/WalletButton.tsx`.

## Buttons → functions → who wires the real version

| Button (where) | Function | Mock behaviour | Real version | Owner |
| --- | --- | --- | --- | --- |
| Connect wallet (header) | wagmi `connect` | real | real | done |
| Fund invoice (invoice page) | `FundButton` | records your **real address** as holder, no HBAR moves | **done**: `InvoiceMarket.fund(id)` with `value = price × 10^10` (tinybar → weibar), waits for the receipt | Mann: confirm `fund` and units |
| Create invoice (supplier) | `createInvoice` | new Pending invoice, redirects to it | `POST /api/invoices` (issuer wallet creates on-chain) | Sidd |
| Accept as buyer (demo) | `acceptInvoice` | Pending → Open | buyer agent: `BuyerVault.accept(market, id)` | Rishita + Mann |
| Pay as buyer (demo) | `payInvoice` | Funded/Late → Paid; above the threshold it opens an approval first | buyer agent: `BuyerVault.payInvoice`, plus the approval signature | Rishita + Mann + Sidd |
| Mark late / defaulted (demo) | `markLate`, `markDefaulted` | status change | `InvoiceMarket.markLate/markDefaulted` (keeper or script) | Mann |
| Approve / Reject (approval page) | `decideApproval` | pending → approved/rejected | World ID step-up: `POST /api/approvals`, `/api/world/callback` | Sidd |
| Reset demo data | `resetDemo` | reseeds the store | n/a (demo only) | n/a |
| Theme toggle, filters, search, folded sections, "Got it" | client only | real | real | done |

## Rules for the team
- Add a new action in `actions.ts` with both branches: the mock branch, and the real branch or `notWired("…", "owner")`. Return `ActionResult` so the UI shows a toast.
- Never call contracts or the backend straight from a component, except wallet-signed transactions like `FundButton`, which must run in the browser.
- Demo controls stay behind `isMock`, so they never ship to production.
