# x402 on Hedera Testnet — Verified Facts & Protocol Design

## 1. Verified Package Names & Versions

The official TypeScript implementation of the x402 payment standard is maintained in `coinbase/x402` and published under the `@x402` npm scope. Verified packages and versions:

| Package | Version | Purpose |
| --- | --- | --- |
| `@x402/core` | `^2.30.0` | Core types, schemas, HTTP server/client helpers, `x402ResourceServer`, `x402Client`, `HTTPFacilitatorClient` |
| `@x402/hedera` | `^2.30.0` | Hedera `exact` payment scheme for client, server, and facilitator (`@x402/hedera/exact/*`), plus SDK signer helpers |
| `@x402/express` | `^2.30.0` | Express middleware `paymentMiddleware` and route handling for x402 v2 |
| `@x402/fetch` | `^2.30.0` | Fetch wrapper client with automatic 402 intercept, sign, and retry |

**Hedera SDK Dependencies:**
- `@x402/hedera` depends on `@hiero-ledger/sdk` (`^2.90.1`) and `@hiero-ledger/proto` (`^2.32.0`).
- `@x402/hedera` re-exports the required SDK primitives (`TransferTransaction`, `TransactionId`, `AccountId`, `Hbar`, `PrivateKey`, `Client`) so client and server do not risk duplicate-instance type/branding mismatches.

---

## 2. Facilitator Selection & Fee Payer Model

### Probed Facilitators Supporting `hedera:testnet`

All three candidate endpoints were probed via their `/supported` endpoints:

1. **`https://api.testnet.blocky402.com`** (Primary)
   - Scheme: `exact` (x402Version 2)
   - Network: `hedera:testnet`
   - Fee Payer: `0.0.7162784`
   - Signer: `0.0.7162784`
2. **`https://x402.org/facilitator`** (Official Coinbase/x402 Reference Facilitator)
   - Scheme: `exact` (x402Version 2)
   - Network: `hedera:testnet`
   - Fee Payer: `0.0.9185802`
   - Signer: `0.0.9185802`
3. **`https://testnet.facilitator.launa.dev`**
   - Scheme: `exact` (x402Version 2)
   - Network: `hedera:testnet`
   - Fee Payer: `0.0.9839454`
   - Signer: `0.0.9839454`

### Who Pays Network Fees?

**The Facilitator pays the network fees as `feePayer`.**
- In Hedera's transaction structure, `transactionId` consists of `accountId@validStartSeconds.nanos`. The account id in the `transactionId` designates the fee payer responsible for consensus gas fees.
- The client constructs a `TransferTransaction` setting `transactionId = TransactionId.generate(AccountId.fromString(requirements.extra.feePayer))`.
- The client signs only for its own fund debit (`-amount` tinybars from payer $\to$ `+amount` to `payTo`).
- The facilitator inspects the transfer, co-signs as the `feePayer`, and submits the transaction to the network.
- **Client exposure**: The client pays *strictly* the invoice amount in tinybars/tokens with zero network fee deduction from the client account.

---

## 3. How the Client Signs a Hedera TransferTransaction

Using `@x402/hedera` (`createClientHederaSigner` or manual transaction creation):

1. **Receive 402**: Extract `PaymentRequirements` from the `PAYMENT-REQUIRED` header:
   - `network`: `"hedera:testnet"`
   - `asset`: `"0.0.0"` (HBAR)
   - `amount`: tinybars as string (e.g., `"100000000"` for 1 HBAR)
   - `payTo`: Recipient Hedera Account ID (`0.0.xxxx`)
   - `extra.feePayer`: Facilitator Account ID (`0.0.7162784`)
2. **Build Transfer**:
   ```ts
   const tx = new TransferTransaction();
   tx.addHbarTransfer(payerAccountId, Hbar.fromTinybars((-amount).toString()));
   tx.addHbarTransfer(payToAccountId, Hbar.fromTinybars(amount.toString()));
   tx.setTransactionId(TransactionId.generate(AccountId.fromString(requirements.extra.feePayer)));
   ```
3. **Freeze & Sign**:
   ```ts
   const client = Client.forTestnet();
   tx.freezeWith(client);
   const partiallySignedTx = await tx.sign(payerPrivateKey);
   const base64Tx = Buffer.from(partiallySignedTx.toBytes()).toString("base64");
   ```
4. **Wrap in PaymentPayload**:
   Encode the payload with `x402Version: 2`, `accepted: requirements`, and `payload: { transaction: base64Tx }`.
5. **Send with Retry**:
   Send HTTP request with header `PAYMENT-SIGNATURE: <base64(JSON.stringify(paymentPayload))>`.

---

## 4. Exact Request and Response Shapes (x402 v2)

### A. Initial Request (Unpaid)
- Client calls: `GET /ping` without payment headers.

### B. Server 402 Response
- Status: `HTTP/402 Payment Required`
- Headers:
  - `PAYMENT-REQUIRED`: Base64-encoded JSON of `PaymentRequired`
  - `Cache-Control`: `no-store`
- Decoded JSON:
  ```json
  {
    "x402Version": 2,
    "resource": {
      "url": "http://localhost:4021/ping",
      "description": "Ping test endpoint",
      "mimeType": "application/json"
    },
    "accepts": [
      {
        "scheme": "exact",
        "network": "hedera:testnet",
        "asset": "0.0.0",
        "amount": "10000000",
        "payTo": "0.0.xxxx",
        "maxTimeoutSeconds": 180,
        "extra": {
          "feePayer": "0.0.7162784"
        }
      }
    ]
  }
  ```

### C. Client Retry Request (With Payment)
- Client calls: `GET /ping`
- Headers:
  - `PAYMENT-SIGNATURE`: Base64-encoded JSON of `PaymentPayload`
- Decoded JSON:
  ```json
  {
    "x402Version": 2,
    "resource": {
      "url": "http://localhost:4021/ping"
    },
    "accepted": {
      "scheme": "exact",
      "network": "hedera:testnet",
      "asset": "0.0.0",
      "amount": "10000000",
      "payTo": "0.0.xxxx",
      "maxTimeoutSeconds": 180,
      "extra": {
        "feePayer": "0.0.7162784"
      }
    },
    "payload": {
      "transaction": "<base64 TransferTransaction bytes>"
    }
  }
  ```

### D. Server Settlement & 200 Response
- Server calls Facilitator `/verify` then `/settle`.
- Facilitator signs as fee payer, broadcasts to Hedera consensus node, and waits for `SUCCESS` receipt.
- Status: `HTTP/200 OK`
- Headers:
  - `PAYMENT-RESPONSE`: Base64-encoded JSON of `SettleResponse`
- Decoded Header JSON:
  ```json
  {
    "success": true,
    "payer": "0.0.yyyy",
    "transaction": "0.0.7162784@1700000000.000000000",
    "network": "hedera:testnet"
  }
  ```
- Response Body:
  ```json
  {
    "pong": true,
    "payer": "0.0.yyyy",
    "transaction": "0.0.7162784@1700000000.000000000"
  }
  ```
- **HashScan Link**: `https://hashscan.io/testnet/transaction/<transaction>`
