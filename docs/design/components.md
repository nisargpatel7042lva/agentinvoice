# Components

Code: `apps/web/src/components/`. Types come from `@agentinvoice/shared`. Every component is shown on `/_components`. Copy comes only from `copy.ts`.

| Component | Props | Notes |
| --- | --- | --- |
| `StatusBadge` | `status: Status` | Text label plus a status colour (tokens.md). `title` = `invoice.status_help[status]`. Not clickable. |
| `ScoreBadge` | `band: ScoreBand; value?: number` | `ScoreBand = "A" \| "B" \| "C" \| "New"`. Shows "A · 82". `title` = `score.help[band]`. |
| `InvoiceCard` | `invoice: Invoice; buyerName?: string; sponsorName?: string; band?: ScoreBand; href?: string` | Mobile row for the marketplace: face, price, discount, due date, StatusBadge, ScoreBadge. The whole card is a link when `href` is set. |
| `PolicyPanel` | `policy: PayPolicy; dailyLimit: Amount; threshold: Amount; spentToday: Amount; allowedSuppliers: number` | A read-only card. Amounts are formatted with `formatAmount`. |
| `EnsPanel` | `state: EnsState; vaultOnChain?: Address` | `EnsState = { kind: "present"; agent: EnsAgent } \| { kind: "missing" } \| { kind: "expired"; agent: EnsAgent } \| { kind: "revoked"; agent?: EnsAgent } \| { kind: "unreachable" }`. Each record is labelled with who sets it, using `ENS_ROLES` from shared, not hand-typed text. |
| `ApprovalCard` | `approval: Approval; agentName: string; amount: Amount; threshold: Amount; onApprove?: () => void; onReject?: () => void` | Buttons are hidden unless the state is `pending`. |
| `TxLink` | `hash?: Hash32; address?: Address; label?: string` | A HashScan testnet link with the value shortened to `0x12…ab`. Opens in a new tab. |
| `EmptyState` | `message: string; action?: { label: string; href: string }` | A centred, muted message with an optional link button. |
| `Toast` | `kind: "pending" \| "success" \| "error"; message: string; txHash?: Hash32` | A fixed bottom-right card with `shadow-raised`. A success toast with `txHash` shows a TxLink. |

## Helpers (in `apps/web/src/lib/format.ts`)
- `formatAmount(amount, decimals = 8)`: base units to a "1,000.5 HBAR" string, using tabular numbers.
- `shortHex(value)`: `0x1234…abcd`.
- `discountPct(invoice)`: `(face - price) / face` as a "5.0%" string.
