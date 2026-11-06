# Contracts review, tests and deployment (2026-11-06)

Scope: `contracts/src` (InvoiceMarket, BuyerVault) from Mann's branches as merged to `main`, checked against the ethskills.com guidance
(testing, security, audit and ship skills; read once, the plugin was not installed). The ethskills pages say nothing about Hedera.

## Findings

1. **Units (critical, in Mann's UNMERGED commit `df94448` on `mann-x402-hedera`): do not merge its contract changes.** Hedera's docs state that
   inside a contract `msg.value`, `address.balance` and `call{value}` are in **tinybars** (1 HBAR = 1e8), and "inside a contract, never scale
   `msg.value` by `10**10`" (docs.hedera.com/evm/differences/hbar-decimals.md and native-token-transfers.md). Only the JSON-RPC wire uses 18-decimal
   weibars; the network divides the transaction value by 1e10 before the contract runs, and `eth_getBalance` returns weibars. The contracts on `main`
   already count tinybars and compare `msg.value` directly, which is correct. `df94448` multiplies stored amounts by 1e10 inside the contracts, so
   every `fund` and `payInvoice` would revert on Hedera. The conversion belongs only at the client edge (`tinybarToWeibar` in
   `packages/shared/src/units.ts`). His tests cannot catch this because equality checks pass on any chain. The first live smoke test settles it
   (`fund` only succeeds if `msg.value` equals the tinybar price inside the contract). Not yet run live (no funded deployer).
2. **Missing market allowlist in BuyerVault (fixed).** `accept` and `payInvoice` called any `market` address the agent passed, so a compromised agent
   key could accept an invoice on a fake market contract that reports an allowlisted supplier, and the vault would send real funds to it, up to the
   daily limit every day. Now the owner must `allowMarket(market, true)` first; `accept` and `payInvoice` revert with `MarketNotAllowed` otherwise.
3. **Approval signatures (hardened).** The EIP-712 `LargePayment` check accepted malleable signatures. It now requires v in {27, 28} and s in the
   lower half of the curve order. (Replay was already blocked by the nonce.) The approval path had no tests at all (the helper returned an empty
   string); it is now covered.
4. **No finding** in InvoiceMarket's money handling: checks-effects-interactions, a reentrancy guard on fund, repay and claim, pull payments, and
   exact-value checks all hold up under the fuzz, reentrancy and invariant tests below.
5. **Scripts:** `scripts/lifecycle.ts` hardcoded invoice id 1, never waited for transactions, used 18-decimal amounts as tinybars, never set up the
   vault, and its default path only printed. Rewritten. `Deploy.s.sol` hardcoded the verifier and used `ether` amounts; `scripts/deploy-contracts.ts`
   replaces it as the deployment path.

## Tests added (16 -> 56 forge tests)

- `BuyerVaultApproval.t.sol` (16): valid approval; threshold boundary; wrong signer; expiry boundary; nonce replay; approval bound to invoice and
  amount; the daily limit is never lifted by an approval; daily accumulation and reset; malleable and malformed signatures; freeze and access
  control; the market allowlist, including a fake market that tries to drain the vault.
- `InvoiceMarketSecurity.t.sol` (19): bad terms; accept rules; exact-value funding (fuzz); repay rules; late and default timing; claim reentrancy;
  a supplier that rejects payment (blocks only its own funding); a supplier that re-enters `fund`; a reverting bond issuer; money conservation (fuzz).
- `InvoiceMarketInvariant.t.sol` (5 invariants, 128 runs x 100 calls, handler-driven): market balance == what holders can claim; repaid ==
  claimed + held; suppliers received exactly the funded prices; only legal status transitions (Paid and Defaulted terminal; note the enum is not
  ordered by progress, Paid = 3 < Late = 4, so this is a transition table); terms and holder consistency.
- Mutation checks: breaking the market check, the high-s check, the expiry check, the repayment credit, and the Defaulted-to-Paid rule each made
  the matching test fail.

## Not done

- **slither / echidna / a fork test:** not installed (the ethskills checklist asks for slither with no high or medium finding). Fork tests are not
  useful here: the contracts integrate no external protocol.
- **Live Hedera:** nothing is deployed. The units behavior, gas costs, and the JSON-RPC relay quirks are unverified until the first deploy.
- **markLate and markDefaulted** are tested locally with time warps and by the default-path lifecycle on a local chain, not on Hedera.
- **Bond issuer / ATS (route T1b):** `IBondIssuer` is a hook only; the backend issuer service that calls the ATS SDK does not exist yet.
- **Ownership:** the deploy script makes the deployer the owner unless `OWNER_ADDRESS` is set. ethskills says production ownership should go to the
  intended multisig or timelock; for a testnet demo the team should decide who owns the vault.

## Deployment runbook (Hedera testnet, chain id 296)

1. `cd contracts && forge test` (56 tests must pass), then `forge build`.
2. A funded deployer: an ECDSA key in `.env` as `DEPLOYER_PRIVATE_KEY`, funded with testnet HBAR from the Hedera portal faucet
   (portal.hedera.com, needs a login; fund the key's EVM address). 10 HBAR or more is plenty.
3. `VERIFIER_ADDRESS` (defaults to `SPONSOR_ADDRESS`): the address whose signatures approve large payments. The backend must sign `LargePayment`
   with the matching key. Optional: `OWNER_ADDRESS`, `AGENT_ADDRESS`, `GRACE_PERIOD_SECONDS` (use 60 for a demo that shows a default),
   `DAILY_LIMIT_HBAR` (500), `APPROVAL_THRESHOLD_HBAR` (50).
4. `bunx tsx --env-file=.env scripts/deploy-contracts.ts --smoke`: deploys, reads every value back, allows the market in the vault, writes
   `packages/shared/src/addresses.json` and the ABIs, then runs a real lifecycle with tiny amounts. The smoke test is the post-deploy test
   transaction and the live proof of the units.
5. `bunx tsx --env-file=.env scripts/lifecycle.ts` (and `--default`) for the demo runs.
6. Verify the source on Sourcify (the script prints the command), then point the backend at the new addresses: `INVOICE_MARKET_ADDRESS`.
7. Local dry run of all of this: `DEPLOY_TARGET=local HEDERA_RPC_URL=http://127.0.0.1:8545 ... deploy-contracts.ts --smoke` against anvil with
   `--chain-id 296`. It checks the script and the lifecycle logic only, not Hedera's unit behavior.
