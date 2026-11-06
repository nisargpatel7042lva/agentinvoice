/**
 * Read-only SaucerSwap status + quote for the website.
 * Execute / associate stay in agents and scripts (dedicated operator key; dry-run by default).
 */
import { SAUCERSWAP_TESTNET_USDC, TINYBAR_PER_HBAR } from "@invoiceagent/shared";
import {
  createSaucerSwapConfig,
  getSaucerSwapStatus,
  loadSaucerSwapConfig,
  quoteHbarToUsdc,
  SaucerSwapConfigError,
  type SaucerSwapConfig,
} from "@invoiceagent/shared/saucerswap";
import type { FastifyInstance } from "fastify";

export interface SaucerSwapRouteOptions {
  /** null = feature off → 503. undefined = load from env. */
  config?: SaucerSwapConfig | null;
  enabled?: boolean;
  fetchImpl?: typeof fetch;
}

function loadOptionalConfig(): { enabled: boolean; config: SaucerSwapConfig | null } {
  // Feature on when SAUCERSWAP_STATUS=1 or an operator account id is present (quote works without a key).
  const flag = process.env.SAUCERSWAP_STATUS === "1" || Boolean(process.env.SAUCERSWAP_OPERATOR_ACCOUNT_ID?.trim());
  if (!flag) return { enabled: false, config: null };
  try {
    // Force dryRun for HTTP surface — never broadcast from these routes.
    return { enabled: true, config: { ...loadSaucerSwapConfig(), dryRun: true } };
  } catch (e) {
    if (e instanceof SaucerSwapConfigError) throw e;
    throw e;
  }
}

export function saucerswapRoutes(app: FastifyInstance, opts: SaucerSwapRouteOptions = {}) {
  const resolved =
    opts.config === null
      ? { enabled: false, config: null as SaucerSwapConfig | null }
      : opts.config
        ? { enabled: opts.enabled ?? true, config: { ...opts.config, dryRun: true } }
        : opts.enabled === false
          ? { enabled: false, config: null }
          : loadOptionalConfig();

  app.get("/api/saucerswap/status", async (_req, reply) => {
    if (!resolved.enabled || !resolved.config) {
      return reply.code(503).send({ error: "saucerswap_not_configured" });
    }
    try {
      return await getSaucerSwapStatus(resolved.config, { fetch: opts.fetchImpl });
    } catch (err) {
      app.log.warn({ message: (err as Error).message }, "saucerswap status failed");
      return reply.code(502).send({ error: "saucerswap_status_unavailable" });
    }
  });

  app.get<{ Querystring: { amountInTinybar?: string } }>("/api/saucerswap/quote", async (req, reply) => {
    if (!resolved.enabled || !resolved.config) {
      return reply.code(503).send({ error: "saucerswap_not_configured" });
    }
    let amountInTinybar = TINYBAR_PER_HBAR;
    if (req.query.amountInTinybar !== undefined) {
      try {
        amountInTinybar = BigInt(req.query.amountInTinybar);
      } catch {
        return reply.code(400).send({ error: "invalid_amountInTinybar" });
      }
      if (amountInTinybar <= 0n) return reply.code(400).send({ error: "invalid_amountInTinybar" });
    }

    const result = await quoteHbarToUsdc({ amountInTinybar }, resolved.config, { fetch: opts.fetchImpl });
    if (!result.ok) {
      return reply.code(502).send({ error: "quote_failed", code: result.code, reason: result.reason });
    }
    const q = result.quote;
    return {
      ok: true as const,
      amountInTinybar: q.amountInTinybar.toString(),
      amountOut: q.amountOut.toString(),
      amountOutMinimum: q.amountOutMinimum.toString(),
      fee: q.fee,
      tokenOut: q.tokenOut,
      quotedAt: Math.floor(q.quotedAt / 1000),
      expiresAt: Math.floor(q.expiresAt / 1000),
      usdcLabel: SAUCERSWAP_TESTNET_USDC.label,
      caveat: SAUCERSWAP_TESTNET_USDC.caveat,
    };
  });
}

/** Test helper: build a dry-run config without reading process.env. */
export function testSaucerSwapConfig(partial: Partial<SaucerSwapConfig> = {}): SaucerSwapConfig {
  return createSaucerSwapConfig({ dryRun: true, ...partial });
}
