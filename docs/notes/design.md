# Design notes (cached 2026-11-06)

## Tailwind v4 (tailwindcss.com/docs/theme)
- Tailwind v4 is configured in CSS, not in `tailwind.config.js`. Start with `@import "tailwindcss";`, then define tokens in an `@theme { ... }` block.
- Namespaces and the utilities they create: `--color-*` (bg/text/border), `--font-*` (font-*), `--text-*` plus `--text-*--line-height` (text-*), `--spacing` (base unit for p/m/gap/w/h), `--radius-*` (rounded-*), `--shadow-*` (shadow-*).
- `--color-*: initial;` removes the default palette, so only our colours exist.
- `@theme inline` makes utilities use a referenced variable directly, e.g. `--font-sans: var(--font-inter)` from next/font.
- Next.js setup: the `tailwindcss`, `@tailwindcss/postcss` and `postcss` packages; `postcss.config.mjs` with `{ plugins: { "@tailwindcss/postcss": {} } }`; and `@import "tailwindcss"` in globals.css.
- `dark:` follows `prefers-color-scheme` by default; we don't use it (see tokens.md).

## Status badge and table reference: GOV.UK Design System "Tag" component
- Tags show status only and are never links or buttons.
- Use adjectives ("Funded", "Late"), not verbs.
- Never rely on colour alone: the text carries the meaning.
- Keep each status's colour the same everywhere.
- In tables, the tag sits in its own Status column next to the row label. Grey is for inactive or neutral states.

## Finvoice (what we must look different from)
- Private invoice factoring: TEE AI credit score, A–D risk grade, debtor approves by email link, attestation and receipt NFTs, Flare + Hedera HCS.
- Tone: technical and promotional ("privacy", "zero-backend"), with puzzle imagery.
- **We differ by:** a plain finance look (no themed imagery, no NFT language), the sponsor always named as the accountable party, ENS names instead of anonymity, and money location shown on every screen.
- We use score bands A/B/C/New, never A–D grades, and say "score", not "grade".
