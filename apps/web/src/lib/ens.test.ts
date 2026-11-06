import { EnsReadError } from "@agentinvoice/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ impl: (async () => undefined) as (name: string) => Promise<unknown>, calls: [] as string[] }));
vi.mock("@agentinvoice/shared", async (orig) => ({ ...(await orig<typeof import("@agentinvoice/shared")>()), readAgentFromEns: async (name: string) => { state.calls.push(name); return state.impl(name); } }));
vi.mock("./env", () => ({ isMock: false }));

const { lookupBuyer } = await import("./ens");
const VAULT = "0xbc792de2be972434a996f222da426b590e858056";

describe("lookupBuyer (real mode)", () => {
  beforeEach(() => { state.calls.length = 0; });

  it("uses a 0x vault address as typed, without reading ENS", async () => {
    expect(await lookupBuyer(VAULT)).toEqual({ kind: "ok", vault: VAULT });
    expect(state.calls).toEqual([]);
  });

  it("reads an ENS name live and returns its vault and record", async () => {
    const agent = { name: "buyer.x.eth", vault: VAULT, limit: "1", threshold: "1", paid: 0, late: 0, status: "active", expiresAt: 2e9 };
    state.impl = async () => agent;
    expect(await lookupBuyer(" Buyer.X.eth ")).toEqual({ kind: "ok", vault: VAULT, name: "buyer.x.eth", agent });
    expect(state.calls).toEqual(["buyer.x.eth"]);
  });

  it("says notfound for a name with no agent record", async () => {
    state.impl = async () => {
      throw new EnsReadError("missing_record", "no limit");
    };
    expect(await lookupBuyer("test.eth")).toEqual({ kind: "notfound" });
  });

  it("says unreachable, never a guess, when ENS cannot be read", async () => {
    state.impl = async () => {
      throw new Error("fetch failed");
    };
    expect(await lookupBuyer("buyer.x.eth")).toEqual({ kind: "unreachable" });
  });

  it("rejects empty input and names without a dot", async () => {
    expect(await lookupBuyer("")).toEqual({ kind: "notfound" });
    expect(await lookupBuyer("buyer")).toEqual({ kind: "notfound" });
  });
});
