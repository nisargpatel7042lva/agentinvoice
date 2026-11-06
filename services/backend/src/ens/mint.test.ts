import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { claimMessage, MintError, mintSellerName, type MintDeps } from "./mint.js";

const parent = "demo.eth";
const acct = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const sign = (label: string) => acct.signMessage({ message: claimMessage(label, parent, acct.address) });

function deps(over: Partial<MintDeps> = {}) {
  const calls: string[] = [];
  const d: MintDeps = {
    parent,
    isTaken: async () => false,
    existingNameFor: () => null,
    register: async (label) => {
      calls.push(label);
      return { txHash: "0xabc" };
    },
    remember: () => {},
    ...over,
  };
  return { d, calls };
}
const fails = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof MintError ? e.code : "other"));

describe("mintSellerName", () => {
  it("registers a valid, signed, free name", async () => {
    const { d, calls } = deps();
    const r = await mintSellerName(d, { label: "Acme-Co", owner: acct.address, signature: await sign("acme-co") });
    expect(r.name).toBe("acme-co.demo.eth");
    expect(calls).toEqual(["acme-co"]);
  });
  it("rejects bad and reserved labels", async () => {
    const { d } = deps();
    expect(await fails(mintSellerName(d, { label: "a", owner: acct.address, signature: "0x" }))).toBe("bad_label");
    expect(await fails(mintSellerName(d, { label: "buyer", owner: acct.address, signature: "0x" }))).toBe("reserved");
  });
  it("rejects a signature for another label", async () => {
    const { d, calls } = deps();
    expect(await fails(mintSellerName(d, { label: "acme", owner: acct.address, signature: await sign("other") }))).toBe("bad_signature");
    expect(calls).toEqual([]);
  });
  it("rejects a second name for the same wallet and a taken name", async () => {
    const sig = await sign("acme");
    expect(await fails(mintSellerName(deps({ existingNameFor: () => "x.demo.eth" }).d, { label: "acme", owner: acct.address, signature: sig }))).toBe("already_has_name");
    expect(await fails(mintSellerName(deps({ isTaken: async () => true }).d, { label: "acme", owner: acct.address, signature: sig }))).toBe("taken");
  });
  it("reports a chain failure", async () => {
    const { d } = deps({ register: async () => { throw new Error("boom"); } });
    expect(await fails(mintSellerName(d, { label: "acme", owner: acct.address, signature: await sign("acme") }))).toBe("chain_failed");
  });
});
