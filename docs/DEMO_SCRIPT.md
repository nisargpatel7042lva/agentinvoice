# Mentor demo script (about 5 minutes)

The backend runs on AWS and the web app on Vercel (see docs/DEPLOY.md for addresses and setup); the steps below also work with everything local. Hedera testnet and Sepolia only. All money is testnet money.

## One-line pitch
A small business gets paid early on an invoice owed by an AI agent. An investor funds it at a discount, the agent repays at maturity under on-chain limits, a World-verified human approves large payments, and the agent's public record lives on ENS.

## Before the demo (10 minutes, do not skip)

1. Start in this order, each in its own terminal, from the repo root with `.env` loaded:
   - Backend: `INVOICE_MARKET_ADDRESS=0xb41048c7369d33d4e396ccb2e95e974b95a06d8b DEMO_VAULT_ADDRESS=0xbc792de2be972434a996f222da426b590e858056 INDEXER_START_BLOCK=42738625 DB_PATH=agentinvoice-demo.db SUPPLIER_PRIVATE_KEY=$DEPLOYER_PRIVATE_KEY bun run dev:backend`
   - Paid API (x402): `PAY_TO=0.0.11326618 bunx tsx services/paid-api/src/server.ts`
   - Buyer agent: `BUYER_AGENT_PRIVATE_KEY=$DEPLOYER_PRIVATE_KEY BUYER_VAULT_ADDRESS=0xbc79…8056 MARKET_ADDRESS=0xb410…6d8b BACKEND_URL=http://localhost:3001 BUYER_AGENT_POLL_INTERVAL_MS=10000 bunx tsx agents/buyer-agent/src/index.ts`
   - Web: `bun run dev` (needs `apps/web/.env.local` with `NEXT_PUBLIC_BACKEND_URL=http://localhost:3001` and `NEXT_PUBLIC_BUYER_ENS_NAME=buyer.agentinvoicenf71.eth`)
   - World ID only: `ngrok http 3001`, then put the new HTTPS URL in `WORLD_REDIRECT_URI` and in the World portal (free ngrok URLs change on restart).
   - Bond (Tokenize): add `ATS_BOND_ADDRESS=0x…` to the backend environment once the ATS bond exists.
2. Check: `curl localhost:3001/health` shows `ok: true` and the indexer lag under 60 s.
3. Wallets: MetaMask on Hedera testnet (chain 296) with an investor account holding at least 15 HBAR, and a second account for the supplier profile demo. The vault needs about 50 HBAR (check the Agent page).
4. Pre-create one invoice a few minutes ahead so you never wait on a cold start. Keep every demo invoice **under 50 HBAR** (the approval threshold), except in the World ID step.
5. Use a due date in the next few days for the live invoice, or the buyer agent says "not due yet" and skips it.

## The story, step by step

**1. The problem (30 s)** Landing page, then **/market** (the app). Say: "A freelancer sells to an AI agent and waits 30 to 90 days. We let them sell the invoice today." Point at the three role cards.

**2. Supplier: identity and invoice (60 s)**
- Connect wallet (Connect wallet shows every installed wallet). Open **Profile**, type a name, sign, and the name appears as `<name>.agentinvoicenf71.eth` on Sepolia (about 25 s). Say: "Free, one per wallet, we pay the gas, the signature proves the wallet is theirs."
- **Supplier** page: type `buyer.agentinvoicenf71.eth`. The form checks ENS live and shows the vault address, status and daily limit. Create the invoice. It is Pending.

**3. Buyer agent accepts (20 s)** Within about 10 s the agent accepts it after checking the vault limits. The invoice becomes Open. Say: "The agent can only act inside limits the sponsor set on-chain."

**4. Investor funds, with proof (60 s)**
- Switch to the investor wallet. Open the invoice, read the buyer's record, click **Fund**, confirm in MetaMask. Status: Funded.
- Show the **Proof of ownership** card: the holder, the bond units and, once the issuer has run (about 20 s), the Hedera bond token link. Say: "The contract pays whoever the holder is. The token is the portable receipt of that right."

**5. Repayment (40 s)** The agent pays at the due date from its vault (or use the agent's wallet and click Pay). Status: Paid. As the investor, click **Claim** and show the HBAR arriving on HashScan. The bond units are redeemed.

**6. The agent's public record (40 s)** **Agent** page and `sepolia.app.ens.domains/buyer.agentinvoicenf71.eth`: limit and threshold (set by the sponsor), paid and late counts and status (written by the backend publisher, which cannot touch the limits). Say: "A new supplier can read this before they trust the agent."

**7. Human in the loop (60 s, needs World ID configured)** Use an invoice **above 50 HBAR** (the vault threshold), due now. Open it: the page shows "Human approval needed". Click **Approve with World ID** and sign in at auth.world.org with an Orb-verified account (fresh verification, valid 10 minutes, one payment). The page then says Approved. Within about 10 s the buyer agent fetches the signed approval and pays; the vault contract refuses a payment above the threshold without it. Say: "Without the human, the contract itself says no, not just our software." If `WORLD_ALLOWED_SUBJECT_HASHES` is set, only the sponsor's own World identity is accepted; anyone else is rejected.

**8. Pay-per-use data (optional, 30 s)** The investor agent buys the buyer's credit score over x402 from the paid API for a tiny HBAR fee, then decides whether to fund.

## What is real and what is not (say this out loud)

Real, live on testnet:
- Invoice market and buyer vault on Hedera testnet, with on-chain limits.
- Indexer, backend API, buyer agent, investor wallet flow, claim.
- ENS: live reads in the create form, agent page, the agent's published record, and seller name minting on Sepolia.
- World ID step-up login validated with a real Orb account, and the signed approval for payments above the threshold (backend signs after World, the agent attaches it, the vault verifies it).
- Tokenize: ATS bond units issued per funded invoice, redeemed at repayment, holder frozen on default. Only live once the bond is created and `ATS_BOND_ADDRESS` is set.

Not done, do not claim:
- AgentKit registration; HCS audit topic; public hosting (this is local).
- The bond is a trusted mirror made by our issuer wallet, not the source of payment. Token transfers are not restricted yet, so moving a token does not move the right to be paid.

## If something goes wrong
- **Create form says ENS not reachable:** the public Sepolia RPC is flaky. Wait 10 s and retype, or paste the vault address `0xbc792de2be972434a996f222da426b590e858056`.
- **Funded invoice does not show:** wait for the indexer (5 s poll). If it stays empty, check `/health`.
- **Claim fails with INSUFFICIENT_GAS:** already fixed in the web app (2x gas); hard refresh if you see it.
- **MetaMask error 4100:** disconnect the site in MetaMask and reconnect.
- **Agent skips the invoice:** it was not due yet or is above the threshold. Create a short-due one under 50 HBAR.
- **ENS record says `defaulted`:** an old indexed invoice defaulted. Restart the backend on a fresh `DB_PATH` with `INDEXER_START_BLOCK` set near the chain head.
