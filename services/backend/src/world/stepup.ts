import { createHash, randomBytes } from "node:crypto";

// Endpoints and parameter names verified against https://auth.world.org/.well-known/openid-configuration
// (see docs/notes/world-agentpass.md).
export const WORLD_ISSUER = "https://auth.world.org";
export const WORLD_AUTHORIZE_URL = `${WORLD_ISSUER}/api/v1/authorize`;
export const WORLD_ACR_ORB = "https://world.org/oidc/acr/orb";

export interface StepUpConfig {
  clientId: string;
  redirectUri: string;
}

export interface StepUpStart {
  url: string;
  state: string;
  nonce: string;
  // The caller must keep these server-side with the approval; the browser never sees them.
  codeVerifier: string;
}

function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function stepUpConfigFromEnv(env: NodeJS.ProcessEnv = process.env): StepUpConfig {
  const clientId = env.WORLD_CLIENT_ID;
  const redirectUri = env.WORLD_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new Error("Missing env: WORLD_CLIENT_ID and WORLD_REDIRECT_URI are required");
  }
  return { clientId, redirectUri };
}

// Builds the World ID authorization URL that forces a fresh authentication (max_age=0, prompt=login)
// at the orb level, with PKCE S256. state carries the approval id so the callback can find the approval.
export function startStepUp(approvalId: string, config: StepUpConfig): StepUpStart {
  if (!approvalId) throw new Error("approvalId is required");

  const nonce = randomToken();
  const codeVerifier = randomToken(32);
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

  const url = new URL(WORLD_AUTHORIZE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid");
  url.searchParams.set("state", approvalId);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("max_age", "0");
  url.searchParams.set("prompt", "login");
  url.searchParams.set("acr_values", WORLD_ACR_ORB);

  return { url: url.toString(), state: approvalId, nonce, codeVerifier };
}
