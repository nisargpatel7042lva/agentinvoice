// End-to-end checks. Usage: tsx scripts/e2e.ts --local | --testnet
//
// --testnet: real checks against Hedera testnet and the running services. Every line is a live call, nothing is
//            assumed: contracts answer, the backend and indexer are up, the paid API demands a real x402 payment.
// --local:   the unit and contract suites (bun run verify:fast) are the local check, so this only says so.
//
// The earlier version printed a hard-coded table of PASS results without running anything. It is gone.
import { createPublicClient, http } from "viem";
import { buyerVaultAbi, contracts, createApiClient, hederaTestnet, invoiceMarketAbi } from "@invoiceagent/shared";

const testnet = process.argv.includes("--testnet");

async function main() {
  if (!testnet) {
    console.log("[e2e:local] Local checks are the unit and contract suites (bun run verify:fast). For live checks run: bun run e2e:testnet");
    return;
  }

  const results: { name: string; ok: boolean; detail: string }[] = [];
  const check = async (name: string, fn: () => Promise<string>) => {
    try {
      results.push({ name, ok: true, detail: await fn() });
    } catch (e) {
      results.push({ name, ok: false, detail: (e as Error).message.split("\n")[0] });
    }
  };

  const rpc = process.env.HEDERA_RPC_URL || process.env.HEDERA_TESTNET_RPC_URL || hederaTestnet.rpcUrl;
  const chain = { id: hederaTestnet.id, name: hederaTestnet.name, nativeCurrency: hederaTestnet.nativeCurrency, rpcUrls: { default: { http: [rpc] } } } as const;
  const client = createPublicClient({ chain, transport: http(rpc) });

  await check("InvoiceMarket answers on testnet", async () => {
    const next = (await client.readContract({ address: contracts.invoiceMarket, abi: invoiceMarketAbi, functionName: "nextInvoiceId" })) as bigint;
    return `${contracts.invoiceMarket} · nextInvoiceId=${next}`;
  });
  await check("BuyerVault answers and has an agent", async () => {
    const [agent, daily, threshold] = await Promise.all(
      (["agent", "dailyLimit", "approvalThreshold"] as const).map((fn) => client.readContract({ address: contracts.buyerVault, abi: buyerVaultAbi, functionName: fn })),
    );
    return `agent=${agent} · dailyLimit=${daily} · approvalThreshold=${threshold} (tinybar)`;
  });
  await check("BuyerVault holds HBAR to pay invoices", async () => {
    const bal = await client.getBalance({ address: contracts.buyerVault }); // weibar over JSON-RPC
    const hbar = Number(bal) / 1e18;
    if (hbar < 1) throw new Error(`vault holds only ${hbar} HBAR: the owner must call deposit() before it can pay invoices`);
    return `${hbar} HBAR`;
  });

  const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
  await check("Backend /health", async () => {
    const r = await fetch(`${backendUrl}/health`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return JSON.stringify(await r.json()).slice(0, 160);
  });
  await check("Backend lists invoices (indexer)", async () => {
    const list = await createApiClient({ baseUrl: backendUrl }).listInvoices();
    return `${list.length} invoices indexed`;
  });

  const paidUrl = process.env.PAID_API_URL || "http://localhost:4020";
  await check("Paid API demands a real x402 payment for /score", async () => {
    const r = await fetch(`${paidUrl}/score?vault=${contracts.buyerVault}`);
    if (r.status !== 402) throw new Error(`expected 402, got ${r.status}`);
    if (!r.headers.get("payment-required")) throw new Error("402 without a PAYMENT-REQUIRED header");
    return "402 with PAYMENT-REQUIRED header";
  });

  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}  ${r.detail}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\n[e2e:testnet] ${failed} check(s) failed.` : "\n[e2e:testnet] All checks passed.");
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[e2e] Failure:", err);
  process.exit(1);
});
