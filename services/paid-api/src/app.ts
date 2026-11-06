import Fastify, { FastifyInstance } from "fastify";
import { AddressSchema, type BuyerScore, type ScoreBand } from "@agentinvoice/shared";

export interface PaidApiConfig {
  payTo?: string;
  price?: string; // in base units (wei equivalent for Hedera EVM)
}

export function computeBand(paid: number, late: number, defaulted: number): { band: ScoreBand; onTimeRate: number } {
  const settled = paid + late + defaulted;
  if (settled < 3) {
    return { band: "New", onTimeRate: settled === 0 ? 100 : Math.round((paid / settled) * 100) };
  }
  const onTimeRate = Math.round((paid / settled) * 100);
  if (onTimeRate >= 95) return { band: "A", onTimeRate };
  if (onTimeRate >= 80) return { band: "B", onTimeRate };
  return { band: "C", onTimeRate };
}

export function buildPaidApp(config?: PaidApiConfig): FastifyInstance {
  const app = Fastify({ logger: false });
  const payTo = config?.payTo || process.env.PAY_TO || "0x1111111111111111111111111111111111111111";
  const price = config?.price || process.env.SCORE_PRICE || "1000000000000000000"; // 1 HBAR default

  app.get("/health", async () => {
    return { status: "ok", service: "paid-api" };
  });

  app.get<{ Querystring: { vault?: string } }>("/score", async (req, reply) => {
    const vault = req.query.vault;
    if (!vault) {
      return reply.status(400).send({ error: "Missing required query parameter: vault" });
    }

    const parseResult = AddressSchema.safeParse(vault);
    if (!parseResult.success) {
      return reply.status(400).send({ error: "Invalid vault address format (expected 0x + 40 hex)" });
    }

    const validatedVault = parseResult.data;

    // Check payment authorization header
    const authHeader = req.headers["authorization"] || req.headers["x-payment"];
    if (!authHeader || typeof authHeader !== "string" || !authHeader.toLowerCase().includes("x402")) {
      reply.header("WWW-Authenticate", `x402 network="hedera:testnet", payTo="${payTo}", amount="${price}"`);
      reply.header("x402-payment-required", "true");
      return reply.status(402).send({
        error: "Payment Required",
        network: "hedera:testnet",
        payTo,
        amount: price,
        description: "Credit score lookup fee for buyer vault",
      });
    }

    // Default mock stats for score demo
    const paid = 5;
    const late = 0;
    const defaulted = 0;
    const { band, onTimeRate } = computeBand(paid, late, defaulted);

    const scoreReport: BuyerScore = {
      vault: validatedVault,
      band,
      onTimeRate,
      paid,
      late,
      defaulted,
      openExposure: "0",
      evidence: ["0.0.12345@1700000000.000000000"],
      asOf: Math.floor(Date.now() / 1000),
    };

    return reply.status(200).send(scoreReport);
  });

  return app;
}

