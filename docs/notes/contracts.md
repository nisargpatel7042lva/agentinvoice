# Smart Contracts & Verification Notes

## Overview
- **Network:** Hedera Testnet EVM (Chain ID `296`)
- **RPC:** `https://testnet.hashio.io/api`
- **Compiler:** Solc `0.8.24` / `0.8.38` via Foundry

## Contracts Implemented
1. **`InvoiceMarket.sol`**
   - Implements `IInvoiceMarket` and `IBondIssuer` hook.
   - States: `Pending` -> `Open` -> `Funded` -> `Paid` (or `Late` -> `Defaulted`).
   - Invoices start as `Pending` and require explicit `acceptInvoice(id)` call from `buyerVault`.
   - `buy(id)` stores `holder = msg.sender` at funding time and emits `InvoiceFunded(id, holder, faceAmount)`.
   - `payInvoice(id)` pays the recorded `holder` address directly via pull payment (`claim()`), ensuring full isolation from secondary token transfers.
   - Includes reentrancy guard (`nonReentrant`) and pull payments.

2. **`BuyerVault.sol`**
   - Implements `IBuyerVault` managing autonomous buyer agent spend.
   - Enforces `allowedSupplier(address)` and `supplierLimit(address)` per merchant.
   - Enforces hard UTC daily cap `dailyLimit` reset every `block.timestamp / 1 days`.
   - For payments above `approvalThreshold`, enforces EIP-712 typed signature verification:
     - `LargePayment(address vault,uint256 invoiceId,uint256 amount,uint256 nonce,uint256 expiry)`
     - Verifier key signs approval; nonces are single-use.
   - Invariant: sponsor approval lifts threshold only, never dailyLimit.

## Test Results
- **Foundry unit & fuzz tests:** 16 tests passing across 3 test suites (`SmokeTest`, `BuyerVaultTest`, `InvoiceMarketTest`).
- Fuzz testing: `testFuzz_price_and_discount` passing 256 runs.

## Deployment & Verification Commands
```bash
# Deployment via Forge script
forge script contracts/script/Deploy.s.sol:DeployScript \
  --rpc-url https://testnet.hashio.io/api \
  --broadcast \
  --legacy

# Verification via HashScan / Sourcify
forge verify-contract <DEPLOYED_ADDRESS> contracts/src/InvoiceMarket.sol:InvoiceMarket \
  --verifier sourcify \
  --verifier-url https://server-response.sourcify.dev
```

