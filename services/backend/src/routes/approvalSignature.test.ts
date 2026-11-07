import { describe, expect, it } from "vitest";
import { decodeAbiParameters, recoverTypedDataAddress, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildApp } from "../app.js";
import { contractNonce, createApprovalSigner } from "../approval/sign.js";

const verifierKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const VAULT = getAddress("0x2222222222222222222222222222222222222222");
const signer = createApprovalSigner(verifierKey, 296);
const farFuture = () => Math.floor(Date.now() / 1000) + 600;

function setup(opts: { status?: string; state?: string; expiresAt?: number; vault?: string; amount?: string; consumed?: number | null } = {}) {
  const app = buildApp({ dbPath: ":memory:", world: null, approvalSigner: signer });
  app.db
    .prepare(`INSERT INTO invoices (id, supplier, buyer_vault, face_amount, price, due_date, status, evidence_hash, description, source, updated_at) VALUES ('5', '0x1111111111111111111111111111111111111111', ?, '6000000000', '5900000000', 1, ?, ?, '', 'chain', 0)`)
    .run(VAULT, opts.status ?? "Funded", `0x${"ab".repeat(32)}`);
  app.db
    .prepare(`INSERT INTO approvals (id, invoice_id, state, created_at, decided_at, vault, amount, action, expires_at, consumed_at) VALUES ('appr-1', '5', ?, 1, 2, ?, ?, 'large-payment', ?, ?)`)
    .run(opts.state ?? "approved", opts.vault ?? VAULT, opts.amount ?? "6000000000", opts.expiresAt ?? farFuture(), opts.consumed ?? null);
  return app;
}

describe("GET /api/invoices/:id/approval", () => {
  it("returns approval bytes the vault would accept: the verifier signed this exact payment", async () => {
    const exp = farFuture();
    const app = setup({ expiresAt: exp });
    const r = await app.inject({ url: "/api/invoices/5/approval" });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    const [nonce, expiry, sig] = decodeAbiParameters([{ type: "uint256" }, { type: "uint256" }, { type: "bytes" }], body.approval);
    expect(nonce).toBe(contractNonce("appr-1"));
    expect(expiry).toBe(BigInt(exp));
    const recovered = await recoverTypedDataAddress({
      domain: { name: "BuyerVault", version: "1", chainId: 296, verifyingContract: VAULT },
      types: { LargePayment: [{ name: "vault", type: "address" }, { name: "invoiceId", type: "uint256" }, { name: "amount", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "expiry", type: "uint256" }] },
      primaryType: "LargePayment",
      message: { vault: VAULT, invoiceId: 5n, amount: 6_000_000_000n, nonce, expiry },
      signature: sig,
    });
    expect(recovered).toBe(privateKeyToAccount(verifierKey).address);
    expect(body.verifier).toBe(recovered);
    await app.close();
  });
  it("gives nothing when the approval is not approved, expired, used, for another amount or vault, or the invoice is not Funded", async () => {
    for (const o of [{ state: "pending" }, { state: "rejected" }, { expiresAt: 5 }, { consumed: 3 }, { amount: "1" }, { vault: "0x3333333333333333333333333333333333333333" }, { status: "Paid" }]) {
      const app = setup(o);
      expect((await app.inject({ url: "/api/invoices/5/approval" })).statusCode, JSON.stringify(o)).toBe(404);
      await app.close();
    }
  });
  it("answers 503 without a signer and 404 for an unknown invoice", async () => {
    const none = buildApp({ dbPath: ":memory:", world: null });
    expect((await none.inject({ url: "/api/invoices/5/approval" })).statusCode).toBe(503);
    await none.close();
    const app = setup();
    expect((await app.inject({ url: "/api/invoices/99/approval" })).statusCode).toBe(404);
    await app.close();
  });
});

describe("matches BuyerVault's own digest formula", () => {
  it("signs exactly keccak256(0x1901 || DOMAIN_SEPARATOR || structHash) as the contract computes it", async () => {
    const { encodeAbiParameters, keccak256, toHex, concat, recoverAddress, hashTypedData } = await import("viem");
    const nonce = 123n, expiry = 1_900_000_000n, invoiceId = 5n, amount = 6_000_000_000n;
    // Same construction as contracts/src/BuyerVault.sol (constructor DOMAIN_SEPARATOR and _verifyApproval).
    const domainSeparator = keccak256(encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "address" }],
      [keccak256(toHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")), keccak256(toHex("BuyerVault")), keccak256(toHex("1")), 296n, VAULT],
    ));
    const typehash = keccak256(toHex("LargePayment(address vault,uint256 invoiceId,uint256 amount,uint256 nonce,uint256 expiry)"));
    const structHash = keccak256(encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
      [typehash, VAULT, invoiceId, amount, nonce, expiry],
    ));
    const digest = keccak256(concat(["0x1901", domainSeparator, structHash]));
    const sig = await signer.sign({ vault: VAULT, invoiceId, amount, nonce, expiry });
    expect(await recoverAddress({ hash: digest, signature: sig })).toBe(signer.address);
    // Canonical signature the contract accepts: 65 bytes, low-s, v 27 or 28.
    expect((sig.length - 2) / 2).toBe(65);
    expect(["1b", "1c"]).toContain(sig.slice(-2));
    expect(BigInt(`0x${sig.slice(66, 130)}`) <= 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n).toBe(true);
    expect(hashTypedData({
      domain: { name: "BuyerVault", version: "1", chainId: 296, verifyingContract: VAULT },
      types: { LargePayment: [{ name: "vault", type: "address" }, { name: "invoiceId", type: "uint256" }, { name: "amount", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "expiry", type: "uint256" }] },
      primaryType: "LargePayment",
      message: { vault: VAULT, invoiceId, amount, nonce, expiry },
    })).toBe(digest);
  });
});
