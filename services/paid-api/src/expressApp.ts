import express, { type Express } from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import { HTTPFacilitatorClient, type FacilitatorClient } from "@x402/core/server";
import {
  AddressSchema,
  calculateBuyerCibilScore,
  calculateDualPartyCibilScore,
  calculateSupplierCibilScore,
  createApiClient,
  scoreFromInvoices,
  type Invoice,
} from "@agentinvoice/shared";

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

  app.use("/cibil", (req, res, next) => {
    const { vault, supplier, invoiceId } = req.query;
    if (!vault && !supplier && !invoiceId) {
      res.status(400).json({ error: "must provide vault, supplier, or invoiceId query parameter" });
      return;
    }
    if (vault && !AddressSchema.safeParse(vault).success) {
      res.status(400).json({ error: "vault must be a 0x + 40 hex address" });
      return;
    }
    if (supplier && !AddressSchema.safeParse(supplier).success) {
      res.status(400).json({ error: "supplier must be a 0x + 40 hex address" });
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
        "GET /cibil": {
          accepts: [...accepts(scorePrice)],
          description: "Comprehensive on-chain CIBIL credit report for supplier and buyer",
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
      const invoices = await loadInvoices();
      res.status(200).json(scoreFromInvoices(String(req.query.vault) as `0x${string}`, invoices));
    } catch {
      res.status(503).json({ error: "invoice history unavailable" });
    }
  });

  app.get("/cibil", async (req, res) => {
    try {
      const invoices = await loadInvoices();
      const { invoiceId, supplier, vault } = req.query;

      if (invoiceId) {
        const inv = invoices.find((i) => i.id === String(invoiceId));
        if (!inv) {
          res.status(404).json({ error: "invoice not found" });
          return;
        }
        res.status(200).json(calculateDualPartyCibilScore(inv, invoices));
        return;
      }

      if (supplier) {
        res.status(200).json(calculateSupplierCibilScore(String(supplier) as `0x${string}`, invoices));
        return;
      }

      if (vault) {
        res.status(200).json(calculateBuyerCibilScore(String(vault) as `0x${string}`, invoices));
        return;
      }

      res.status(400).json({ error: "missing query parameter" });
    } catch {
      res.status(503).json({ error: "invoice history unavailable" });
    }
  });

  return app;
}
