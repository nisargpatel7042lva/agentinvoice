import { ApprovalSchema, ApprovalStartSchema } from "@invoiceagent/shared";
import { generateKeyPair, SignJWT, type CryptoKey } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { buildApp } from "../app.js";
import { createApprovalSigner } from "../approval/sign.js";
import { consumeApproval, ApprovalUseError } from "../approval/store.js";
import { WORLD_ACR_ORB, WORLD_ISSUER } from "../world/stepup.js";
import type { WorldOptions } from "./approvals.js";

const NOW = 1_800_000_000;
const CLIENT_ID = "client_test";
const VAULT = "0x2222222222222222222222222222222222222222";
const EVIDENCE = `0x${"ab".repeat(32)}`;

let privateKey: CryptoKey;
let publicKey: CryptoKey;
beforeAll(async () => {
  ({ privateKey, publicKey } = await generateKeyPair("RS256"));
});

let clock = NOW;
let tokenOverrides: { nonce?: string; authTime?: number } = {};
let app: ReturnType<typeof buildApp>;
let audits: { type: string; invoiceId: string | null; data: Record<string, unknown> }[] = [];

// A fake World token endpoint: signs an ID token carrying the nonce from the authorization request.
function world(): WorldOptions {
  return {
    clientId: CLIENT_ID,
    clientSecret: "secret",
    redirectUri: "https://api.example.test/api/world/callback",
    appUrl: "https://app.example.test",
    ttlSeconds: 600,
    getKey: async () => publicKey,
    now: () => clock,
    fetchImpl: (async () => {
      const id_token = await new SignJWT({
        nonce: tokenOverrides.nonce ?? currentNonce,
        auth_time: tokenOverrides.authTime ?? clock - 10,
        acr: WORLD_ACR_ORB,
      })
        .setProtectedHeader({ alg: "RS256" })
        .setIssuer(WORLD_ISSUER)
        .setAudience(CLIENT_ID)
        .setSubject("sub-1")
        .setIssuedAt(clock - 10)
        .setExpirationTime(clock + 300)
        .sign(privateKey);
      return new Response(JSON.stringify({ id_token }), { status: 200 });
    }) as typeof fetch,
  };
}

let currentNonce = "";

beforeEach(() => {
  clock = NOW;
  tokenOverrides = {};
  audits = [];
  app = buildApp({ dbPath: ":memory:", world: world(), onAudit: (e) => void audits.push(e) });
  app.db
    .prepare(
      `INSERT INTO invoices (id, supplier, buyer_vault, face_amount, price, due_date, status, evidence_hash, source, updated_at)
       VALUES ('7', '0x1111111111111111111111111111111111111111', ?, '500', '475', 2000000000, 'Funded', ?, 'chain', 0),
              ('8', '0x1111111111111111111111111111111111111111', ?, '500', '475', 2000000000, 'Paid', ?, 'chain', 0)`,
    )
    .run(VAULT, EVIDENCE, VAULT, EVIDENCE);
});
afterEach(() => app.close());

async function start(invoiceId = "7") {
  const res = await app.inject({ method: "POST", url: "/api/approvals", payload: { invoiceId } });
  expect(res.statusCode).toBe(201);
  const body = ApprovalStartSchema.parse(res.json());
  const url = new URL(body.authorizationUrl);
  currentNonce = url.searchParams.get("nonce") ?? "";
  return { id: body.approvalId, url };
}

const callback = (query: Record<string, string>) => app.inject({ method: "GET", url: `/api/world/callback?${new URLSearchParams(query)}` });
const stateOf = async (id: string) => ApprovalSchema.parse((await app.inject({ method: "GET", url: `/api/approvals/${id}` })).json()).state;
const resultOf = (res: { headers: Record<string, unknown> }) => new URL(String(res.headers.location)).searchParams.get("result");

