# Backend vs Mann's real contracts (2026-11-06)

Checked against `origin/mann-deploy-lifecycle` (InvoiceMarket, BuyerVault, Deploy script), deployed to a local chain with chain id 296. These contracts are on Mann's branches and are NOT on `main` yet; the market and vault were reported as partly unfinished, so re-run this check when they merge.

## Matches the backend (nothing to change on Mann's side)

- `createInvoice(address,uint256,uint256,uint64,bytes32) returns (uint256)`, `getInvoice(uint256)` with the struct order and the Status enum exactly as in the spec and in `services/backend/src/chain/reader.ts`.
- `POST /api/invoices` worked against the real market: real `createInvoice`, supplier = the issuer wallet, stored with its description.
- Lifecycle through the real vault: `accept` (Open), `fund` with `msg.value == price` (Funded, holder = investor), `payInvoice` (Paid), `claim`. The API showed each state within a few seconds.

## Bug found and fixed (backend side, not Mann's)

`claim()` emits `Claimed(address indexed account, uint256 amount)`. The indexer read its first indexed argument as an invoice id and created a bogus invoice with the investor's address as its id. Fixed: the indexer now knows the real event signatures, never treats `Claimed` as an invoice event, and never writes an invoice the chain does not have (all-zero struct). Regression tests added. A full replay of the chain history into a fresh database now gives exactly one invoice and five correctly named events.

## For Mann and Nisarg (their side, not a bug)

- **Approval signature:** `BuyerVault.payInvoice` above `approvalThreshold` needs an approval signed by the vault's `verifier`: EIP-712 domain `{ name: "BuyerVault", version: "1", chainId, verifyingContract: <vault> }`, type `LargePayment(address vault,uint256 invoiceId,uint256 amount,uint256 nonce,uint256 expiry)`, passed as `abi.encode(uint256 nonce, uint256 expiry, bytes signature)`. The backend does not sign this yet: spec v2 has no endpoint that returns it (a buyer agent needs one), and it needs a verifier key. `Deploy.s.sol` sets `verifier = deployer`; for the demo the vault must be deployed with the backend's verifier address.
- **Description storage:** invoice descriptions live only in the backend database. A rebuilt database loses them (only `evidenceHash` is on-chain).
- **Units:** `fund` and `payInvoice` use `msg.value`, so the Hedera tinybar vs 18-decimal trap from the plan applies (not tested here, anvil uses 18 decimals).
- Not tested: `markLate` and `markDefaulted` against the real contract (they need time to pass), and the bond issuer hooks.
