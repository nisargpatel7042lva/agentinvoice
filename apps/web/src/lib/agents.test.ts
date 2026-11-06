import { EnsReadError } from "@invoiceagent/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ records: {} as Record<string, unknown>, calls: [] as string[] }));
vi.mock("@invoiceagent/shared", async (orig) => ({
  ...(await orig<typeof import("@invoiceagent/shared")>()),
  readAgentFromEns: async (name: string) => {
    state.calls.push(name);
    const r = state.records[name];
    if (!r) throw new EnsReadError("missing_record", "no record");
    return r;
  },
}));

vi.mock("server-only", () => ({}));
const VAULT_A = "0xbc792de2be972434a996f222da426b590e858056";
const VAULT_B = "0x1111111111111111111111111111111111111111";
const rec = (name: string, vault: string) => ({ name, vault, limit: "1", threshold: "1", paid: 0, late: 0, status: "active", expiresAt: 2e9 });

describe("vault to ENS name", () => {
  beforeEach(() => {
    vi.resetModules();
    state.calls.length = 0;
    state.records = {};
    process.env.NEXT_PUBLIC_BACKEND_URL = "http://backend.test";
    process.env.NEXT_PUBLIC_BUYER_ENS_NAME = "buyer.demo.eth";
    vi.stubGlobal("fetch", async () => ({ json: async () => ({ agents: [{ vault: VAULT_B, name: "acme.demo.eth", owner: "0x0" }] }) }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("uses the name the backend registered for the vault, once ENS agrees", async () => {
    state.records["acme.demo.eth"] = rec("acme.demo.eth", VAULT_B);
    const { loadEnsByVault } = await import("./agents");
    const r = await loadEnsByVault(VAULT_B);
    expect(r.kind).toBe("present");
    expect(state.calls).toEqual(["acme.demo.eth"]);
  });

  it("rejects a registered name whose ENS record points at another vault", async () => {
    state.records["acme.demo.eth"] = rec("acme.demo.eth", VAULT_A);
    const { loadEnsByVault } = await import("./agents");
    expect((await loadEnsByVault(VAULT_B)).kind).toBe("missing");
  });

  it("falls back to the configured demo name for a vault the backend does not know", async () => {
    state.records["buyer.demo.eth"] = rec("buyer.demo.eth", VAULT_A);
    const { loadEnsByVault } = await import("./agents");
    expect((await loadEnsByVault(VAULT_A)).kind).toBe("present");
  });

  it("still answers from the demo name when the backend is down", async () => {
    vi.stubGlobal("fetch", async () => { throw new Error("down"); });
    state.records["buyer.demo.eth"] = rec("buyer.demo.eth", VAULT_A);
    const { loadEnsByVault } = await import("./agents");
    expect((await loadEnsByVault(VAULT_A)).kind).toBe("present");
  });
});
