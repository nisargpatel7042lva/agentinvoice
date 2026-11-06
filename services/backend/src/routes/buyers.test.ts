import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildApp } from "../app.js";
import { buyerClaimMessage } from "../ens/mintBuyer.js";
import { roleMessage } from "./roles.js";

const acct = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const stranger = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
const vault = getAddress("0xbc792de2be972434a996f222da426b590e858056");
const registered: unknown[][] = [];
const buyerMinter = {
  parent: "demo.eth",
  isTaken: async (l: string) => l === "taken",
  register: async (...a: unknown[]) => (registered.push(a), { txHash: "0xabc" as const }),
  vaultOwner: async () => acct.address,
};

async function setup(role: "buyer" | "seller" | null = "buyer") {
  const app = buildApp({ dbPath: ":memory:", world: null, buyerMinter });
  if (role) {
    const signature = await acct.signMessage({ message: roleMessage(role, acct.address) });
    await app.inject({ method: "POST", url: "/api/roles", payload: { owner: acct.address, role, signature } });
  }
  const claim = async (label: string, signer = acct) => {
    const signature = await signer.signMessage({ message: buyerClaimMessage(label, "demo.eth", vault, acct.address) });
    return app.inject({ method: "POST", url: "/api/buyers", payload: { label, owner: acct.address, vault, signature } });
  };
  return { app, claim };
}

describe("buyer routes", () => {
  it("names the vault, points the record at it, and lists the pair", async () => {
    const { app, claim } = await setup();
    const r = await claim("acmebuyer");
    expect(r.statusCode).toBe(201);
    expect(registered.at(-1)).toEqual(["acmebuyer", acct.address, vault]);
    expect((await app.inject({ url: "/api/agents" })).json().agents).toEqual([{ vault: vault, name: "acmebuyer.demo.eth", owner: acct.address }]);
    expect((await claim("another")).statusCode).toBe(409); // one name per wallet and vault
    await app.close();
  });
  it("refuses sellers, strangers' signatures, taken labels and vaults the wallet does not own", async () => {
    const seller = await setup("seller");
    expect((await seller.claim("acmebuyer")).statusCode).toBe(403);
    const none = await setup(null);
    expect((await none.claim("acmebuyer")).statusCode).toBe(403);
    const { app, claim } = await setup();
    expect((await claim("acmebuyer", stranger)).statusCode).toBe(401);
    expect((await claim("taken")).statusCode).toBe(409);
    const other = buildApp({ dbPath: ":memory:", world: null, buyerMinter: { ...buyerMinter, vaultOwner: async () => stranger.address } });
    const sig = await acct.signMessage({ message: roleMessage("buyer", acct.address) });
    await other.inject({ method: "POST", url: "/api/roles", payload: { owner: acct.address, role: "buyer", signature: sig } });
    const s2 = await acct.signMessage({ message: buyerClaimMessage("acmebuyer", "demo.eth", vault, acct.address) });
    expect((await other.inject({ method: "POST", url: "/api/buyers", payload: { label: "acmebuyer", owner: acct.address, vault, signature: s2 } })).statusCode).toBe(403);
    await app.close();
  });
  it("says the chain could not be read (502), not 'not your vault', when the RPC fails", async () => {
    const app = buildApp({ dbPath: ":memory:", world: null, buyerMinter: { ...buyerMinter, vaultOwner: async () => { throw new Error("rpc down"); } } });
    const sig = await acct.signMessage({ message: roleMessage("buyer", acct.address) });
    await app.inject({ method: "POST", url: "/api/roles", payload: { owner: acct.address, role: "buyer", signature: sig } });
    const s2 = await acct.signMessage({ message: buyerClaimMessage("acmebuyer", "demo.eth", vault, acct.address) });
    expect((await app.inject({ method: "POST", url: "/api/buyers", payload: { label: "acmebuyer", owner: acct.address, vault, signature: s2 } })).statusCode).toBe(502);
    await app.close();
  });
  it("answers 503 when minting is not configured", async () => {
    const app = buildApp({ dbPath: ":memory:", world: null });
    expect((await app.inject({ method: "POST", url: "/api/buyers", payload: { label: "acmebuyer", owner: acct.address, vault, signature: "0x12" } })).statusCode).toBe(503);
    await app.close();
  });
});
