import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { startStepUp, type StepUpConfig } from "./stepup.js";

const config: StepUpConfig = {
  clientId: "client_test",
  redirectUri: "https://example.test/api/world/callback",
};

describe("startStepUp", () => {
  it("builds an authorization URL with PKCE and a fresh-auth request", () => {
    const res = startStepUp("approval-123", config);
    const url = new URL(res.url);

    expect(url.origin + url.pathname).toBe("https://auth.world.org/api/v1/authorize");
    expect(url.searchParams.get("client_id")).toBe("client_test");
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid");
    expect(url.searchParams.get("state")).toBe("approval-123");
    expect(url.searchParams.get("nonce")).toBe(res.nonce);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("max_age")).toBe("0");
    expect(url.searchParams.get("prompt")).toBe("login");
    expect(url.searchParams.get("acr_values")).toBe("https://world.org/oidc/acr/orb");
  });

  it("derives code_challenge from the returned verifier with S256", () => {
    const res = startStepUp("approval-123", config);
    const challenge = createHash("sha256").update(res.codeVerifier).digest("base64url");

    expect(new URL(res.url).searchParams.get("code_challenge")).toBe(challenge);
    expect(res.codeVerifier.length).toBeGreaterThanOrEqual(43);
  });

  it("uses a new nonce and verifier on every call", () => {
    const a = startStepUp("approval-123", config);
    const b = startStepUp("approval-123", config);

    expect(a.nonce).not.toBe(b.nonce);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
  });

  it("rejects an empty approval id", () => {
    expect(() => startStepUp("", config)).toThrow(/approvalId/);
  });
});
