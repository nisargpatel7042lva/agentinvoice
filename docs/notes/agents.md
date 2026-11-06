# Agents notes

## Hedera testnet (`packages/shared`)

- Package name: `@agentinvoice/shared`.
- Public export: `"."` → `./src/index.ts`, which re-exports `./chain.js`.
- Export name: `hederaTestnet`.
- Chain id: `296`.
- Name: `Hedera Testnet`.
- RPC: `https://testnet.hashio.io/api`.
- Explorer: `https://hashscan.io/testnet`.
- Native currency: HBAR, symbol `HBAR`, 18 decimals.
- Type: `Chain` is `typeof hederaTestnet`.
- Shared already depends on `zod` `^4.6.7`.
- Root workspaces include `agents/*`. The `agents/` folder does not exist yet.
- Root scripts use Bun: `bun run verify` runs typecheck, lint, vitest, forge, then `e2e:local`.
- Root devDependencies include `vitest` `^5.1.0` and `tsx` `^4.23.15`.
- `.env.example` says the exact variable list still comes from the plan. Names listed today: `HEDERA_TESTNET_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `ENS_PUBLISHER_KEY`, `ENS_PUBLISHER_ADDRESS`, `SEPOLIA_RPC_URL`.
- Buyer agent settings: `BACKEND_URL` (required), `BUYER_AGENT_POLL_INTERVAL_MS` (default 15000), `BUYER_AGENT_PRIVATE_KEY` (required unless `DRY_RUN=1`), `BUYER_VAULT_ADDRESS` (default `addresses.json` `buyerVault`), `MARKET_ADDRESS` (default `addresses.json` `invoiceMarket`), `HEDERA_TESTNET_RPC_URL` (default `hederaTestnet.rpcUrl`), `DRY_RUN`.
- `addresses.json` is not exported by `@agentinvoice/shared`. Import it from `packages/shared/src/addresses.json`. `hederaTestnet` is exported.
- BuyerVault compares `faceAmount` in tinybar. Accept requires an allowed supplier, `faceAmount <= supplierLimit`, and `dueDate` still in the future. Pay uses `faceAmount`. Above `approvalThreshold` needs a sponsor approval. The market pays Funded or Late invoices, but this agent pays only Funded invoices whose `dueDate` has arrived.
- No sponsor EIP-712 endpoint is exported. The buyer loop always passes `sponsorApprovalAvailable: false` and calls `payInvoice(market, id, 0x)` only when the face amount is within the threshold. `BuyerVault.payInvoice` is nonpayable, so the agent does not send `tinybarToWeibar` as value.
- Zod 4.6.7 exports `flattenError` from `"zod"`. It returns `{ formErrors, fieldErrors }` for a failed parse.
- No environment variable name was given for the loop interval. `runLoop(intervalMs, stop)` takes the interval as an argument. The direct-start default is `defaultIntervalMs` = 5000.
- A direct start listens for `SIGINT`. Ctrl+C sets `stop.stopped`, the wait ends within 50ms, and the loop logs `stopped`.
- Each agent package script is `dev`: `tsx src/index.ts`. Dependencies match the repo: `zod` `^4.6.7` and `tsx` `^4.23.15`. Root config was left unchanged.
