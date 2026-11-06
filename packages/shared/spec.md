# AgentInvoice shared spec — v2 (FROZEN)

`SPEC_VERSION = 2` (exported from `@agentinvoice/shared`). Breaking changes need a v3 and a team heads-up.
Chain: Hedera testnet, chain id 296. Amounts are integer base units (`uint256` on-chain, decimal strings in JSON).

## 1. InvoiceMarket (contracts, owner: Mann)

```solidity
enum Status { Pending, Open, Funded, Paid, Late, Defaulted }

struct Invoice {
    uint256 id;
    address supplier;      // creates the invoice
    address buyerVault;    // BuyerVault that owes the invoice
    uint256 faceAmount;    // paid by the buyer at maturity
    uint256 price;         // paid by the funder now
    uint64  dueDate;       // unix seconds
    Status  status;
    address bond;          // bond token for this invoice (see routes)
    address holder;        // set at funding; receives repayment
    bytes32 evidenceHash;  // keccak256 of the off-chain evidence bundle
}

interface IInvoiceMarket {
    function createInvoice(address buyerVault, uint256 faceAmount, uint256 price, uint64 dueDate, bytes32 evidenceHash) external returns (uint256 id); // -> Pending
    function acceptInvoice(uint256 id) external;  // only invoice.buyerVault; Pending -> Open
    function fund(uint256 id) external;           // Open -> Funded; sets holder = msg.sender; emits InvoiceFunded (bond issued off-chain, route T1b)
    function markPaid(uint256 id) external;       // only invoice.buyerVault; Funded/Late -> Paid
    function markLate(uint256 id) external;       // after dueDate; Funded -> Late
    function markDefaulted(uint256 id) external;  // Late -> Defaulted
    function getInvoice(uint256 id) external view returns (Invoice memory);
}

event InvoiceFunded(uint256 indexed id, address indexed holder, uint256 faceAmount);

// Implemented by the backend issuer service under T1b (not called on-chain); on-chain only under T2.
interface IBondIssuer {
    function issue(address holder, uint256 units) external;
}
```

### Bond routes (decided by Mann's ATS spike, see `docs/notes/ats.md`)

- **T1a** (rejected): `InvoiceMarket` calls the ATS Diamond facets on-chain. Too complex and gas-heavy on Hedera EVM.
- **T1b** (CHOSEN): `fund` records `holder = msg.sender` and emits `InvoiceFunded`. The backend issuer wallet (holding the ATS issuer role) then issues bond units to the holder with `@hashgraph/asset-tokenization-sdk` (`issue(tokenHolder, value, data)`; the holder must be on the KYC list). At maturity, `redeem(value, data)` burns the units. This trusted off-chain step is disclosed in the submission.
- **T2** (fallback): Stablecoin Studio (custodial mint, KYC, freeze), used only if the ATS testnet fails.

**Chosen route:** T1b, with T2 as the fallback. Repayment always goes to the stored `holder`, so moving bond units after funding never changes who gets paid; ATS freeze can also lock transfers.

Naming check for Mann: `ats.md` says `InvoiceMarket.buy()` and `InvoiceMarket.payInvoice()`, while this spec has `fund()` and `BuyerVault.payInvoice()`. The spec names stand unless Mann asks for a v3.

## 2. BuyerVault (contracts, owner: Mann)

```solidity
interface IBuyerVault {
    function allowSupplier(address supplier, uint256 limit) external; // owner/sponsor only
    function removeSupplier(address supplier) external;              // owner/sponsor only
    function accept(address market, uint256 id) external;            // calls market.acceptInvoice(id); checks supplier allowed and within limit
    function payInvoice(address market, uint256 id) external;        // requires the invoice to be accepted (not Pending); enforces dailyLimit and approvalThreshold

    function allowedSupplier(address supplier) external view returns (bool);
    function supplierLimit(address supplier) external view returns (uint256);
    function dailyLimit() external view returns (uint256);
    function approvalThreshold() external view returns (uint256); // payments above this need a World ID approval
    function spentToday() external view returns (uint256);
}
```

## 3. Backend API

All responses are JSON and validated by the zod schemas in `packages/shared/src/schemas.ts`.

| Method | Path | Response |
| --- | --- | --- |
| GET | `/api/invoices` | `Invoice[]` |
| GET | `/api/invoices/:id` | `Invoice` |
| POST | `/api/invoices` | `Invoice` (body: supplier fields + `description`, `evidenceHash`) |
| GET | `/api/audit` | `AuditEvent[]` (HCS events, newest first) |
| POST | `/api/approvals` | `ApprovalStart` (`{ approvalId, authorizationUrl }`) |
| GET | `/api/world/callback` | World ID redirect target; finishes the approval, then redirects to the app |
| GET | `/api/approvals/:id` | `Approval` |

Invoices in the API carry `description` (string) and `evidenceHash` (0x + 64 hex).

## 4. ENS records (agent name → record)

| Record | Set by | Value |
| --- | --- | --- |
| `addr` | sponsor | BuyerVault address |
| text `limit` | sponsor | daily limit, base units |
| text `threshold` | sponsor | approval threshold, base units |
| text `paid` | publisher | count of invoices paid |
| text `late` | publisher | count of invoices late |
| text `status` | publisher | `active` \| `paused` \| `defaulted` |
| `expiresAt` | registry | read from the name registry (not a text record) |

`readAgentFromEns(name): Promise<EnsAgent>` lives in `@agentinvoice/shared` (signature now, implementation later).

## 5. Shared types (see `src/types.ts`)

`Status`, `Invoice`, `Agent`, `EnsAgent`, `Approval`, `ApprovalStart`, `Score`, `AuditEvent`, `ReviewResult { action, reason }`, `PayPolicy { dailyBudget, perCallCap, allowedPayTo, allowedHosts }`.

## 6. Mock layer

`src/fixtures.ts` exports one invoice per status (Pending through Defaulted), plus sample audit events, an approval, an ENS agent and a pay policy. Every fixture is validated against its schema in tests.
