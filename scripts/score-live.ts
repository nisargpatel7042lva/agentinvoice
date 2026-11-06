import { payAndGet } from "@agentinvoice/shared";

async function main() {
  const paidApiUrl = process.env.PAID_API_URL || "http://localhost:4020/score";
  const targetVault = (process.env.TARGET_VAULT || "0x1234567890123456789012345678901234567890") as `0x${string}`;

  const queryUrl = `${paidApiUrl}?vault=${targetVault}`;
  console.log(`[score-live] Fetching x402 credit score from: ${queryUrl}`);

  const result = await payAndGet(queryUrl, {
    policy: {
      perCallCap: "5000000000000000000", // 5 HBAR
      dailyBudget: "50000000000000000000", // 50 HBAR
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

