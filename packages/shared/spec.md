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
    function fund(uint256 id) external;           // Open -> Funded; sets holder = msg.sender; IBondIssuer.issue(holder, units)
    function markPaid(uint256 id) external;       // only invoice.buyerVault; Funded/Late -> Paid
    function markLate(uint256 id) external;       // after dueDate; Funded -> Late
    function markDefaulted(uint256 id) external;  // Late -> Defaulted
    function getInvoice(uint256 id) external view returns (Invoice memory);
}

interface IBondIssuer {
    function issue(address holder, uint256 units) external;
}
```

### Bond routes (decision pending Mann's ATS spike)

Draft one-line descriptions; Mann confirms or corrects after the spike. `Invoice.bond` and `IBondIssuer` stay the same for every route.

- **T1a**: one ATS (Asset Tokenization Studio) bond token per invoice, issued through the ATS factory.
- **T1b**: one shared ATS bond token; each invoice issues its own units to the holder.
- **T2**: no ATS. A plain token contract implements `IBondIssuer` directly.

**Chosen route:** _pending_.

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
