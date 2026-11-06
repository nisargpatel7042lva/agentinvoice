import { EnsAgentSchema } from "@agentinvoice/shared";
import { describe, expect, it } from "vitest";
import { EnsReadError, isRevoked, readAgentFromEns, type EnsReader } from "./read.js";

const VAULT = "0x27a3c43158AC762F57B3aBe459a98e67659738EE";
const NOW = 1_800_000_000;

function makeReader(overrides: { texts?: Record<string, string | null>; addr?: string | null; expiry?: number } = {}) {
  const texts: Record<string, string | null> = {
    limit: "100",
    threshold: "10",
    paid: "3",
    late: "1",
    status: "active",
    ...overrides.texts,
  };
  const calls: string[] = [];
  const reader: EnsReader = {
    getAddress: async () => (overrides.addr === undefined ? VAULT : overrides.addr),
    getText: async (_name, key) => {
      calls.push(key);
      return texts[key] ?? null;
    },
    getExpiry: async () => overrides.expiry ?? NOW + 86_400,
  };
  return { reader, calls };
}

describe("readAgentFromEns", () => {
  it("returns a schema-valid EnsAgent from live-style reads", async () => {
    const { reader, calls } = makeReader();
    const agent = await readAgentFromEns("buyer.demo.eth", reader);

    expect(agent).toEqual({
      name: "buyer.demo.eth",
      vault: VAULT,
      limit: "100",
      threshold: "10",
      paid: 3,
      late: 1,
      status: "active",
      expiresAt: NOW + 86_400,
    });
    expect(EnsAgentSchema.safeParse(agent).success).toBe(true);
    expect(calls.sort()).toEqual(["late", "limit", "paid", "status", "threshold"]);
  });

  it("throws a distinct error for a missing record instead of inventing a value", async () => {
    const { reader } = makeReader({ texts: { limit: null } });
    await expect(readAgentFromEns("buyer.demo.eth", reader)).rejects.toMatchObject({
      name: "EnsReadError",
      code: "missing_record",
    });
  });

  it("throws when there is no addr record", async () => {
    const { reader } = makeReader({ addr: null });
    await expect(readAgentFromEns("buyer.demo.eth", reader)).rejects.toMatchObject({ code: "missing_record" });
  });

  it("rejects malformed record values", async () => {
    const cases: Record<string, string>[] = [{ paid: "-1" }, { limit: "1.5" }, { status: "frozen" }];
    for (const texts of cases) {
      const { reader } = makeReader({ texts });
      await expect(readAgentFromEns("buyer.demo.eth", reader)).rejects.toBeInstanceOf(EnsReadError);
    }
  });

  it("reports a revoked or expired name through expiresAt", async () => {
    const { reader } = makeReader({ expiry: NOW - 5 });
    const agent = await readAgentFromEns("buyer.demo.eth", reader);

    expect(isRevoked(agent, NOW)).toBe(true);
    expect(isRevoked({ ...agent, expiresAt: NOW + 10 }, NOW)).toBe(false);
  });
});