describe("POST /api/approvals", () => {
  it("creates a pending approval and returns a World authorization URL bound to it", async () => {
    const { id, url } = await start();
    expect(url.origin + url.pathname).toBe("https://auth.world.org/api/v1/authorize");
    expect(url.searchParams.get("state")).toBe(id);
    expect(url.searchParams.get("max_age")).toBe("0");
    expect(await stateOf(id)).toBe("pending");
  });

  it("rejects an unknown invoice, a closed invoice and a bad body", async () => {
    expect((await app.inject({ method: "POST", url: "/api/approvals", payload: { invoiceId: "999" } })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/api/approvals", payload: { invoiceId: "8" } })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: "/api/approvals", payload: { invoiceId: "x" } })).statusCode).toBe(400);
  });

  it("answers 503 when World is not configured", async () => {
    const bare = buildApp({ dbPath: ":memory:", world: null });
    expect((await bare.inject({ method: "POST", url: "/api/approvals", payload: { invoiceId: "7" } })).statusCode).toBe(503);
    await bare.close();
  });
});

describe("GET /api/world/callback", () => {
  it("approves after a valid step-up, redirects to the app, and the approval works exactly once", async () => {
    const { id } = await start();
    const res = await callback({ code: "c", state: id, iss: WORLD_ISSUER });

    expect(res.statusCode).toBe(302);
    expect(String(res.headers.location)).toMatch(/^https:\/\/app\.example\.test\/approval\//);
    expect(resultOf(res)).toBe("approved");
    expect(await stateOf(id)).toBe("approved");

    consumeApproval(app.db, id, { invoiceId: "7", amount: "500" }, clock);
    expect(() => consumeApproval(app.db, id, { invoiceId: "7", amount: "500" }, clock)).toThrow(ApprovalUseError);
  });

  it("rejects when the sponsor cancels, and later callbacks cannot revive it", async () => {
    const { id } = await start();
    expect(resultOf(await callback({ error: "access_denied", state: id }))).toBe("rejected");
    expect(await stateOf(id)).toBe("rejected");

    const replay = await callback({ code: "c", state: id, iss: WORLD_ISSUER });
    expect(resultOf(replay)).toBe("rejected");
    expect(await stateOf(id)).toBe("rejected");
  });

  it("expires when the callback arrives after the deadline", async () => {
    const { id } = await start();
    clock = NOW + 601;
    expect(resultOf(await callback({ code: "c", state: id, iss: WORLD_ISSUER }))).toBe("expired");
    expect(await stateOf(id)).toBe("expired");
  });

  it("rejects a stale authentication and never approves", async () => {
    const { id } = await start();
    tokenOverrides = { authTime: NOW - 3600 };
    expect(resultOf(await callback({ code: "c", state: id, iss: WORLD_ISSUER }))).toBe("rejected");
    expect(await stateOf(id)).toBe("rejected");
  });

  it("rejects a token issued for another approval (wrong nonce)", async () => {
    const a = await start();
    await start(); // second approval sets currentNonce to its own nonce
    expect(resultOf(await callback({ code: "c", state: a.id, iss: WORLD_ISSUER }))).toBe("rejected");
    expect(await stateOf(a.id)).toBe("rejected");
  });

  it("does not approve twice when the same callback is replayed", async () => {
    const { id } = await start();
    await callback({ code: "c", state: id, iss: WORLD_ISSUER });
    const again = await callback({ code: "c", state: id, iss: WORLD_ISSUER });
    expect(resultOf(again)).toBe("approved");
    expect(new URL(String(again.headers.location)).searchParams.get("code")).toBe("state_reused");
    expect(ApprovalSchema.parse((await app.inject({ method: "GET", url: `/api/approvals/${id}` })).json()).decidedAt).toBe(NOW);
  });

  it("sends an unknown state to the app as an error without creating anything", async () => {
    const res = await callback({ code: "c", state: "nope", iss: WORLD_ISSUER });
    expect(resultOf(res)).toBe("error");
    expect(new URL(String(res.headers.location)).searchParams.get("code")).toBe("unknown_state");
  });
});

describe("audit events", () => {
  it("records started and approved, with ids only", async () => {
    const { id } = await start();
    await callback({ code: "c", state: id, iss: WORLD_ISSUER });

    expect(audits.map((a) => a.type)).toEqual(["approval.started", "approval.approved"]);
    expect(audits[1]).toMatchObject({ invoiceId: "7", data: { approvalId: id } });
    expect(JSON.stringify(audits)).not.toMatch(/sub-1|secret|nonce/);
  });

  it("records a rejection with its reason and an expiry once", async () => {
    const a = await start();
    await callback({ error: "access_denied", state: a.id });
    expect(audits.at(-1)).toMatchObject({ type: "approval.rejected", data: { approvalId: a.id, reason: "user_cancelled" } });

    audits = [];
    const b = await start();
    audits = [];
    clock = NOW + 601;
    await callback({ code: "c", state: b.id, iss: WORLD_ISSUER });
    expect(audits.filter((x) => x.type === "approval.expired")).toHaveLength(1);
  });
});

describe("GET /api/approvals/:id", () => {
  it("returns 404 for an unknown approval", async () => {
    expect((await app.inject({ method: "GET", url: "/api/approvals/nope" })).statusCode).toBe(404);
  });
});

describe("only the sponsor's World identity may approve", () => {
  const subjectHash = (sub: string) => createHash("sha256").update(`${WORLD_ISSUER}:${sub}`).digest("hex");
  const rebuild = (allowed: string[]) => {
    app.close();
    app = buildApp({ dbPath: ":memory:", world: { ...world(), allowedSubjects: allowed }, approvalSigner: createApprovalSigner(`0x${"59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"}`, 296) });
    app.db
      .prepare(`INSERT INTO invoices (id, supplier, buyer_vault, face_amount, price, due_date, status, evidence_hash, source, updated_at) VALUES ('7', '0x1111111111111111111111111111111111111111', ?, '500', '475', 2000000000, 'Funded', ?, 'chain', 0)`)
      .run(VAULT, EVIDENCE);
  };

  it("approves the listed person, and the signed payment approval becomes available only then", async () => {
    rebuild([subjectHash("sub-1")]);
    const { id } = await start();
    expect((await app.inject({ url: "/api/invoices/7/approval" })).statusCode).toBe(404); // nobody approved yet
    expect(resultOf(await callback({ code: "c", state: id, iss: WORLD_ISSUER }))).toBe("approved");
    expect((await app.inject({ url: "/api/invoices/7/approval" })).statusCode).toBe(200);
  });

  it("rejects another verified human, and no payment approval is ever signed", async () => {
    rebuild([subjectHash("someone-else")]);
    const { id } = await start();
    const res = await callback({ code: "c", state: id, iss: WORLD_ISSUER });
    expect(resultOf(res)).toBe("rejected");
    expect(await stateOf(id)).toBe("rejected");
    expect((await app.inject({ url: "/api/invoices/7/approval" })).statusCode).toBe(404);
  });
});
