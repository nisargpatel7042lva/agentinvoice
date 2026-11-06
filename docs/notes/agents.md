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
- User-supplied settings for both agents: `NEXT_PUBLIC_MOCK`, `NEXT_PUBLIC_BACKEND_URL`, `PORT`, `DB_PATH`, `APP_URL`.
- Zod 4.6.7 exports `flattenError` from `"zod"`. It returns `{ formErrors, fieldErrors }` for a failed parse.
- No environment variable name was given for the loop interval. `runLoop(intervalMs, stop)` takes the interval as an argument. The direct-start default is `defaultIntervalMs` = 5000.
- A direct start listens for `SIGINT`. Ctrl+C sets `stop.stopped`, the wait ends within 50ms, and the loop logs `stopped`.
- Each agent package script is `dev`: `tsx src/index.ts`. Dependencies match the repo: `zod` `^4.6.7` and `tsx` `^4.23.15`. Root config was left unchanged.
