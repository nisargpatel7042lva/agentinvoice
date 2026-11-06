import { generateKeyPair, SignJWT, type CryptoKey } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { handleCallback, StepUpError, type CallbackContext, type PendingStepUp } from "./callback.js";
import { WORLD_ACR_ORB, WORLD_ISSUER } from "./stepup.js";

const NOW = 1_800_000_000; // seconds
const CLIENT_ID = "client_test";

let privateKey: CryptoKey;
let publicKey: CryptoKey;
let otherPrivateKey: CryptoKey;

beforeAll(async () => {
  ({ privateKey, publicKey } = await generateKeyPair("RS256"));
  ({ privateKey: otherPrivateKey } = await generateKeyPair("RS256"));
});

interface TokenOverrides {
  key?: CryptoKey;
  iss?: string;
  aud?: string;
  exp?: number;
  nonce?: string;
  authTime?: number;
  acr?: string;
  sub?: string;
}

async function makeToken(o: TokenOverrides = {}): Promise<string> {
  return new SignJWT({
    nonce: o.nonce ?? "nonce-1",
    auth_time: o.authTime ?? NOW - 10,
    acr: o.acr ?? WORLD_ACR_ORB,
    amr: ["pop"],
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(o.iss ?? WORLD_ISSUER)
    .setAudience(o.aud ?? CLIENT_ID)
    .setSubject(o.sub ?? "sub-123")
    .setIssuedAt(NOW - 10)
    .setExpirationTime(o.exp ?? NOW + 300)
    .sign(o.key ?? privateKey);
}

function makeCtx(opts: {
  idToken?: Promise<string> | string;
  pending?: Partial<PendingStepUp> | null;
  status?: number;
}) {
  const consumed: string[] = [];
  const bodies: string[] = [];
  const pending: PendingStepUp | undefined =
    opts.pending === null
      ? undefined
      : { nonce: "nonce-1", codeVerifier: "verifier-1", expiresAt: NOW + 600, consumed: false, ...opts.pending };
  const ctx: CallbackContext = {
    config: { clientId: CLIENT_ID, clientSecret: "secret", redirectUri: "https://example.test/cb" },
    getPending: (state) => (state === "approval-1" ? pending : undefined),
    consume: (state) => {
      consumed.push(state);
      if (pending) pending.consumed = true;
    },
    getKey: async () => publicKey,
    fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(String(init?.body));
      const status = opts.status ?? 200;
      const id_token = await (opts.idToken ?? makeToken());
      return new Response(JSON.stringify(status === 200 ? { id_token } : { error: "invalid_grant" }), { status });
    }) as typeof fetch,
    now: () => NOW,
  };
  return { ctx, consumed, bodies };
}

const okInput = { code: "code-1", state: "approval-1", iss: WORLD_ISSUER };

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof StepUpError) return err.code;
    throw err;
  }
  return "no_error";
}

describe("handleCallback", () => {
  it("returns the verified subject and sends the PKCE verifier", async () => {
    const { ctx, bodies, consumed } = makeCtx({});
    const result = await handleCallback(okInput, ctx);

    expect(result).toEqual({ subject: "sub-123", issuer: WORLD_ISSUER, authTime: NOW - 10, acr: WORLD_ACR_ORB });
    expect(consumed).toEqual(["approval-1"]);
    const body = new URLSearchParams(bodies[0]);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("code-1");
    expect(body.get("code_verifier")).toBe("verifier-1");
    expect(body.get("redirect_uri")).toBe("https://example.test/cb");
  });

  it("rejects a user cancel and consumes the approval", async () => {
    const { ctx, consumed } = makeCtx({});
    expect(await codeOf(handleCallback({ error: "access_denied", state: "approval-1" }, ctx))).toBe("user_cancelled");
    expect(consumed).toEqual(["approval-1"]);
  });

  it("rejects missing code or state", async () => {
    const { ctx } = makeCtx({});
    expect(await codeOf(handleCallback({ state: "approval-1" }, ctx))).toBe("missing_params");
    expect(await codeOf(handleCallback({ code: "c" }, ctx))).toBe("missing_params");
  });

  it("rejects an unknown state", async () => {
    const { ctx } = makeCtx({ pending: null });
    expect(await codeOf(handleCallback(okInput, ctx))).toBe("unknown_state");
  });

  it("rejects an expired approval", async () => {
    const { ctx } = makeCtx({ pending: { expiresAt: NOW - 1 } });
    expect(await codeOf(handleCallback(okInput, ctx))).toBe("approval_expired");
  });

  it("rejects a reused state", async () => {
    const { ctx } = makeCtx({});
    await handleCallback(okInput, ctx);
    expect(await codeOf(handleCallback(okInput, ctx))).toBe("state_reused");
  });

  it("rejects a callback iss that is not World", async () => {
    const { ctx } = makeCtx({});
    expect(await codeOf(handleCallback({ ...okInput, iss: "https://evil.test" }, ctx))).toBe("issuer_mismatch");
  });

  it("rejects a failed token exchange", async () => {
    const { ctx } = makeCtx({ status: 400 });
    expect(await codeOf(handleCallback(okInput, ctx))).toBe("token_exchange_failed");
  });

  it.each([
    ["wrong signing key", () => makeToken({ key: otherPrivateKey })],
    ["wrong audience", () => makeToken({ aud: "other_client" })],
    ["wrong issuer", () => makeToken({ iss: "https://evil.test" })],
    ["expired token", () => makeToken({ exp: NOW - 5 })],
  ])("rejects an invalid ID token: %s", async (_name, make) => {
    const { ctx } = makeCtx({ idToken: make() });
    expect(await codeOf(handleCallback(okInput, ctx))).toBe("invalid_token");
  });

  it("rejects a wrong nonce", async () => {
    const { ctx } = makeCtx({ idToken: makeToken({ nonce: "nonce-other" }) });
    expect(await codeOf(handleCallback(okInput, ctx))).toBe("nonce_mismatch");
  });

  it("rejects a stale authentication time", async () => {
    const { ctx } = makeCtx({ idToken: makeToken({ authTime: NOW - 3600 }) });
    expect(await codeOf(handleCallback(okInput, ctx))).toBe("stale_authentication");
  });

  it("rejects an acr below the required level", async () => {
    const { ctx } = makeCtx({ idToken: makeToken({ acr: "https://world.org/oidc/acr/selfie" }) });
    expect(await codeOf(handleCallback(okInput, ctx))).toBe("insufficient_acr");
  });
});
