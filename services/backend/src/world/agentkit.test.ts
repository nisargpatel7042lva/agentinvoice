import { formatSIWEMessage, type AgentkitPayload } from "@worldcoin/agentkit";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { NonceStore, verifyAgentRequest, type AgentKitDeps } from "./agentkit.js";

const RESOURCE = "https://api.agentinvoice.test/api/approval/start";
const account = privateKeyToAccount(generatePrivateKey());

// Builds a real signed AgentKit header (base64 JSON payload), signed with a real key.
async function makeHeader(overrides: Partial<AgentkitPayload> = {}, tamper?: (p: AgentkitPayload) => void) {
  const info = {
    domain: "api.agentinvoice.test",
    uri: RESOURCE,
    version: "1",
    nonce: `nonce${Math.random().toString(36).slice(2, 12)}abcd`,
    issuedAt: new Date().toISOString(),
    chainId: "eip155:480",
    type: "eip191" as const,
    ...overrides,
  };
  const signature = await account.signMessage({ message: formatSIWEMessage(info, account.address) });
  const payload = { ...info, address: account.address, signature } as AgentkitPayload;
  tamper?.(payload);
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

function makeDeps(human: string | null = "human-1"): AgentKitDeps & { lookups: string[] } {
  const lookups: string[] = [];
  return {
    lookups,
    agentBook: {
      lookupHuman: async (address: string) => {
        lookups.push(address);
        return human;
      },
    },
    nonces: new NonceStore(),
  };
}

describe("verifyAgentRequest", () => {
  it("accepts a valid header from a registered agent", async () => {
    const deps = makeDeps();
    const res = await verifyAgentRequest({ agentkit: await makeHeader() }, RESOURCE, deps);

    expect(res).toEqual({ ok: true, humanId: "human-1", agentAddress: account.address });
    expect(deps.lookups).toEqual([account.address]);
  });

  it("rejects a tampered header", async () => {
    const deps = makeDeps();
    const header = await makeHeader({}, (p) => {
      p.statement = "changed after signing";
    });
    const res = await verifyAgentRequest({ agentkit: header }, RESOURCE, deps);

    expect(res.ok).toBe(false);
    expect(res.reason).toBe("invalid_signature");
    expect(deps.lookups).toEqual([]);
  });

  it("rejects a replayed header", async () => {
    const deps = makeDeps();
    const header = await makeHeader();
    expect((await verifyAgentRequest({ agentkit: header }, RESOURCE, deps)).ok).toBe(true);

    const second = await verifyAgentRequest({ agentkit: header }, RESOURCE, deps);
    expect(second.ok).toBe(false);
    expect(second.reason).toBe("replayed_nonce");
  });

  it("rejects a wallet that is not registered to a human", async () => {
    const deps = makeDeps(null);
    const res = await verifyAgentRequest({ agentkit: await makeHeader() }, RESOURCE, deps);

    expect(res).toMatchObject({ ok: false, reason: "not_registered", agentAddress: account.address });
  });

  it("rejects a missing or malformed header", async () => {
    const deps = makeDeps();
    expect((await verifyAgentRequest({}, RESOURCE, deps)).reason).toBe("missing_header");
    expect((await verifyAgentRequest({ agentkit: "%%%not-base64%%%" }, RESOURCE, deps)).reason).toBe("invalid_header");
  });

  it("rejects a header signed for another resource", async () => {
    const deps = makeDeps();
    const res = await verifyAgentRequest({ agentkit: await makeHeader() }, "https://other.test/x", deps);

    expect(res.ok).toBe(false);
    expect(res.reason).toBe("invalid_message");
  });

  it("rejects a stale header", async () => {
    const deps = makeDeps();
    const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const res = await verifyAgentRequest({ agentkit: await makeHeader({ issuedAt: old }) }, RESOURCE, deps);

    expect(res.ok).toBe(false);
    expect(res.reason).toBe("invalid_message");
  });

  it("finds the header case-insensitively", async () => {
    const deps = makeDeps();
    const res = await verifyAgentRequest(new Headers({ AgentKit: await makeHeader() }), RESOURCE, deps);
    expect(res.ok).toBe(true);
  });
});
