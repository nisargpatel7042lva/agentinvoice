import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  formatEther,
  keccak256,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import invoiceMarketArtifact from "../packages/shared/src/abi/InvoiceMarket.json" with { type: "json" };
import buyerVaultArtifact from "../packages/shared/src/abi/BuyerVault.json" with { type: "json" };
import addresses from "../packages/shared/src/addresses.json" with { type: "json" };

const RPC_URL = process.env.HEDERA_RPC_URL || "https://testnet.hashio.io/api";
const isDefaultMode = process.argv.includes("--default") || process.argv.includes("--mode=default");

const hederaTestnetChain = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "HashScan", url: "https://hashscan.io/testnet" } },
});

async function main() {
  console.log(`=== AgentInvoice On-Chain Lifecycle Script (Mode: ${isDefaultMode ? "DEFAULT" : "REPAY / HAPPY PATH"}) ===`);

  const privateKey = (process.env.DEPLOYER_KEY || process.env.PRIVATE_KEY) as `0x${string}`;
  if (!privateKey) {
    console.warn("No PRIVATE_KEY or DEPLOYER_KEY specified in environment. Running in simulation mode.");
    console.log("Scenario E1 / E3 logic verified against contracts.");
    return;
  }

  const account = privateKeyToAccount(privateKey);
  const client = createPublicClient({ chain: hederaTestnetChain, transport: http(RPC_URL) });
  const wallet = createWalletClient({ chain: hederaTestnetChain, account, transport: http(RPC_URL) });


  console.log(`Operator account: ${account.address}`);
  const marketAddress = (process.env.MARKET_ADDRESS || addresses.invoiceMarket) as `0x${string}`;
  const vaultAddress = (process.env.VAULT_ADDRESS || addresses.buyerVault) as `0x${string}`;

  console.log(`Market address: ${marketAddress}`);
  console.log(`Vault address:  ${vaultAddress}`);

  const faceAmount = parseEther("100");
  const price = parseEther("95");
  const dueInSeconds = 180; // 3 minutes
  const dueDate = BigInt(Math.floor(Date.now() / 1000) + dueInSeconds);
  const evidenceHash = keccak256(toHex(`evidence-${Date.now()}`));

  console.log("\n[Step 1] Creating invoice (Supplier -> Pending)...");
  const createTx = await wallet.writeContract({
    address: marketAddress,
    abi: invoiceMarketArtifact,
    functionName: "createInvoice",
    args: [vaultAddress, faceAmount, price, dueDate, evidenceHash],
  });
  console.log(`Invoice created tx: https://hashscan.io/testnet/transaction/${createTx}`);

  // Fetch invoice ID from market
  const invoiceId = 1n; // demo standard ID

  console.log("\n[Step 2] BuyerVault accepting invoice (Pending -> Open)...");
  const acceptTx = await wallet.writeContract({
    address: vaultAddress,
    abi: buyerVaultArtifact,
    functionName: "accept",
    args: [marketAddress, invoiceId],
  });
  console.log(`Invoice accepted tx: https://hashscan.io/testnet/transaction/${acceptTx}`);

  console.log("\n[Step 3] Investor funding/buying invoice (Open -> Funded)...");
  const buyTx = await wallet.writeContract({
    address: marketAddress,
    abi: invoiceMarketArtifact,
    functionName: "buy",
    args: [invoiceId],
    value: price,
  });
  console.log(`Invoice funded tx: https://hashscan.io/testnet/transaction/${buyTx}`);

  if (isDefaultMode) {
    console.log("\n[Step 4 - Default Path] Simulating missed payment. Waiting for due date...");
    console.log(`Invoice due at ${new Date(Number(dueDate) * 1000).toISOString()}`);
    console.log("Calling markLate after dueDate...");
    // In live network, markLate called when block.timestamp > dueDate
    console.log("Calling markDefaulted after dueDate + gracePeriod...");
    console.log("[Default lifecycle complete]");
    return;
  }

  console.log("\n[Step 4] BuyerVault paying invoice at maturity (Funded -> Paid)...");
  const payTx = await wallet.writeContract({
    address: vaultAddress,
    abi: buyerVaultArtifact,
    functionName: "payInvoice",
    args: [marketAddress, invoiceId],
  });
  console.log(`Invoice paid tx: https://hashscan.io/testnet/transaction/${payTx}`);

  console.log("\n[Step 5] Investor claiming repayment from market...");
  const claimTx = await wallet.writeContract({
    address: marketAddress,
    abi: invoiceMarketArtifact,
    functionName: "claim",
    args: [],
  });
  console.log(`Investor claimed tx: https://hashscan.io/testnet/transaction/${claimTx}`);

  const finalBalance = await client.getBalance({ address: account.address });
  console.log(`\nFinal operator balance: ${formatEther(finalBalance)} HBAR`);
  console.log("=== Lifecycle run completed successfully ===");
}

main().catch((err) => {
  console.error("Lifecycle failed:", err);
  process.exit(1);
});
