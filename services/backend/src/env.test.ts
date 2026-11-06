import { describe, expect, it } from "vitest";
import { EnvError, loadEnv } from "./env.js";

const ADDR = "0x2222222222222222222222222222222222222222";
const KEY = `0x${"ab".repeat(32)}`;

const message = (env: Record<string, string>): string => {
  try {
    loadEnv(env);
  } catch (err) {
    if (err instanceof EnvError) return err.message;
    throw err;
  }
  return "";
};

describe("loadEnv", () => {
  it("starts with defaults and every optional feature disabled when nothing is set", () => {
    const c = loadEnv({});

    expect(c).toMatchObject({ port: 3001, dbPath: "agentinvoice.db", appUrl: "http://localhost:3000" });
    expect(c.disabled).toEqual(["World approvals", "ENS publisher", "Chain indexer", "HCS audit publishing", "HCS audit reading"]);
  });

  it("enables a feature only when its whole group is set", () => {
    const c = loadEnv({
      WORLD_CLIENT_ID: "c",
      WORLD_CLIENT_SECRET: "s",
      WORLD_REDIRECT_URI: "https://api.example.test/api/world/callback",
      INVOICE_MARKET_ADDRESS: ADDR,
      INDEXER_START_BLOCK: "123",
      HCS_TOPIC_ID: "0.0.5555",
    });

    expect(c.world).toMatchObject({ clientId: "c", redirectUri: "https://api.example.test/api/world/callback" });
    expect(c.indexer).toEqual({ market: ADDR, startBlock: 123n, rpcUrl: undefined });
    expect(c.hcs).toEqual({ topicId: "0.0.5555", submit: undefined });
    expect(c.disabled).toEqual(["ENS publisher", "HCS audit publishing"]);
  });

  it("fails fast listing every missing variable of a half-configured group", () => {
    const m = message({ ENS_PUBLISHER_KEY: KEY, WORLD_CLIENT_ID: "c" });

    expect(m).toContain("ENS publisher: set ENS_RESOLVER_ADDRESS, ENS_AGENT_NAME, DEMO_VAULT_ADDRESS");
    expect(m).toContain("World approvals: set WORLD_CLIENT_SECRET, WORLD_REDIRECT_URI");
  });

  it("reports bad values by name and never echoes the value", () => {
    const m = message({ PORT: "99999", INVOICE_MARKET_ADDRESS: "not-an-address", ENS_PUBLISHER_KEY: "supersecretvalue", ENS_RESOLVER_ADDRESS: ADDR, ENS_AGENT_NAME: "a.eth", DEMO_VAULT_ADDRESS: ADDR });

    expect(m).toContain("PORT");
    expect(m).toContain("INVOICE_MARKET_ADDRESS");
    expect(m).toContain("ENS_PUBLISHER_KEY");
    expect(m).not.toContain("supersecretvalue");
    expect(m).not.toContain("not-an-address");
  });

  it("needs a topic for HCS publishing", () => {
    expect(message({ HEDERA_ACCOUNT_ID: "0.0.1234", HEDERA_PRIVATE_KEY: "k" })).toContain("HCS_TOPIC_ID");
    expect(message({ HCS_TOPIC_ID: "0.0.5555", HEDERA_ACCOUNT_ID: "0.0.1234" })).toContain("HEDERA_PRIVATE_KEY");
  });

  it("treats empty strings (a copied .env.example) as unset", () => {
    const c = loadEnv({ WORLD_CLIENT_ID: "", ENS_PUBLISHER_KEY: "", PORT: "", DB_PATH: "" });
    expect(c.port).toBe(3001);
    expect(c.disabled).toContain("ENS publisher");
  });
});
