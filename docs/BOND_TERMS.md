# AgentInvoice Bond Terms & Mechanics

This document outlines the asset tokenization terms for invoices financed through AgentInvoice on the Hedera network, compliant with the Hedera Tokenize track requirements using the **Asset Tokenization Studio (ATS)**.

---

## 1. Asset Overview & Structure

- **Instrument Name:** AgentInvoice Commercial Paper / Bond
- **Asset Class:** Short-term Tokenized Commercial Debt / Trade Receivable
- **Standard:** ERC-1400 / ERC-3643 compliant Diamond standard token deployed via Hedera Asset Tokenization Studio (ATS).
- **Network:** Hedera Testnet (Chain ID `296`).
- **Denomination & Currency:** HBAR (natively stored as tinybars: $1\text{ HBAR} = 10^8\text{ tinybars}$).

---

## 2. Token Issuance & Lifecycle (Route T1b)

1. **Invoice Creation & Approval:**
   - A verified supplier issues an invoice (`Pending`).
   - The Buyer's autonomous `BuyerVault` reviews and accepts the invoice (`Open`).

2. **Funding & Primary Issuance:**
   - An investor funds the invoice on `InvoiceMarket.sol` by sending the discounted price (`price`).
   - `InvoiceMarket.sol` transitions status to `Funded` and records the investor's address as the immutable `holder`.
   - `InvoiceFunded` event is emitted on-chain.
   - The backend ATS Issuer service detects `InvoiceFunded` and mints/issues the corresponding ATS bond token to the investor's wallet address.

3. **Maturity & Repayment:**
   - **Nominal Face Value:** Full invoice face value payable at or before `dueDate`.
   - **Maturity / Due Date:** Configured Unix timestamp (typically 30–90 days for trade invoices; 180 seconds for testnet demo mode).
   - **Repayment Flow:** The `BuyerVault` pays the full face amount (`faceAmount`) into `InvoiceMarket.sol`.
   - **Claim Mechanism:** Investors claim their principal plus discount yield via `InvoiceMarket.claim()`. The payout rule is strictly bound to the stored `holder` address on-chain, ensuring zero loss even if secondary transfers occur.

4. **Default & Grace Period:**
   - A 60-second grace period applies after `dueDate`.
   - Invoices unpaid after `dueDate` can be marked as `Late`.
   - Invoices unpaid after `dueDate + gracePeriod` can be marked as `Defaulted`.

---

## 3. Compliance & Transfer Restrictions

- **Investor Allowlist / KYC:**
  - Token transfers require recipient identity verification via the ATS Identity Registry facet.
- **Freeze Controls:**
  - The issuer or admin retains the compliance right to freeze tokens or restrict transfers in cases of regulatory or sanctions enforcement.
- **Holder Isolation:**
  - The on-chain settlement and pull-payment claim on `InvoiceMarket` is locked to the original funding investor (`holder`), ensuring financial integrity and preventing unauthorized claims.

