# Key Architecture Decisions (DECISIONS.md)

This log records major technical and architectural decisions agreed upon by the engineering team (Mann, Siddharth, Nisarg, Rishita).

---

## Decision 1: x402 Payment Landing & Fee Settlement (Option A vs Option B)

- **Date:** 2026-11-06
- **Decision:** **Option A (Dedicated Payee Account + Hedera Facilitator Fee Payer)**
- **Context:**
  When clients (investor agents, UI callers) query the paid `/score` or `/ping` endpoint, HTTP 402 requires micro-payments in HBAR. We needed to decide where payments land and who bears gas costs.
- **Chosen Architecture (Option A):**
  - **Payee Destination:** Payments land directly in the service operator's designated Hedera account ID (`PAY_TO` / `DEPLOYER_ACCOUNT_ID`, e.g., `0.0.11326618`).
  - **Gas Fee Model:** Handled via the Hedera x402 facilitator (`api.testnet.blocky402.com` / `x402.org`). The facilitator acts as the transaction `feePayer`, meaning the paying agent pays *only* the exact tinybar amount with zero extra gas deducted from their wallet.
  - **Invoice Repayment Model:** On-chain invoice repayments from `BuyerVault.sol` land in `InvoiceMarket.sol` under a secure pull-payment pattern. The recorded investor (`holder`) claims funds via `InvoiceMarket.claim()`, preventing reentrancy attacks or denial-of-service on repayments.

---

## Decision 2: Hedera EVM Unit Handling (Tinybars vs Weibars)

- **Date:** 2026-11-06
- **Decision:** **Tinybar Storage On-Chain, Weibar Wire Conversion at JSON-RPC Edge**
- **Context:**
  Hedera EVM uses 8 decimals natively for HBAR ($1\text{ HBAR} = 10^8\text{ tinybars}$), but the Hedera JSON-RPC relay operates in 18 decimals (weibars).
- **Rule:**
  - Contracts store and compare amounts strictly in **tinybar** (`msg.value == inv.price`). Inside Solidity, amounts are **never multiplied by $10^{10}$**.
  - Client and RPC integrations scale values by $10^{10}$ over the wire using `tinybarToWeibar()` in `packages/shared/src/units.ts`.

---

## Decision 3: Tokenization Strategy (Route T1b)

- **Date:** 2026-11-06
- **Decision:** **Route T1b (ATS Bond via Backend Issuer on `InvoiceFunded` Event)**
- **Context:**
  To satisfy the Hedera Tokenize track, invoices must be tokenized using Asset Tokenization Studio (ATS). Direct EVM contract invocation of ATS Diamond facets from `InvoiceMarket` (Route T1a) creates excessive calldata coupling.
- **Rule:**
  - `InvoiceMarket.sol` emits `InvoiceFunded(invoiceId, holder, price)`.
  - The trusted backend issuer listens for the event and issues the ATS ERC-1400/ERC-3643 bond to `holder`.
  - Payout on maturity is strictly locked to the immutable `holder` on-chain, guaranteeing investor safety even under secondary market transfers.

