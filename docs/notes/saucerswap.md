# SaucerSwap HBAR → USDC (Phase 2 library)

Library-only helpers under `@invoiceagent/shared/saucerswap`. **No HTTP routes. No agent wiring.** Testnet only; mainnet is rejected.

Target token: SaucerSwap-listed testnet USDC `0.0.5449` (not Circle `0.0.429274`). Method: V2 QuoterV2 + SwapRouter multicall (SaucerSwap developer docs; Phase 1 testnet validation).

## Import

```ts
import {
  loadSaucerSwapConfig,
  quoteHbarToUsdc,
  executeHbarToUsdc,
  USDC_TOKEN_ID,
} from "@invoiceagent/shared/saucerswap";
```

Do **not** import this from the main `@invoiceagent/shared` entry (same rule as `payAndGet`) so the web app does not bundle `@hashgraph/sdk`.

## Configure

Copy names from `.env.example` (SaucerSwap section). Use a **dedicated** operator:

- `SAUCERSWAP_OPERATOR_ACCOUNT_ID`
- `SAUCERSWAP_OPERATOR_PRIVATE_KEY`

Optional policy / endpoint overrides: `SAUCERSWAP_MAX_SWAP_HBAR`, `SAUCERSWAP_MAX_SLIPPAGE_BPS`, `SAUCERSWAP_MIN_USDC_OUT`, `SAUCERSWAP_GAS_RESERVE_HBAR`, `SAUCERSWAP_MIRROR_NODE_URL`, etc.

`DRY_RUN=1` or `SAUCERSWAP_DRY_RUN=1` ⇒ execute prepares calldata and **never** broadcasts.

```ts
const config = loadSaucerSwapConfig(); // reads process.env
// or
import { createSaucerSwapConfig } from "@invoiceagent/shared/saucerswap";
const config = createSaucerSwapConfig({ dryRun: true, operatorAccountId: "0.0.x" });
```

## Quote

```ts
const quoted = await quoteHbarToUsdc(
  { amountInTinybar: 100_000_000n, slippageBps: 100 }, // 1 HBAR, 1% slippage
  config,
);
if (!quoted.ok) throw new Error(`${quoted.code}: ${quoted.reason}`);
// quoted.quote.amountOut / amountOutMinimum (USDC 6 decimals)
```

Quotes call Mirror Node `POST /api/v1/contracts/call` on QuoterV2 `0.0.1390002` (path WHBAR `0.0.15058` → fee `3000` → USDC `0.0.5449`).

## Dry-run execute

```ts
const result = await executeHbarToUsdc({ quote: quoted.quote }, { ...config, dryRun: true });
// result.ok && result.dryRun → prepared multicall bytes, no broadcast
```

Live execute (only when `dryRun` is false and operator key is set) broadcasts via `@hashgraph/sdk` to SwapRouter `0.0.1414040`, waits for Mirror confirmation, and verifies USDC balance increased by at least `amountOutMinimum`. Uncertain broadcasts are **not** retried.

## Safety

- Valid, non-stale quote required
- Max swap HBAR, max slippage bps, min USDC out, gas reserve
- USDC association preflight
- No private keys in logs
- No blind retry after uncertain broadcast
- Mainnet rejected

## Phase 3 (not done)

HTTP quote/execute routes, agent integration, and any funded live swap are out of scope for Phase 2.
