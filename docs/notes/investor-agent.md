# Investor agent notes (2026-11-06)

**Missing inputs:** `docs/notes/x402-hedera.md` and the `payAndGet(url)` helper don't exist on any branch yet (they're Mann's). The agent takes `payAndGet` as an injected dependency, and `main.ts` refuses to start until `@invoiceagent/shared` exports it. We write no payment code ourselves.

- **Code:** `agents/investor-agent/src`.
  - `decide.ts`: pure rules.
  - `score.ts`: paid score reader with a 60 s cache per vault. Failed payments are not cached.
  - `agent.ts`: loop with one buy per pass, a retry cap of 3, a stop flag and `DRY_RUN`.
  - `main.ts`: viem wiring.
- **Score URL:** `${SCORE_API_URL}/score/<vault>` (assumed; confirm with Mann's paid API). The response is validated by `ScoreResultSchema`.
- **Buy:** calls `InvoiceMarket.fund(id)` (the spec v2 name; Mann's notes say `buy`) with `msg.value = price × 10^10` weibar, since the Hedera relay takes weibar and the spec stores tinybar.
- **Rules (env, HBAR decimals):** `MIN_BAND` (default B; New ranks below C), `MIN_DISCOUNT_BPS` (default 100), `MAX_PRICE` (default 100), `MAX_OPEN_EXPOSURE` per vault (default 500).
- **Log line format:** `invoice=<id> band=<band> discount=<bps>bps <bought|skipped|dry-run would buy|buy failed> reason="..."`.
- **Exposure** is tracked in memory, so it resets on restart.
