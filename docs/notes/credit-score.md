# Credit Score Model (v1)

## Overview

Invoice Agent implements a deterministic, tamper-proof credit score (300–900 scale) for buyer agents participating in invoice financing.

Before funding an invoice, investors can inspect the buyer agent's credit score and an itemized 5-factor breakdown. Every factor links directly to verifiable on-chain events on Hedera. The score is identical everywhere it appears:
1. Public Web UI (`apps/web` agent profile, invoice detail, and marketplace).
2. Paid x402 score API (`services/paid-api` `GET /score?vault=0x...`).
3. Autonomous Investor Agent (`agents/investor-agent` `MIN_SCORE` rule).

## Model Specification

- **Model Version**: `invoiceagent-credit-v1`
- **Scale**: `300` to `900`
- **Bands**:
  - **Band A**: `score >= 750` (Excellent / Strong payment track record)
  - **Band B**: `650 <= score < 750` (Good / Mostly on time)
  - **Band C**: `score < 650` (Higher risk / Frequent delays or defaults)
  - **Band New**: `score = null` (Fewer than 3 settled invoices)

### "New" Rule
If an agent has fewer than 3 settled invoices (`settled < 3`):
- `score = null`
- `band = "New"`
- Factor metrics are still reported with individual values and evidence.
- Summary states: `"Not enough history yet (N settled invoices; 3 needed)"`.

## Formula & 5 Weighted Factors

Each factor evaluates to a number in the range `[0.0000, 1.0000]` (rounded to 4 decimal places).

$$\text{WeightedSum} = 0.35P + 0.20D + 0.20U + 0.15H + 0.10V$$

$$\text{Score} = \text{clamp}\Big(300, 900, \text{round}(300 + 600 \times \text{WeightedSum})\Big)$$

### 1. Payment History ($P$, Weight: 35%)
Rewards invoices paid on time, gives partial credit for invoices paid late, and gives zero credit for invoices that are currently late or defaulted.

$$P = \frac{\text{onTime} + 0.5 \times \text{paidLate}}{\text{settled}}$$

- `onTime`: Invoices with status `Paid` without an `invoice.late` audit event.
- `paidLate`: Invoices with status `Paid` that previously had an `invoice.late` event on Hedera Consensus Service.
- If audit history is unavailable, all `Paid` invoices are counted as on-time, with a note in factor details.
- Points: $\text{round}(600 \times 0.35 \times P) = 0\dots 210$ pts.

### 2. Defaults & Recency ($D$, Weight: 20%)
Penalizes defaults, weighting recent defaults twice as heavily as older defaults.

$$D = \max\left(0, 1 - \sum_{\text{defaulted}} \text{penalty}\right)$$

- Recent default ($\text{now} - \text{dueDate} \le 90\text{ days}$): penalty = `0.50`
- Older default ($\text{now} - \text{dueDate} > 90\text{ days}$): penalty = `0.25`
- Points: $\text{round}(600 \times 0.20 \times D) = 0\dots 120$ pts.

### 3. Exposure vs Limit ($U$, Weight: 20%)
Measures open exposure (face amount of `Funded` or `Late` invoices) against the buyer vault's daily spending limit.

- When daily limit $L > 0$ is known:
  - Utilization $u = \frac{\text{openExposure}}{L}$
  - If $u \le 0.30$: $U = 1.0$ (safe buffer)
  - If $u \ge 1.00$: $U = 0.0$ (at or over limit)
  - Otherwise linear: $U = \frac{1 - u}{0.70}$
- When daily limit is unknown:
  - If $\text{openExposure} == 0$: $U = 1.0$
  - If $\text{openExposure} > 0$: $U = 0.5$ (neutral weighting)
- Points: $\text{round}(600 \times 0.20 \times U) = 0\dots 120$ pts.

### 4. History Length ($H$, Weight: 15%)
Measures account age based on elapsed time since the buyer vault's earliest invoice due date.

$$H = \min\left(1, \frac{\text{ageDays}}{180}\right)$$

- 180 days (6 months) establishes full score for history length.
- Points: $\text{round}(600 \times 0.15 \times H) = 0\dots 90$ pts.

### 5. Track Record Size ($V$, Weight: 10%)
Measures volume of settled obligations.

$$V = \min\left(1, \frac{\text{settled}}{20}\right)$$

- 20 settled invoices achieves full track record weight.
- Points: $\text{round}(600 \times 0.10 \times V) = 0\dots 60$ pts.

---

## Data Sources & Architecture

```
                 ┌────────────────────────────────────────────────┐
                 │               Hedera Blockchain                │
                 │  - Smart Contracts (BuyerVault, InvoiceMarket) │
                 │  - HCS Audit Events (invoice.*)                │
                 └───────────────────────┬────────────────────────┘
                                         │
                                         ▼
                 ┌────────────────────────────────────────────────┐
                 │          packages/shared/src/creditScore.ts    │
                 │     computeCreditReport({ vault, invoices })   │
                 └───────┬────────────────────────┬───────────────┘
                         │                        │
         ┌───────────────┴────────┐       ┌───────┴───────────────┐
         ▼                        ▼       ▼                       ▼
┌──────────────────┐    ┌───────────────┐   ┌───────────────────────────┐
│ apps/web         │    │ paid-api      │   │ investor-agent            │
│ CreditScoreCard  │    │ GET /score    │   │ MIN_SCORE >= 650          │
│ loadCreditReport │    │ (x402 tinybar)│   │ skip if null / below min  │
└──────────────────┘    └───────────────┘   └───────────────────────────┘
```

1. **Pure Shared Package (`packages/shared/src/creditScore.ts`)**:
   - Zero I/O, pure mathematical computation.
   - Deterministic and case-insensitive on vault addresses.
   - Outputs factor evidence lists containing the real invoice IDs.

2. **Cached Server Loader (`apps/web/src/lib/credit.ts`)**:
   - Uses React `cache()` for request deduplication.
   - A page with multiple buyer scores makes only 1 invoices fetch and 1 audit fetch.

3. **Paid API (`services/paid-api/src/expressApp.ts`)**:
   - Behind real x402 payment middleware (paid in HBAR tinybars).
   - Validates buyer vault hex address before demanding payment.
   - Returns full `credit` report and `creditScore` alongside legacy `BuyerScore` fields.

4. **Investor Agent (`agents/investor-agent/src/decide.ts`)**:
   - Reads `MIN_SCORE` from environment (default `650`, validated between 300 and 900).
   - Skips invoices if buyer credit score is `null` (`"no credit history yet"`) or below `MIN_SCORE`.
   - Both `MIN_SCORE` and `MIN_BAND` must pass.
