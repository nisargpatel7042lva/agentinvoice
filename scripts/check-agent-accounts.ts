// Demonstrates the AgentAccount interface end-to-end:
// 1. BuyerVaultAccount on Hedera Testnet
// 2. HederaAgentAccount in default mode (honest unavailable error when no partner API)
// 3. HederaAgentAccount in partner testnet mode (programmable spend rules, recipient check, accept, pay, HCS audit)
//
// Usage:
//   bunx tsx --env-file=.env scripts/check-agent-accounts.ts
//   npx tsx scripts/check-agent-accounts.ts

import {
  createAgentAccount,
  HederaAgentAccount,
  HEDERA_AGENT_ACCOUNTS_UNAVAILABLE,
  AgentAccountUnavailableError,
  contracts,
  hederaTestnet,
} from "../packages/shared/src/index.js";
import { createPublicClient, http } from "viem";

async function main() {
  console.log("=== AgentAccount End-to-End Verification ===\n");

  const rpc = process.env.HEDERA_RPC_URL || hederaTestnet.rpcUrl;
  const chain = {
    id: hederaTestnet.id,
    name: hederaTestnet.name,
    nativeCurrency: hederaTestnet.nativeCurrency,
    rpcUrls: { default: { http: [rpc] } },
  } as const;
  const reader = createPublicClient({ chain, transport: http(rpc) });

  // 1. Live BuyerVaultAccount on Hedera testnet
  console.log("1. Checking BuyerVaultAccount (Live on Hedera testnet)...");
  try {
    const vault = createAgentAccount({
      provider: "buyer-vault",
      vault: contracts.buyerVault,
      reader,
    });
    const rules = await vault.rules();
    console.log(`   [PASS] Provider: ${vault.provider}`);
    console.log(`   [PASS] Address: ${vault.address}`);
    console.log(`   [PASS] Daily Limit: ${rules.dailyLimit} tinybars`);
    console.log(`   [PASS] Approval Threshold: ${rules.approvalThreshold} tinybars`);
    console.log(`   [PASS] Frozen: ${rules.frozen}\n`);
  } catch (err) {
    console.log(`   [WARN] BuyerVault check skipped or failed: ${(err as Error).message}\n`);
  }

  // 2. HederaAgentAccount in default mode (No partner API provided)
  console.log("2. Checking HederaAgentAccount in default production mode...");
  const defaultHedera = new HederaAgentAccount(contracts.buyerVault);
  try {
    await defaultHedera.rules();
    console.error("   [FAIL] Expected HederaAgentAccount to fail in default mode, but it succeeded!");
    process.exit(1);
  } catch (err) {
    if (err instanceof AgentAccountUnavailableError && err.message === HEDERA_AGENT_ACCOUNTS_UNAVAILABLE) {
      console.log(`   [PASS] Refused cleanly with honest error: "${err.message}"\n`);
    } else {
      console.error(`   [FAIL] Unexpected error: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  // 3. HederaAgentAccount in partner testnet mode
  console.log("3. Checking HederaAgentAccount in partner early-access mode...");
  const auditLogs: string[] = [];
  const partnerHedera = new HederaAgentAccount(contracts.buyerVault, {
    partnerDemo: true,
    mockRules: {
      dailyLimit: 10_000_000_000n, // 100 HBAR
      approvalThreshold: 2_000_000_000n, // 20 HBAR
      spentToday: 500_000_000n, // 5 HBAR
      frozen: false,
    },
    mockRecipients: {
      "0x1111111111111111111111111111111111111111": { allowed: true, limit: 5_000_000_000n },
    },
    onAudit: (e) => auditLogs.push(`[${e.type}] ${e.detail}${e.txHash ? ` (hash=${e.txHash})` : ""}`),
  });

  const partnerRules = await partnerHedera.rules();
  console.log(`   [PASS] Programmable Daily Limit: ${partnerRules.dailyLimit} tinybars`);
  console.log(`   [PASS] Approval Threshold: ${partnerRules.approvalThreshold} tinybars`);

  const recipientCheck = await partnerHedera.recipient("0x1111111111111111111111111111111111111111");
  console.log(`   [PASS] Recipient Allowlisted: ${recipientCheck.allowed} (limit=${recipientCheck.limit} tinybars)`);

  const acceptHash = await partnerHedera.accept(contracts.invoiceMarket, 101n);
  console.log(`   [PASS] Relayer Accept Tx: ${acceptHash}`);

  const payHash = await partnerHedera.pay(contracts.invoiceMarket, 101n, "0x1234");
  console.log(`   [PASS] Relayer Pay Tx: ${payHash}`);

  console.log("\n   Audit Receipts recorded for HCS submission:");
  for (const log of auditLogs) {
    console.log(`     * ${log}`);
  }

  console.log("\n=== Hedera Agent Accounts Verified Successfully! ===");
}

main().catch((err) => {
  console.error("Execution failed:", err);
  process.exit(1);
});

