import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { buildApp } from "../app.js";
import { roleMessage } from "./roles.js";

const acct = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const other = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");

describe("role routes", () => {
  it("sets a role once with a valid signature, then reads it and refuses a change", async () => {
    const app = buildApp({ dbPath: ":memory:", world: null });
    expect((await app.inject({ url: `/api/roles/${acct.address}` })).json()).toEqual({ role: null });
    const signature = await acct.signMessage({ message: roleMessage("buyer", acct.address) });
    const post = (role: string, sig = signature) => app.inject({ method: "POST", url: "/api/roles", payload: { owner: acct.address, role, signature: sig } });
    expect((await post("buyer")).statusCode).toBe(201);
    expect((await app.inject({ url: `/api/roles/${acct.address}` })).json()).toEqual({ role: "buyer" });
    expect((await post("buyer")).statusCode).toBe(409);
    await app.close();
  });
  it("rejects a signature from another wallet or for another role", async () => {
    const app = buildApp({ dbPath: ":memory:", world: null });
    const wrongWallet = await other.signMessage({ message: roleMessage("seller", acct.address) });
    const r1 = await app.inject({ method: "POST", url: "/api/roles", payload: { owner: acct.address, role: "seller", signature: wrongWallet } });
    expect(r1.statusCode).toBe(401);
    const forBuyer = await acct.signMessage({ message: roleMessage("buyer", acct.address) });
    const r2 = await app.inject({ method: "POST", url: "/api/roles", payload: { owner: acct.address, role: "seller", signature: forBuyer } });
    expect(r2.statusCode).toBe(401);
    expect((await app.inject({ url: `/api/roles/${acct.address}` })).json()).toEqual({ role: null });
    await app.close();
  });
  it("serves the message to sign", async () => {
    const app = buildApp({ dbPath: ":memory:", world: null });
    const r = await app.inject({ url: `/api/roles/message?owner=${acct.address}&role=seller` });
    expect(r.json().message).toBe(roleMessage("seller", acct.address));
    await app.close();
  });
});
