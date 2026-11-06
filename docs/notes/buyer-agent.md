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
- `POST /api/approvals` returns `{ approvalId, authorizationUrl }`. It does not return the `bytes approval` argument. Ask Mann before sending a sponsored payment.

## What already exists

- `decide()` is deterministic and does not call a model.
- `createBuyerAgent()` lists Pending and Funded invoices, then accepts or pays from `decide()`. It does not call `reviewInvoice` yet.
- `DRY_RUN=1` skips transactions. The loop default in config is 15000 ms.
- No model name is configured. `reviewInvoice` takes a model caller so tests never hit the network.

## Review rule

- One model call returns JSON. Zod must accept `accept`, `dispute`, or `escalate` plus a non-empty reason.
- Invalid, malformed, uncertain, or failed calls return `escalate` and never `accept`.
- Prompts and logs must not include private keys or API keys.
