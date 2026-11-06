# Design tokens

Source of truth in code: `apps/web/src/app/theme.css` (Tailwind v4 `@theme`). Use the token names, never raw hex values in components.

## Principles
Calm, plain and trustworthy, like a bank statement, not a trading app. There is **one accent colour** (teal), used only for primary actions and links. Everything else is neutral grey. Status colours are muted and always paired with a text label.

## Dark mode: NO
We ship light mode only. Finance products read as more trustworthy in light mode, judges watch on projectors, and one theme halves the QA work during a 36-hour build. The tokens are CSS variables, so dark mode can be added later without touching components.

## Colour

| Token | Hex | Use |
| --- | --- | --- |
| `accent` | `#0F766E` | primary buttons, links, focus ring |
| `accent-hover` | `#115E59` | hover on primary |
| `accent-soft` | `#F0FDFA` | selected row, info backgrounds |
| `ink` | `#0F172A` | body text, headings |
| `ink-muted` | `#475569` | secondary text, labels |
| `ink-faint` | `#94A3B8` | placeholders, disabled |
| `line` | `#E2E8F0` | borders, dividers |
| `surface` | `#FFFFFF` | cards |
| `canvas` | `#F8FAFC` | page background |
| `danger` | `#B91C1C` | errors, destructive confirm |

### Status colours (text on soft background; contrast ≥ 4.5:1)

| Status | Text token | Background token | Meaning |
| --- | --- | --- | --- |
| Pending | `status-pending` `#475569` | `status-pending-bg` `#F1F5F9` | waiting for buyer to accept |
| Open | `status-open` `#1D4ED8` | `status-open-bg` `#EFF6FF` | accepted, can be funded |
| Funded | `status-funded` `#0F766E` | `status-funded-bg` `#F0FDFA` | investor paid supplier |
| Paid | `status-paid` `#15803D` | `status-paid-bg` `#F0FDF4` | buyer repaid holder |
| Late | `status-late` `#B45309` | `status-late-bg` `#FFFBEB` | past due date, unpaid |
| Defaulted | `status-defaulted` `#B91C1C` | `status-defaulted-bg` `#FEF2F2` | written off |

### Score bands

| Band | Text | Background | Meaning |
| --- | --- | --- | --- |
| A | `#15803D` | `#F0FDF4` | strong on-time record |
| B | `#1D4ED8` | `#EFF6FF` | acceptable |
| C | `#B45309` | `#FFFBEB` | weak, investor agent skips by default |
| New | `#475569` | `#F1F5F9` | not enough history |

## Type scale (Inter, via next/font; numbers use `tabular-nums`)

| Token | Size / line-height | Use |
| --- | --- | --- |
| `text-xs` | 12 / 16 | badges, table meta |
| `text-sm` | 14 / 20 | body small, table cells |
| `text-base` | 16 / 24 | body |
| `text-lg` | 18 / 28 | card titles |
| `text-xl` | 20 / 28 | section headings |
| `text-2xl` | 24 / 32 | page titles |
| `text-3xl` | 30 / 36 | key amounts on detail pages |

Weights: 400 body, 500 labels and buttons, 600 headings. Amounts are always 600 with tabular figures.

## Spacing
Base unit `--spacing: 0.25rem` (4px). Use 1, 2, 3, 4, 6, 8 and 12 (4–48px). Cards use p-6, page gutters are px-4 on mobile and px-8 on desktop, and the gap between cards is 4.

## Radius
`rounded-sm` 4px (badges), `rounded-md` 6px (inputs, buttons), `rounded-lg` 10px (cards). No pill shapes except StatusBadge.

## Shadows
`shadow-card`: `0 1px 2px rgb(15 23 42 / 0.06), 0 1px 3px rgb(15 23 42 / 0.08)`. `shadow-raised` (toasts, menus only): `0 4px 12px rgb(15 23 42 / 0.12)`. No glows and no gradients.

## Layout
Max content width is 1120px. The top nav is 56px tall. The testnet banner is 32px tall and always visible above the nav.
