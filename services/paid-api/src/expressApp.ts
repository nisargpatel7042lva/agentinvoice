import express, { type Express } from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import { HTTPFacilitatorClient, type FacilitatorClient } from "@x402/core/server";
import { AddressSchema, createApiClient, scoreFromInvoices, type Address, type AuditEvent, type Invoice } from "@agentinvoice/shared";

export interface PaidExpressConfig {
  /** Hedera account id that receives payments, e.g. 0.0.1234 (required: no silent default). */
  payTo?: string;
  /** GET /ping price in tinybars (e.g. 10000000 = 0.1 HBAR). */
  price?: string;
  /** GET /score price in tinybars (default 5000000 = 0.05 HBAR). */
  scorePrice?: string;
  facilitatorUrl?: string;
  facilitatorClient?: FacilitatorClient;
  /** Where invoice history comes from. Default: the backend at BACKEND_URL. */
  loadInvoices?: () => Promise<Invoice[]>;
  /** Where audit events come from (for late payment detection). Default: the backend at BACKEND_URL. */
  loadAudit?: () => Promise<AuditEvent[]>;
}

const NETWORK = "hedera:testnet";
const ACCOUNT_ID = /^\d+\.\d+\.\d+$/;

export function buildPaidExpressApp(config?: PaidExpressConfig): Express {
  const payTo = config?.payTo || process.env.PAY_TO || process.env.DEPLOYER_ACCOUNT_ID || process.env.HEDERA_ACCOUNT_ID;
  // Never fall back to a made-up account: payments would go to a stranger.
  if (!payTo || !ACCOUNT_ID.test(payTo)) {
    throw new Error("PAY_TO must be the Hedera account id (0.0.x) that receives x402 payments.");
  }
  const price = config?.price || process.env.PING_PRICE || "10000000"; // 0.1 HBAR
  const scorePrice = config?.scorePrice || process.env.SCORE_PRICE || "5000000"; // 0.05 HBAR
  const facilitatorUrl = config?.facilitatorUrl || process.env.FACILITATOR_URL || "https://api.testnet.blocky402.com";
  const facilitatorClient = config?.facilitatorClient || new HTTPFacilitatorClient({ url: facilitatorUrl });

  const backend = createApiClient({ baseUrl: process.env.BACKEND_URL });
  const loadInvoices = config?.loadInvoices ?? (() => backend.listInvoices());
  const loadAudit = config?.loadAudit ?? (() => backend.listAudit());

  const resourceServer = new x402ResourceServer(facilitatorClient).register("hedera:*", new ExactHederaScheme());
  const accepts = (amount: string) => [{ scheme: "exact", price: { amount, asset: "0.0.0" }, network: NETWORK, payTo }] as const;

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "paid-api", payTo, network: NETWORK });
  });

  // Reject bad input before asking anyone to pay.
  app.use("/score", (req, res, next) => {
    const vault = String(req.query.vault ?? "");
    if (!AddressSchema.safeParse(vault).success) {
      res.status(400).json({ error: "vault must be a 0x + 40 hex address" });
      return;
    }
    next();
  });

  app.use(
    paymentMiddleware(
      {
        "GET /ping": { accepts: [...accepts(price)], description: "Ping paid health check endpoint", mimeType: "application/json" },
        "GET /score": {
          accepts: [...accepts(scorePrice)],
          description: "Credit score for a buyer vault, computed from its on-chain invoice history",
          mimeType: "application/json",
        },
      },
      resourceServer,
    ),
  );

  app.get("/ping", (_req, res) => {
    res.status(200).json({ pong: true, service: "paid-api", payTo, timestamp: Date.now() });
  });

  // Only reached after the payment is verified; the middleware settles it once we answer successfully.
  app.get("/score", async (req, res) => {
    try {
      const [invoices, auditEvents] = await Promise.all([
        loadInvoices(),
        loadAudit().catch(() => [] as AuditEvent[]),
      ]);
      const everLateIds = new Set<string>();
      for (const ev of auditEvents) {
        if (ev.type === "invoice.late" && ev.invoiceId) {
          everLateIds.add(ev.invoiceId);
        }
      }
      const vault = String(req.query.vault) as Address;
      res.status(200).json(
        scoreFromInvoices(vault, invoices, Math.floor(Date.now() / 1000), {
          everLateIds,
        })
      );
    } catch {
      res.status(503).json({ error: "invoice history unavailable" });
    }
  });

  return app;
}
