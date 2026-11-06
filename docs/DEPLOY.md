# Deploy and finish guide (Vercel web, AWS backend, ATS bond)

Everything here is testnet. Never commit `.env` or keys. Never paste secrets into chat or tickets.

## Architecture

| Part | Where | Address |
| --- | --- | --- |
| Backend (API, indexer, ENS publisher, name mint, bond issuer), paid x402 API, buyer agent | AWS EC2 (Sydney), systemd services | `https://52.63.226.208.sslip.io` (Caddy gives HTTPS, only `/api/*` and `/health` are public) |
| Web app | Vercel | your `*.vercel.app` address |
| ATS bond | Hedera testnet, created once in the ATS admin app | `ATS_BOND_ADDRESS` |

The web app only talks to the backend from the server side (server actions and server components). Wallet transactions go from the browser straight to the Hedera RPC.

## 1. Backend on AWS (already running)

Services: `ai-backend`, `ai-paid-api`, `ai-buyer-agent` (and `ai-web` until Vercel replaces it). Config is `~/agentinvoice/.env` on the server, mode 600.

Update the server after code is merged to `main`:
```bash
ssh -i ~/.ssh/agentinvoice.pem ubuntu@52.63.226.208 'cd ~/agentinvoice && git fetch -q origin && git reset -q --hard origin/main && bun install && sudo systemctl restart ai-backend ai-paid-api ai-buyer-agent'
```

Add these once to the server `.env` (use `nano`, do not paste secrets in chat):
- `TRUST_PROXY=1` so rate limits apply per visitor behind Caddy.
- `APP_URL=https://<your-vercel-address>` so World approval links open the site people use.
- `ATS_BOND_ADDRESS=0x...` after step 3.
- `WORLD_REDIRECT_URI=https://52.63.226.208.sslip.io/api/world/callback` (already set; must match the World portal exactly, no trailing slash).

Check it:
```bash
curl -s https://52.63.226.208.sslip.io/health
```
Expect `ok: true`, `degraded: false`.

## 2. Web on Vercel

1. vercel.com, Add New, Project, import the GitHub repo `nisargpatel7042lva/agentinvoice`.
2. Root Directory: `apps/web`. Framework: Next.js. Turn on "Include source files outside of the Root Directory" (the shared package lives in `packages/shared`).
3. Environment variables (Production):
   - `NEXT_PUBLIC_BACKEND_URL` = `https://52.63.226.208.sslip.io`
   - `NEXT_PUBLIC_BUYER_ENS_NAME` = `buyer.agentinvoicenf71.eth`
   - `NEXT_PUBLIC_AGENT_ADDRESS` = the buyer agent wallet that pays from vaults (`0xd2B87eFbfd542eA386cBD1724A2E8DAEb31E0fA3`) and `NEXT_PUBLIC_VERIFIER_ADDRESS` = the approval verifier (`0x27a3c43158AC762F57B3aBe459a98e67659738EE`). Public addresses; the Profile page uses them when a buyer deploys their own vault.
   - Do not set `NEXT_PUBLIC_MOCK`.
4. Settings, Functions, region: Sydney (`syd1`), next to the backend.
5. Deploy, open the address, then put it in the server `APP_URL` (step 1).
6. Check `/market`, `/invoice/12`, `/profile`, `/network` load in a few seconds.

If the build fails on the workspace package, set the install command to `bun install` and the build command to `bun run build` in the project settings, with the root directory still `apps/web`.

## 3. Create the ATS bond (once, by hand)

The factory call from our code reverts with empty data and is not solved, so the bond is created in Hedera's admin app.

1. Run the app (outside this repo):
   ```bash
   cd ~/ats/asset-tokenization-studio && npm run ats:web:start
   ```
   Open `http://localhost:4173` in a window where only MetaMask is active. In Brave, enable MetaMask under Allow in Private and use a private window.
2. MetaMask: the **deployer** account (`0xd2B87eFbfd542eA386cBD1724A2E8DAEb31E0fA3`, Hedera `0.0.11326618`) on Hedera Testnet. The ATS app must show `0.0.11326618` at the top. The backend uses this key, so it must create the bond.
3. Create a bond: name `AgentInvoice Receivable Bond`, symbol `AINV`, ISIN `IN000AGINV18`, decimals `8`, controllable on, internal KYC on, regulation Reg S, nominal value `1`, maturity at least a year out, large max supply (for example `1000000000`). Leave "Proceed Recipients" empty. Give every role to the deployer account.
4. Copy the bond's `0x...` address (or the `0.0.x` id, from which the EVM address is shown on HashScan).
5. Put `ATS_BOND_ADDRESS=0x...` in the server `.env`, then `sudo systemctl restart ai-backend`.
6. Fund a small invoice from the website. Within about 20 s the invoice page's Proof of ownership card should link to the bond on HashScan, and the holder should show units. After payment, the units are redeemed.

## 4. Pre-demo checklist

- `/health` ok on the server. The buyer agent log shows polling (`journalctl -u ai-buyer-agent -n 5`).
- The vault holds at least 50 HBAR (agent page). Demo invoices stay under 50 HBAR.
- Use a due date within a few days, or the agent skips the invoice as "not due yet". Early payment by the agent wallet also works.
- MetaMask investor account holds at least 15 HBAR on Hedera Testnet. If the RPC errors, set it to `https://testnet.hashio.io/api`.
- World ID: redirect URL in the portal matches `WORLD_REDIRECT_URI` exactly. Do not complete a real verification unless you intend to.

## 5. Security cleanup after the demo

- The deployer and sponsor keys and the SSH key were exposed in chat. Treat them as burned. Create new accounts and redeploy before reusing anything.
- Regenerate the World client secret in the portal (the current one was pasted in chat).
- Delete the AWS key pair `agentinvoice` and the Elastic IP if you stop the server.

## 6. Known gaps (say them out loud)

- Signed approval for payments above the threshold (issue #31) is not built.
- The bond is a trusted mirror from the platform issuer. Moving the token does not move the right to be paid, because the market contract pays the stored holder. Transfers are not restricted yet.
- Sellers own their ENS name but do not control their own resolver records.
- AgentKit registration and the HCS audit topic are not done.
