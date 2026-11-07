# USDC settlement

Every invoice payment now moves **USDC** (SaucerSwap testnet USDC, HTS `0.0.5449`, 6 decimals, EVM `0x…1549`), not HBAR. HBAR still pays gas and x402 score fees, and is what people and agents swap into USDC on SaucerSwap V2.

## Money flow

| Step | Who | What moves |
|---|---|---|
| Fund | Investor wallet | `approve(market, price)` then `fund(id)`: `price` USDC from the investor straight to the supplier |
| Repay | Buyer vault (agent calls `payInvoice`) | The vault approves exactly `faceAmount`, the market pulls it in, credits the holder; leftover allowance is cleared |
| Claim | Holder | `claim()`: `faceAmount` USDC to the holder |

Contracts: `InvoiceMarket(gracePeriod, token)`, `BuyerVault(owner, agent, verifier, dailyLimit, approvalThreshold, token)`. Both associate themselves with USDC (HIP-719 `associate()`) in the constructor; `associateToken()` retries. A vault refuses to allow a market that settles in a different token. All amounts (prices, limits, exposure) are USDC base units.

## Getting USDC

- **Website**: `/treasury` and the Fund flow on an invoice: turn on USDC (one association tx, if the wallet has no free auto-association slots), swap HBAR -> USDC against a live quote (max 1% slippage, max 100 HBAR per swap), approve, fund.
- **Investor agent**: before funding, if short, swaps just enough HBAR (quote + 5% headroom, capped by `USDC_TOPUP_MAX_HBAR`), approves, funds.
- **Buyer agent**: before paying, if the vault is short, swaps HBAR from the agent wallet with **the vault as the swap recipient**. `USDC_AUTO_TOPUP=0` turns this off.

The swap is SaucerSwap's documented `multicall(exactInput(WHBAR -> USDC, fee 3000), refundETH)`, built by `buildHbarToUsdcSwap` in `packages/shared/src/settlement.ts` (byte-identical to the swap library's encoding; unit tested).

## Verified

- 68 contract tests (USDC mock with Hedera association behaviour): exact amounts, unassociated recipients, reentrancy through token callbacks, invariants, escrow.
- `scripts/deploy-contracts.ts --smoke` on a local anvil chain: deploy + full USDC lifecycle, holder receives exactly the face amount.
- Live, read-only: USDC answers ERC-20 calls at `0x…1549` with 6 decimals; SaucerSwap quotes work (1 HBAR ≈ 2.43 USDC on testnet).

## Not verified yet

- **A real HBAR -> USDC swap on testnet.** A Mirror-node simulation of the router call reverts (`CONTRACT_REVERT_EXECUTED`, no reason), both to an unassociated and to an associated recipient, from a sender with 489 HBAR. Possible causes: the simulator's handling of the WHBAR wrap / HTS transfer, or too little gas (400k). Needs one real swap from a funded wallet (e.g. `bunx tsx --env-file=.env scripts/saucerswap-hbar-to-usdc.ts swap 1`, or the website's swap) before relying on it.
- The new contracts are **not deployed**. `packages/shared/src/addresses.json` still points at the old HBAR contracts, which the new ABIs cannot call. Deploy: `cd contracts && forge build`, then `bunx tsx --env-file=.env scripts/deploy-contracts.ts --smoke` (writes addresses, ABIs and the vault bytecode).
- ENS `limit` / `threshold` records written before this change are tinybar values; they now read as USDC base units. Re-set them after deploying the USDC vault.
