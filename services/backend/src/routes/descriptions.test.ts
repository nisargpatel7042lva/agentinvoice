import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { buildApp } from "../app.js";
import { descriptionMessage } from "./descriptions.js";

const seller = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const other = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");

function appWith(supplier: string, description = "") {
  const app = buildApp({ dbPath: ":memory:", world: null });
  app.db
    .prepare(`INSERT INTO invoices (id, supplier, buyer_vault, face_amount, price, due_date, status, evidence_hash, description, source, updated_at) VALUES ('7', ?, ?, '100', '95', 2000000000, 'Pending', ?, ?, 'chain', 0)`)
    .run(supplier, "0x2222222222222222222222222222222222222222", `0x${"ab".repeat(32)}`, description);
  return app;
}
const put = (app: ReturnType<typeof buildApp>, id: string, owner: string, text: string, signature: string) =>
  app.inject({ method: "PUT", url: `/api/invoices/${id}/description`, payload: { description: text, owner, signature } });

describe("invoice description", () => {
  it("is set once by the on-chain supplier with a valid signature", async () => {
    const app = appWith(seller.address);
    const sig = await seller.signMessage({ message: descriptionMessage("7", "Printing job", seller.address) });
    expect((await put(app, "7", seller.address, "Printing job", sig)).statusCode).toBe(200);
    expect((await app.inject({ url: "/api/invoices/7" })).json().description).toBe("Printing job");
    expect((await put(app, "7", seller.address, "Printing job", sig)).statusCode).toBe(409);
    await app.close();
  });
  it("refuses another wallet, a wrong signature and an unknown invoice", async () => {
    const app = appWith(seller.address);
    const sigOther = await other.signMessage({ message: descriptionMessage("7", "x", other.address) });
    expect((await put(app, "7", other.address, "x", sigOther)).statusCode).toBe(403);
    const sigWrongText = await seller.signMessage({ message: descriptionMessage("7", "something else", seller.address) });
    expect((await put(app, "7", seller.address, "Printing job", sigWrongText)).statusCode).toBe(401);
    expect((await put(app, "99", seller.address, "x", sigWrongText)).statusCode).toBe(404);
    expect((await app.inject({ url: "/api/invoices/7" })).json().description).toBe("");
    await app.close();
  });
  it("serves the message to sign", async () => {
    const app = appWith(seller.address);
    const r = await app.inject({ url: `/api/invoices/7/description/message?owner=${seller.address}&text=Printing%20job` });
    expect(r.json().message).toBe(descriptionMessage("7", "Printing job", seller.address));
    await app.close();
  });
});
