import { hederaTestnet } from "@agentinvoice/shared";
import { flattenError, z } from "zod";
import addresses from "../../../packages/shared/src/addresses.json" with { type: "json" };

const blank = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const address = /^0x[0-9a-fA-F]{40}$/;
const privateKey = /^0x[0-9a-fA-F]{64}$/;

export const agentEnvSchema = z
  .object({
    BACKEND_URL: z.string().min(1, "BACKEND_URL is missing"),
    BUYER_AGENT_POLL_INTERVAL_MS: z
      .string()
      .regex(/^[1-9]\d*$/, "BUYER_AGENT_POLL_INTERVAL_MS must be a positive whole number")
      .default("15000"),
    BUYER_AGENT_PRIVATE_KEY: z
      .string()
      .regex(privateKey, "BUYER_AGENT_PRIVATE_KEY must be a 0x + 64 hex private key")
      .optional(),
    BUYER_VAULT_ADDRESS: z.string().regex(address, "BUYER_VAULT_ADDRESS must be a 0x address").default(addresses.buyerVault),
    MARKET_ADDRESS: z.string().regex(address, "MARKET_ADDRESS must be a 0x address").default(addresses.invoiceMarket),
    HEDERA_TESTNET_RPC_URL: z.string().min(1, "HEDERA_TESTNET_RPC_URL is missing").default(hederaTestnet.rpcUrl),
    DRY_RUN: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.DRY_RUN !== "1" && !value.BUYER_AGENT_PRIVATE_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["BUYER_AGENT_PRIVATE_KEY"],
        message: "BUYER_AGENT_PRIVATE_KEY is missing",
      });
    }
  });

export type AgentConfig = {
  backendUrl: string;
  pollIntervalMs: number;
  privateKey?: `0x${string}`;
  buyerVaultAddress: `0x${string}`;
  marketAddress: `0x${string}`;
  rpcUrl: string;
  dryRun: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const result = agentEnvSchema.safeParse({
    BACKEND_URL: blank(env.BACKEND_URL),
    BUYER_AGENT_POLL_INTERVAL_MS: blank(env.BUYER_AGENT_POLL_INTERVAL_MS),
    BUYER_AGENT_PRIVATE_KEY: blank(env.BUYER_AGENT_PRIVATE_KEY),
    BUYER_VAULT_ADDRESS: blank(env.BUYER_VAULT_ADDRESS),
    MARKET_ADDRESS: blank(env.MARKET_ADDRESS),
    HEDERA_TESTNET_RPC_URL: blank(env.HEDERA_TESTNET_RPC_URL),
    DRY_RUN: blank(env.DRY_RUN),
  });

  if (!result.success) {
    const lines = Object.entries(flattenError(result.error).fieldErrors).map(([name, messages]) => {
      return `${name}: ${messages?.join(", ") || `${name} is missing`}`;
    });
    throw new Error(`Missing environment variables:\n${lines.join("\n")}`);
  }

  const dryRun = result.data.DRY_RUN === "1";
  return {
    backendUrl: result.data.BACKEND_URL,
    pollIntervalMs: Number(result.data.BUYER_AGENT_POLL_INTERVAL_MS),
    privateKey: result.data.BUYER_AGENT_PRIVATE_KEY as `0x${string}` | undefined,
    buyerVaultAddress: result.data.BUYER_VAULT_ADDRESS as `0x${string}`,
    marketAddress: result.data.MARKET_ADDRESS as `0x${string}`,
    rpcUrl: result.data.HEDERA_TESTNET_RPC_URL,
    dryRun,
  };
}
