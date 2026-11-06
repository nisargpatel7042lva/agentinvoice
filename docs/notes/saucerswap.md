# SaucerSwap HBAR → USDC

Testnet-only helpers for swapping native HBAR into **SaucerSwap-listed testnet USDC `0.0.5449`** via V2 QuoterV2 + SwapRouter.

## Important: which USDC?

| Token | ID | SaucerSwap testnet |
| --- | --- | --- |
| **SaucerSwap-listed USDC (used here)** | `0.0.5449` | Yes — V2 pool fee 3000 |
| Circle official testnet USDC | `0.0.429274` | **No** — not listed; QuoterV2 reverts |

Invoice **market contracts still settle in HBAR**. USDC is an optional treasury asset after a swap. The website marketplace continues to show HBAR for invoice face/price; `/treasury` shows USDC balances and quotes.

## Phase 2 — library

Import from `@invoiceagent/shared/saucerswap` (agents / scripts / backend only — not the web bundle).

Web-safe label: `SAUCERSWAP_TESTNET_USDC` from `@invoiceagent/shared`.

## Phase 3 — integration

1. **Associate** USDC before the first live swap (`ensureUsdcAssociated` / CLI `associate`).
2. **Investor agent** optional treasury pass: `SAUCERSWAP_ENABLE_AGENT_SWAP=1` + operator env; keeps `SAUCERSWAP_KEEP_HBAR`, swaps `SAUCERSWAP_SWAP_HBAR`.
3. **Backend** read-only `GET /api/saucerswap/status` and `GET /api/saucerswap/quote` (never broadcasts).
4. **Website** `/treasury` — USDC identity, caveat, operator balances, live quote.
5. **CLI** `scripts/saucerswap-hbar-to-usdc.ts` — `status` | `quote` | `associate` | `swap`.

### Configure

```bash
# Dedicated operator (do NOT reuse investor/supplier/HCS wallets by default)
SAUCERSWAP_OPERATOR_ACCOUNT_ID=0.0.x
SAUCERSWAP_OPERATOR_PRIVATE_KEY=…

# Safety
DRY_RUN=1                 # or SAUCERSWAP_DRY_RUN=1 — never broadcast
SAUCERSWAP_STATUS=1       # enable backend read-only routes
SAUCERSWAP_ENABLE_AGENT_SWAP=1
SAUCERSWAP_SWAP_HBAR=1
SAUCERSWAP_KEEP_HBAR=10
```

### Quote (library)

```ts
import { loadSaucerSwapConfig, quoteHbarToUsdc } from "@invoiceagent/shared/saucerswap";
const config = loadSaucerSwapConfig();
const quoted = await quoteHbarToUsdc({ amountInTinybar: 100_000_000n }, config);
```

### Associate + dry-run / live swap (CLI)

```bash
bunx tsx --env-file-if-exists=.env scripts/saucerswap-hbar-to-usdc.ts status
bunx tsx --env-file-if-exists=.env scripts/saucerswap-hbar-to-usdc.ts associate
DRY_RUN=1 bunx tsx --env-file-if-exists=.env scripts/saucerswap-hbar-to-usdc.ts swap 1
# Live (funded account, associated USDC, dry-run unset):
bunx tsx --env-file-if-exists=.env scripts/saucerswap-hbar-to-usdc.ts swap 1
```

### Live swap prerequisites

1. Dedicated funded Hedera **testnet** account.
2. Associate token `0.0.5449` to that account.
3. Operator key in env; dry-run off.
4. Accept that `0.0.5449` is **not** Circle `0.0.429274` (no pool for Circle on SaucerSwap testnet today).
