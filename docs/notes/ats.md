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

## 3. Compliance Configuration & Freeze Controls
- **Investor KYC / Allowlist Registration:**
  - Token adheres to ERC-1400 / ERC-3643 with an Identity Registry.
  - An investor wallet address must be added to the compliance / valid KYC list before token issuance or transfer.
  - Method / UI: In ATS Compliance/Holders module, add investor address and mark KYC verified (`Valid`).
- **Transfer Restrictions:**
  - Enforced at token Diamond contract level: non-KYC recipients or frozen accounts automatically revert on transfer attempts.
- **Freeze / Lock Mechanism:**
  - Compliance manager can trigger `lock` / `freeze` on a specific account or token partition.
  - **Hackathon Demo Alignment:** On buyer agent default, the compliance role locks the defaulting party / revokes subname, visibly proving regulatory control for the Tokenize track video.

## 4. Issuing Units and EVM Balance Verification (`balanceOf`)
- **Unit Issuance:**
  - Token issuer calls `issue(address tokenHolder, uint256 value, bytes data)` on the bond contract.
  - Recipient must be on the KYC list.
- **EVM Balance Verification via viem:**
  - ATS Diamond exposes standard ERC-20 / ERC-1400 `balanceOf(address)`.
  - RPC URL: `https://testnet.hashio.io/api` (Chain ID `296`).
  ```typescript
  import { createPublicClient, http, parseAbi } from "viem";

  export const atsBondAbi = parseAbi([
    "function balanceOf(address account) view returns (uint256)",
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function issue(address tokenHolder, uint256 value, bytes data) external",
    "function redeem(uint256 value, bytes data) external"
  ]);

  const client = createPublicClient({
    transport: http("https://testnet.hashio.io/api")
  });

  const balance = await client.readContract({
    address: bondAddress,
    abi: atsBondAbi,
    functionName: "balanceOf",
    args: [investorAddress]
  });
  ```

## 5. Architectural Q&A (Route Evaluation)
- **(a) Can the issuer/agent role be given to a smart contract so `InvoiceMarket` issues on buy (route T1a)?**
  - While role assignment allows contract addresses, calling the ATS Diamond proxy facets (`issueByPartition`) from Solidity requires diamond facet interfaces, identity registration of the calling contract, and high gas overhead on Hedera EVM. This makes T1a fragile for a 36-hour hackathon build.
- **(b) Can a backend wallet issue after `InvoiceFunded` (route T1b, one trusted step)?**
  - **Yes, recommended.** `InvoiceMarket.buy()` accepts investor payment, transfers HBAR to supplier, stores `invoice.holder = msg.sender`, and emits `InvoiceFunded(id, holder, face)`. An off-chain backend service holding the issuer key then calls the ATS SDK to issue units to the investor. We declare this trusted issuance step transparently in the submission.
- **(c) Which maturity, redeem or coupon functions exist for the lifecycle step?**
  - Zero-coupon discounted invoices do not require periodic coupons. For the video lifecycle step, we use `redeem(uint256 value, bytes data)` upon maturity when the investor is settled, burning the bond units.
- **(d) Can transfers be blocked so the holder cannot move units after funding?**
  - Yes, ATS compliance lock/freeze can restrict transfers. Furthermore, our contract stores `holder` at funding time and `payInvoice` pays that stored address directly, making any post-funding token transfer irrelevant to fund routing.

