# Buyer agent notes

## Shared types (do not rename)

- `Invoice` includes `description` and `evidenceHash` (`0x` + 64 hex). Amounts are decimal strings.
- Shared `ReviewResult` is `{ action: "approve" | "reject" | "escalate", reason }`. Leave it unchanged.
- The buyer review result is local: `{ action: "accept" | "dispute" | "escalate", reason }`.

## API and vault used by later steps

- List invoices with `createApiClient().listInvoices(status)`. Spec v2 path is `GET /api/invoices` with an optional `status`. There is no `buyer` query. Filter `buyerVault` in the agent.
- Pending acceptance is `BuyerVault.accept(market, id)`.
- Payment ABI has `payInvoice(market, id)` and `payInvoice(market, id, approval)`.
- Read `allowedSupplier`, `supplierLimit`, `dailyLimit`, `approvalThreshold`, and `spentToday` from the vault. Do not hardcode limits.
- The vault has no `balance()` getter. `payInvoice` checks `address(this).balance`, so the agent reads that with `getBalance`. A payment is skipped when `spentToday + faceAmount > dailyLimit`. Sponsor approval does not raise the daily limit.
- `POST /api/approvals` returns `{ approvalId, authorizationUrl }`. It does not return the `bytes approval` argument. Ask Mann before sending a sponsored payment.

## What already exists

- `decide()` is deterministic and does not call a model.
- `createBuyerAgent()` lists Pending and Funded invoices, then accepts or pays from `decide()`.
- A funded invoice is payable when `dueDate <= now + 10` seconds. Due invoices are handled oldest due date first, before pending accepts.
- A payment calls `reviewInvoice` only after `decide()` says pay. `accept` pays, `dispute` logs the reason, and `escalate` logs that sponsor approval is needed. No model means no payment. Pending acceptance does not call the model.
- `DRY_RUN=1` skips transactions. The loop default in config is 15000 ms.
- No model name is configured. `reviewInvoice` takes a model caller so tests never hit the network.

## Review rule

- One model call returns JSON. Zod must accept `accept`, `dispute`, or `escalate` plus a non-empty reason.
- The agent caches that result by invoice id and `evidenceHash`. The same pair is not sent to the model again, including after a failed call. A new `evidenceHash` is a new review. A description change with the same hash keeps the cached review.
- Invalid, malformed, uncertain, or failed calls return `escalate` and never `accept`.
- Prompts and logs must not include private keys or API keys.

## Six mocked outcomes

The model is faked. A live call still waits on the model name.

1. Delivery matches the evidence: model `accept`, then pay if the vault rules already allow it.
2. Delivery does not match: model `dispute`, no payment.
3. Amount exceeds the daily limit: skip before the model, even when the fake model would accept.
4. Evidence is missing: model `dispute`, no payment.
5. Invoice looks like a duplicate: model `dispute`, no payment.
6. Amount looks suspicious: model `dispute`, no payment.
