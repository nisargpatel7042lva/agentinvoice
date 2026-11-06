import express, { type Express } from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";

export interface PaidExpressConfig {
  payTo?: string;
  price?: string; // in tinybars (e.g. 10000000 = 0.1 HBAR)
  facilitatorUrl?: string;
}

export function buildPaidExpressApp(config?: PaidExpressConfig): Express {
  const payTo =
    config?.payTo ||
    process.env.DEPLOYER_ACCOUNT_ID ||
    process.env.HEDERA_ACCOUNT_ID ||
    process.env.PAY_TO ||
    "0.0.5001";

  const price = config?.price || process.env.PING_PRICE || "10000000"; // 0.1 HBAR default
  const facilitatorUrl =
    config?.facilitatorUrl ||
    process.env.FACILITATOR_URL ||
    "https://api.testnet.blocky402.com";

  const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });
  const resourceServer = new x402ResourceServer(facilitatorClient).register(
    "hedera:*",
    new ExactHederaScheme(),
  );

  const app = express();
  app.use(express.json());

  app.use(
    paymentMiddleware(
      {
        "GET /ping": {
          accepts: [
            {
              scheme: "exact",
              price: { amount: price, asset: "0.0.0" },
              network: "hedera:testnet",
              payTo,
            },
          ],
          description: "Ping paid health check endpoint",
          mimeType: "application/json",
        },
      },
      resourceServer,
    ),
  );

  app.get("/ping", (_req, res) => {
    res.status(200).json({
      pong: true,
      service: "paid-api",
      payTo,
      timestamp: Date.now(),
    });
  });

  return app;
}

