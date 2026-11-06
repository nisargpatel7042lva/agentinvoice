/**
 * scripts/x402-pay.ts
 *
 * Demonstrates a live paid request on hedera:testnet using the x402 protocol:
 * 1. Calls GET /ping without payment -> receives HTTP 402 Payment Required.
 * 2. Parses payment requirements and fee payer.
 * 3. Builds and signs a Hedera TransferTransaction (fee payer sponsored by facilitator).
 * 4. Retries with PAYMENT-SIGNATURE header.
 * 5. Facilitator verifies and settles on Hedera testnet.
 * 6. Receives HTTP 200 OK with PAYMENT-RESPONSE header.
 * 7. Prints the consensus transaction ID and HashScan link.
 *
 * Usage:
 *   npx tsx scripts/x402-pay.ts
 *   or with env:
 *   HEDERA_ACCOUNT_ID=0.0.xxxx HEDERA_PRIVATE_KEY=... npx tsx scripts/x402-pay.ts
 */

import { buildPaidExpressApp } from "../services/paid-api/src/expressApp.js";
import { decodePaymentRequiredHeader, decodePaymentResponseHeader } from "@x402/core/http";
import { createClientHederaSigner, PrivateKey } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import type { Server } from "http";

function parsePrivateKey(keyText: string): PrivateKey {
  const clean = keyText.trim();
  try {
    return PrivateKey.fromStringECDSA(clean.replace(/^0x/, ""));
  } catch {
    return PrivateKey.fromString(clean);
  }
}

async function main() {
  console.log("=== x402 Hedera:testnet Live End-to-End Test ===");

  const targetPort = Number(process.env.PAID_API_PORT || 4020);
  const pingUrl = process.env.PING_URL || `http://localhost:${targetPort}/ping`;
  const facilitatorUrl = process.env.FACILITATOR_URL || "https://api.testnet.blocky402.com";

  // Check if server is already running, or start an in-process instance
  let server: Server | null = null;
  let serverStartedLocally = false;

  try {
    const probe = await fetch(pingUrl, { signal: AbortSignal.timeout(1000) });
    if (probe.status === 402 || probe.status === 200) {
      console.log(`[x402-pay] Server is running at ${pingUrl}`);
    }
  } catch {
    console.log(`[x402-pay] Starting in-process paid-api Express server on port ${targetPort}...`);
    const app = buildPaidExpressApp({ facilitatorUrl });
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(targetPort, "127.0.0.1", () => resolve(s));
    });
    serverStartedLocally = true;
    console.log(`[x402-pay] In-process server listening on ${pingUrl}`);
  }

  try {
    // -------------------------------------------------------------------------
    // Step 1: Initial Unpaid Request -> expect HTTP 402
    // -------------------------------------------------------------------------
    console.log(`\n[Step 1] Sending initial unpaid request: GET ${pingUrl}`);
    const initialRes = await fetch(pingUrl);
    console.log(`[Step 1] Response status: ${initialRes.status} ${initialRes.statusText}`);

    if (initialRes.status !== 402) {
      throw new Error(`Expected HTTP 402 Payment Required, got ${initialRes.status}`);
    }

    const paymentRequiredHeader = initialRes.headers.get("payment-required");
    if (!paymentRequiredHeader) {
      throw new Error("Missing 'payment-required' header in 402 response");
    }

    const paymentRequired = decodePaymentRequiredHeader(paymentRequiredHeader);
    console.log("[Step 1] Decoded Payment Requirements:");
    console.log(`  - x402 Version: ${paymentRequired.x402Version}`);
    const requirement = paymentRequired.accepts.find((a) => a.network === "hedera:testnet");
    if (!requirement) {
      throw new Error("No payment requirements found for hedera:testnet");
    }

    console.log(`  - Network: ${requirement.network}`);
    console.log(`  - Asset: ${requirement.asset} (0.0.0 = native HBAR)`);
    console.log(`  - Amount: ${requirement.amount} tinybars (${Number(requirement.amount) / 1e8} HBAR)`);
    console.log(`  - Pay To: ${requirement.payTo}`);
    console.log(`  - Fee Payer (facilitator sponsored): ${requirement.extra?.feePayer}`);

    // -------------------------------------------------------------------------
    // Step 2: Configure Client Signer
    // -------------------------------------------------------------------------
    const accountId = process.env.HEDERA_ACCOUNT_ID || process.env.CLIENT_ACCOUNT_ID;
    const rawKey = process.env.HEDERA_PRIVATE_KEY || process.env.CLIENT_PRIVATE_KEY;

    let signerAccountId: string;
    let signerKey: PrivateKey;

    if (accountId && rawKey) {
      signerAccountId = accountId;
      signerKey = parsePrivateKey(rawKey);
      console.log(`\n[Step 2] Using configured Hedera account: ${signerAccountId}`);
    } else {
      console.log("\n[Step 2] No HEDERA_ACCOUNT_ID / HEDERA_PRIVATE_KEY in env.");
      console.log("  Generating ephemeral testnet key for demonstration...");
      signerKey = PrivateKey.generateECDSA();
      signerAccountId = "0.0.12345";
      console.log(`  Ephemeral key public: ${signerKey.publicKey.toString()}`);
    }

    const signer = createClientHederaSigner(signerAccountId, signerKey, {
      network: "hedera:testnet",
    });

    const xClient = new x402Client()
      .register("hedera:*", new ExactHederaScheme(signer))
      .setSpendControls({ allowedAssets: true });
    const paidFetch = wrapFetchWithPayment(globalThis.fetch, xClient);

    // -------------------------------------------------------------------------
    // Step 3: Retry with Payment -> expect HTTP 200 & Settlement
    // -------------------------------------------------------------------------
    console.log(`\n[Step 3] Signing payment and sending request with PAYMENT-SIGNATURE...`);
    const paidRes = await paidFetch(pingUrl);
    console.log(`[Step 3] Response status: ${paidRes.status} ${paidRes.statusText}`);

    const responsePaymentHeader = paidRes.headers.get("payment-response");
    const body = await paidRes.json();
    console.log("[Step 3] Response body:", JSON.stringify(body, null, 2));

    if (paidRes.status === 200 && responsePaymentHeader) {
      const settlement = decodePaymentResponseHeader(responsePaymentHeader);
      console.log("\n[Settlement Succeeded]");
      console.log(`  - Status: Success (${settlement.success})`);
      console.log(`  - Payer: ${settlement.payer}`);
      console.log(`  - Transaction ID: ${settlement.transaction}`);
      console.log(`  - Network: ${settlement.network}`);
      console.log(`  - HashScan Link: https://hashscan.io/testnet/transaction/${encodeURIComponent(settlement.transaction)}`);
    } else if (paidRes.status !== 200) {
      console.log(`\n[Note] Server responded with status ${paidRes.status}:`, body);
    }
  } finally {
    if (server && serverStartedLocally) {
      server.close();
      console.log("\n[x402-pay] Closed local server.");
    }
  }
}

main().catch((err) => {
  console.error("Error running x402-pay:", err);
  process.exit(1);
});
