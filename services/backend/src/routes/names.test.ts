import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { buildApp } from "../app.js";
import { claimMessage } from "../ens/mint.js";

const acct = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const minter = { parent: "demo.eth", isTaken: async () => false, register: async () => ({ txHash: "0xabc" as const }) };

describe("names routes", () => {
  it("mints once, then reads the name back and refuses a second", async () => {
    const app = buildApp({ dbPath: ":memory:", world: null, minter });
    const signature = await acct.signMessage({ message: claimMessage("acme", "demo.eth", acct.address) });
    const post = () => app.inject({ method: "POST", url: "/api/names", payload: { label: "acme", owner: acct.address, signature } });
    expect((await post()).statusCode).toBe(201);
    const got = await app.inject({ url: `/api/names/${acct.address}` });
    expect(got.json()).toEqual({ name: "acme.demo.eth", parent: "demo.eth" });
    expect((await post()).statusCode).toBe(409);
    await app.close();
  });
  it("answers 503 when minting is not configured", async () => {
    const app = buildApp({ dbPath: ":memory:", world: null });
    const r = await app.inject({ method: "POST", url: "/api/names", payload: { label: "acme", owner: acct.address, signature: "0x12" } });
    expect(r.statusCode).toBe(503);
    await app.close();
  });
});
