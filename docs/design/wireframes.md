# Wireframes

All copy comes from `copy.md` (keys shown as `{key}`). Every screen has the testnet banner and the top nav:
`[Invoice Agent]  Marketplace · Create invoice · (Connect wallet)`

Rule on every screen: show **who is accountable** (the sponsor's ENS name) and **where the money is** (the contract or vault address as a TxLink).

## 1. Marketplace `/`
```
{market.title}                                   [Status filter: All ▾]
{market.subtitle}
┌───────────────────────────────────────────────────────────────────┐
│ Invoice  Buyer (ENS)        Sponsor    Face     Price   Due   Score  Status │
│ #3       acme-buyer.eth     alice.eth  1,000    950     12 Nov  [A]  [Open] │
│ ...                                                                         │
└───────────────────────────────────────────────────────────────────┘
Money: funds sit in InvoiceMarket 0x12…ab ↗
```
- Row click → `/invoice/[id]`.
- Status filter → filters the list client-side; "All" by default.
- Empty → EmptyState `{empty.market}`.
- Mobile: rows become InvoiceCards stacked vertically.

## 2. Invoice detail `/invoice/[id]`
```
← {nav.back_market}
Invoice #3  [Open]                      {invoice.status_help.Open}
┌ Amounts ─────────────┐  ┌ Parties ─────────────────────────┐
│ Face  1,000 HBAR     │  │ Supplier  0x11…11 ↗              │
│ Price   950 HBAR     │  │ Buyer     acme-buyer.eth  [A]    │
│ Discount 5.0%        │  │ Sponsor   alice.eth (accountable)│
│ Due   12 Nov 2026    │  │ Holder    — (set when funded)    │
└──────────────────────┘  └──────────────────────────────────┘
Description …   Evidence hash 0x00…01 [copy]
Where the money is: InvoiceMarket 0x12…ab ↗   Bond 0x44…44 ↗ (once funded)
[{invoice.fund}]   ← only when Open and wallet connected
History (AuditEvents, newest first)
```
- **Fund invoice** → wallet confirm with the exact price → Toast "pending" → Toast "success" with TxLink → status becomes Funded.
- No wallet → the button reads `{wallet.connect_to_fund}` and opens the wallet modal.
- Buyer name → `/agent/[vault]`.

## 3. Supplier: create invoice `/supplier`
```
{supplier.title}
Buyer ENS name  [ acme-buyer.eth        ]  → resolves live
  ✓ Vault 0x22…22 ↗  · Status: active · Limit 5,000 · You are allowed (limit 2,000)
Face amount     [ 1000 ] HBAR
Price           [  950 ] HBAR   (discount 5.0%)
Due date        [ 2026-11-12 ]
Description     [ ............ ]
Evidence file   [Choose file]  → hash 0x…  (file stays with you)
[{supplier.submit}]
```
- The name resolves on blur and on a 400ms debounce. Not found → `{error.ens_not_found}`. The buyer paused or defaulted → submit is disabled, showing `{supplier.buyer_not_active}`.
- **Create invoice** → createInvoice tx → the status starts as Pending → Toast with `{supplier.created}` → go to `/invoice/[id]`.

## 4. Agent profile `/agent/[vault]`
```
acme-buyer.eth  [A] 82            Sponsor: alice.eth (accountable)
Vault 0x22…22 ↗   Spent today 1,200 / 5,000
┌ PolicyPanel ───────────────┐  ┌ EnsPanel (live) ───────────────────┐
│ Daily limit     5,000      │  │ addr       0x22…22 ✓ matches vault │
│ Approval above  1,000      │  │ limit      5,000   (sponsor sets)  │
│ Allowed suppliers 3        │  │ threshold  1,000   (sponsor sets)  │
│ Pay policy: hosts, caps    │  │ paid 4 · late 1    (publisher sets)│
└────────────────────────────┘  │ status active      (publisher sets)│
                                 │ expires 12 Nov 2027 (registry)    │
                                 └────────────────────────────────────┘
History: invoices for this buyer (StatusBadge, amount, due)
```
- ENS unreachable → EnsPanel shows `{ens.unreachable}`, never cached or made-up values.
- Expired or revoked name → a red banner `{ens.expired}` / `{ens.revoked}`, and the score shows as "New".

## 5. Sponsor approval `/approval/[id]`
```
{approval.title}
ApprovalCard:
  acme-buyer.eth wants to pay invoice #3: 1,200 HBAR
  This is above your approval threshold of 1,000.
  Spent today 1,200 / 5,000 · Supplier 0x11…11 (allowed)
  [{approval.approve}]  [{approval.reject}]
  {approval.world_help}
```
- **Approve with World ID** → POST /api/approvals → redirect to `authorizationUrl` → back via /api/world/callback → state Approved → Toast.
- **Reject** → confirm dialog → state Rejected.
- Expired → the card shows `{approval.expired}` and the buttons are hidden.
