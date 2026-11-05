# Asset Tokenization Studio (ATS) Spike Notes

## Status and Route Decision
- **Status:** In Progress (Spike S1/v2-M1)
- **Initial Route Evaluation:** Target route `T1b` (backend issuer wallet calling ATS SDK on `InvoiceFunded`) or `T1a` if contract can hold issuer role.

## 1. Local Setup Commands (Verified)
- **Repository:** `https://github.com/hashgraph/asset-tokenization-studio.git`
- **NPM Package:** `@hashgraph/asset-tokenization-sdk` (version `8.0.0`)
- **Prerequisites:** Node.js `>= 20`, npm `>= 10`, Hedera testnet account with ECDSA key.

```bash
# Clone and enter repo
git clone https://github.com/hashgraph/asset-tokenization-studio.git
cd asset-tokenization-studio

# Configure environment
cp apps/ats/web/.env.example apps/ats/web/.env

# Monorepo build and setup
npm run ats:setup

# Start the admin web app
npm run ats:web:start
# App serves at http://localhost:4173/
```

## 2. Bond Creation Workflow (Admin App vs. SDK Script)
- **Admin App Route (Works First):**
  - Navigate to Bonds section in ATS Web App (`http://localhost:4173/`).
  - Input parameters: Name (`AgentInvoice Bond`), Symbol (`INV-BOND`), Nominal Value (100 HBAR), Currency (`HBAR`/`USD`), Maturity Date (Unix timestamp).
  - Admin App uses pre-wired factory and resolver contracts on Hedera Testnet, deploying the Diamond proxy contract directly.
- **SDK Script Route:**
  - Uses `@hashgraph/asset-tokenization-sdk` with `Network.TESTNET`, `resolverAddress`, and `factoryAddress`.
  - Operator signs deployment via `@hashgraph/sdk` ECDSA private key.
- **Comparison & Finding:**
  - Admin App route works immediately for initial issuance and configuration without needing manual contract facet resolution.
  - Scripting can subsequently execute token operations (KYC grant, mint/issue, transfer freeze) using the token Diamond contract address.

