# Run your own agent

By default the platform's agent pays from a buyer's vault and the investor funds by hand. You can run either agent yourself with your own wallet and rules. Testnet only. Never share a private key; keep it in your own `.env`.

## Buyer agent (you owe suppliers)

The agent wallet signs `accept` and `pay` on your vault, so it must be the vault's `agent`.

1. On Profile, choose buyer. In "Agent wallet", put the wallet that will run the agent (not the default), deploy the vault, and register its name.
2. Put HBAR in the vault and allow your sellers (Profile, your vault panel).
3. The agent wallet needs a little HBAR for gas (a few HBAR).
4. Run it from the repo root:
   ```bash
   BACKEND_URL=https://52.63.226.208.sslip.io \
   MARKET_ADDRESS=0xb41048c7369d33d4e396ccb2e95e974b95a06d8b \
   BUYER_VAULT_ADDRESS=<your vault> \
   BUYER_AGENT_PRIVATE_KEY=<the agent wallet key> \
   BUYER_AGENT_POLL_INTERVAL_MS=10000 \
   bunx tsx agents/buyer-agent/src/index.ts
   ```
   Add `DRY_RUN=1` to watch what it would do without sending anything.

The platform's agent skips any vault whose on-chain agent is not its own wallet, so the two never fight over a vault.

What it does: accepts a Pending invoice from an allowed seller if it is within the limits, and pays a Funded one at the due date. Anything above the approval threshold waits for a human.

## Investor agent (you fund invoices)

It funds from its own wallet. No vault is involved.

1. Create a Hedera testnet account (`0.0.x`) with an ECDSA key and fund it with testnet HBAR. The same key signs the funding transaction and the x402 score payments.
2. Run:
   ```bash
   BACKEND_URL=https://52.63.226.208.sslip.io \
   MARKET_ADDRESS=0xb41048c7369d33d4e396ccb2e95e974b95a06d8b \
   INVESTOR_PRIVATE_KEY=<the account's ECDSA key> \
   INVESTOR_ACCOUNT_ID=0.0.<your account> \
   SCORE_API_URL=<the paid score API address> \
   MIN_SCORE=650 MIN_BAND=B MIN_DISCOUNT_BPS=100 \
   MAX_PRICE=1000000000 MAX_OPEN_EXPOSURE=5000000000 \
   bunx tsx agents/investor-agent/src/main.ts
   ```
   Prices are in tinybars (1 HBAR = 100,000,000). Add `DRY_RUN=1` first.

   The paid score API runs on the server on port 4020 and is **not** public yet (Caddy only exposes `/api/*` and `/health`). Until it is exposed, an outside investor agent cannot fetch scores, so run it on the server or ask us to expose a `/score` route.

It reads Open invoices, pays a small x402 fee for the buyer's credit score, and buys at most one invoice per pass that meets your rules. It never spends more than `MAX_OPEN_EXPOSURE` on one buyer.

The variable names are the ones read in `agents/investor-agent/src/main.ts` and `decide.ts`.
