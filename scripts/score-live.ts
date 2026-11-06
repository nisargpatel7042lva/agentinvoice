import { payAndGet } from "@invoiceagent/shared/payAndGet";

async function main() {
  const paidApiUrl = process.env.PAID_API_URL || "http://localhost:4020/score";
  // Default: the deployed BuyerVault from addresses.json. Payer: HEDERA_ACCOUNT_ID + HEDERA_PRIVATE_KEY (ECDSA).
  const { contracts } = await import("@invoiceagent/shared");
  const targetVault = (process.env.TARGET_VAULT || contracts.buyerVault) as `0x${string}`;

  const queryUrl = `${paidApiUrl}?vault=${targetVault}`;
  console.log(`[score-live] Fetching x402 credit score from: ${queryUrl}`);

  const result = await payAndGet(queryUrl, {
    accountId: process.env.HEDERA_ACCOUNT_ID,
    privateKey: process.env.HEDERA_PRIVATE_KEY,
    policy: {
      perCallCap: "50000000", // 0.5 HBAR, in tinybars
      dailyBudget: "500000000", // 5 HBAR, in tinybars
    },
    onAudit: (evt) => {
      console.log(`[score-live audit] ${evt.type}: ${JSON.stringify(evt)}`);
    },
  });

  if (!result.ok) {
    console.error(`[score-live error] ${result.reason}`);
    process.exit(1);
  }

  console.log(`[score-live success] Received score report:`, result.data);
  if (result.txId) {
    console.log(`[score-live HashScan] https://hashscan.io/testnet/transaction/${result.txId}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

