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

