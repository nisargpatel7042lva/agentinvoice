# Investor Agent

Autonomous agent that monitors the invoice market and funds qualifying invoices on Hedera.

## Investment Rules

The agent evaluates open invoices against configurable rules before executing on-chain funding.

| Environment Variable | Type | Default | Description |
|----------------------|------|---------|-------------|
| `MIN_SCORE` | number | `650` | Minimum deterministic credit score (300–900). Invoices from buyers below this score or with no credit history are skipped. |
| `MIN_BAND` | string | `B` | Minimum score band (`A`, `B`, `C`, or `New`). Both `MIN_SCORE` and `MIN_BAND` must pass. |
| `MIN_DISCOUNT_BPS` | number | `100` | Minimum discount in basis points (100 bps = 1%). |
| `MAX_PRICE` | number | `100` | Maximum price per invoice in HBAR. |
| `MAX_OPEN_EXPOSURE` | number | `500` | Maximum open exposure per buyer vault in HBAR. |
| `DRY_RUN` | boolean | `false` | When true, evaluates decisions and logs them without executing on-chain transactions. |
