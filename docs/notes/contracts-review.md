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

## Deployed and verified on Hedera testnet (chain 296, 2026-11-06)

- InvoiceMarket `0xb41048c7369d33d4e396ccb2e95e974b95a06d8b` (grace period 60 s, for a demo that shows a default; it is immutable) and
  BuyerVault `0xbc792de2be972434a996f222da426b590e858056`, owner and agent = the deployer account 0.0.11326618, verifier = the sponsor
  address. Addresses are in `packages/shared/src/addresses.json`. Source verification on Sourcify has NOT been done.
- **Units confirmed live:** `fund` succeeded with a value of 1,900 tinybar sent as 1,900e10 weibar, and the vault's repayment worked, so
  `msg.value` inside the contract is tinybars. Mann's 1e10 scaling (`df94448`) must not be merged.
- **Gas (new finding):** viem's gas estimate for `claim()` was 39,237 and the transaction died with `INSUFFICIENT_GAS`: Hedera's estimate misses the
  cost of sending HBAR out of a contract. Every script and service that sends a transaction to these contracts now uses twice the estimate, at
  least 100,000 (`deploy-contracts.ts`, `lifecycle.ts`, `lifecycle-approval.ts`, and the backend issuer). **Rishita's agents and anything else that
  calls `claim`, `fund` or `payInvoice` with viem's default estimate needs the same margin.**
- **Time (new finding):** the contract compares `block.timestamp`, which trails the local clock by seconds on Hedera. `markLate` reverted when the
  script waited on `Date.now()`; it now waits on the latest block's timestamp.
- Happy path (create, accept, fund, repay, claim), default path (real `markLate` then `markDefaulted`) and the large-payment approval
  all ran on testnet: a 60 HBAR repayment was refused without an approval, accepted with the verifier's EIP-712 `LargePayment`, the nonce was
  consumed, and a replay was refused. The backend can sign the same message with the same format (`signTypedData`, domain
  `BuyerVault` v1, chain 296, verifying contract = the vault); that signing is not built into the backend yet.
- The real backend (indexer, `GET /api/invoices`, `POST /api/invoices` through the issuer) ran against these contracts on the real Hashio RPC:
  all six invoices came back with the right status and holder, and the backend created invoice #7 on-chain.
- Left on-chain by the test runs: invoices #2 (Pending), #4 (Funded, abandoned after a script bug), and the rest in their end states.

## Not done

- **slither / echidna / a fork test:** not installed (the ethskills checklist asks for slither with no high or medium finding). Fork tests are not
  useful here: the contracts integrate no external protocol.
- **Hashio rate limits and getLogs range:** the indexer read 2,500 blocks in chunks of 1,000 without error; the real limit is still unknown.
- **Bond issuer / ATS (route T1b):** `IBondIssuer` is a hook only; the backend issuer service that calls the ATS SDK does not exist yet.
- **Ownership:** the deploy script makes the deployer the owner unless `OWNER_ADDRESS` is set. ethskills says production ownership should go to the
  intended multisig or timelock; for a testnet demo the team should decide who owns the vault.

## Deployment runbook (Hedera testnet, chain id 296)

1. `cd contracts && forge test` (56 tests must pass), then `forge build`.
2. A funded deployer: an ECDSA key (the raw 64-hex key, not ED25519) in `.env` as `DEPLOYER_PRIVATE_KEY`, funded with testnet HBAR from the Hedera
   portal faucet (portal.hedera.com, needs a login). 10 HBAR or more is plenty. A key pasted into chat is exposed: use testnet-only keys.
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
