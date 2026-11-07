import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { WORLD_ACR_ORB, WORLD_ISSUER } from "./stepup.js";

export const WORLD_TOKEN_URL = `${WORLD_ISSUER}/api/v1/token`;
export const WORLD_JWKS_URL = `${WORLD_ISSUER}/.well-known/jwks.json`;

export type StepUpErrorCode =
  | "user_cancelled"
  | "provider_error"
  | "missing_params"
  | "unknown_state"
  | "approval_expired"
  | "state_reused"
  | "issuer_mismatch"
  | "token_exchange_failed"
  | "invalid_token"
  | "nonce_mismatch"
  | "stale_authentication"
  | "insufficient_acr";

export class StepUpError extends Error {
  constructor(
    readonly code: StepUpErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StepUpError";
  }
}

// What the approval service stored when it called startStepUp.
export interface PendingStepUp {
  nonce: string;
  codeVerifier: string;
  expiresAt: number; // unix seconds
  consumed: boolean;
}

export interface CallbackConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  maxAuthAgeSeconds?: number; // default 300
  requiredAcr?: string; // default orb
}

export interface CallbackContext {
  config: CallbackConfig;
  getPending(state: string): PendingStepUp | undefined;
  consume(state: string): void;
  getKey: JWTVerifyGetKey;
  fetchImpl?: typeof fetch;
  now?: () => number; // unix seconds
}

export interface CallbackInput {
  code?: string;
  state?: string;
  iss?: string;
  error?: string;
}

export interface VerifiedStepUp {
  subject: string;
  issuer: string;
  authTime: number;
  acr: string;
}

const CLOCK_SKEW_SECONDS = 60;

export function remoteWorldKeys(): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(WORLD_JWKS_URL));
}

// Validates the World ID callback. Throws StepUpError on every failure, so a caller that only
// continues after this resolves can never run the protected action on a failed, cancelled,
// expired or replayed step-up.
export async function handleCallback(input: CallbackInput, ctx: CallbackContext): Promise<VerifiedStepUp> {
  const now = ctx.now ?? (() => Math.floor(Date.now() / 1000));
  const { config } = ctx;

  const pendingForState = input.state ? ctx.getPending(input.state) : undefined;

  if (input.error) {
    // The user cancelled or World refused: burn the approval so this callback cannot be retried.
    if (input.state && pendingForState && !pendingForState.consumed) ctx.consume(input.state);
    throw new StepUpError(
      input.error === "access_denied" ? "user_cancelled" : "provider_error",
      `World returned error: ${input.error}`,
    );
  }

  if (!input.code || !input.state) throw new StepUpError("missing_params", "code and state are required");

  const pending = pendingForState;
  if (!pending) throw new StepUpError("unknown_state", "no pending step-up for this state");
  if (pending.consumed) throw new StepUpError("state_reused", "this step-up was already used");
  if (pending.expiresAt <= now()) throw new StepUpError("approval_expired", "the approval has expired");

  // Single use: consume before any network call so a failure or a replay cannot reuse the state.
  ctx.consume(input.state);

  if (input.iss !== WORLD_ISSUER) throw new StepUpError("issuer_mismatch", "callback iss does not match World");

  const idToken = await exchangeCode(input.code, pending.codeVerifier, ctx);

  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, ctx.getKey, {
      issuer: WORLD_ISSUER,
      audience: config.clientId,
      algorithms: ["RS256"],
      currentDate: new Date(now() * 1000),
    }));
  } catch (err) {
    throw new StepUpError("invalid_token", `ID token rejected: ${(err as Error).message}`);
  }

  if (!payload.sub) throw new StepUpError("invalid_token", "ID token has no sub");
  if (payload.nonce !== pending.nonce) throw new StepUpError("nonce_mismatch", "nonce does not match");

  const authTime = payload.auth_time;
  const maxAge = config.maxAuthAgeSeconds ?? 300;
  if (typeof authTime !== "number" || now() - authTime > maxAge || authTime > now() + CLOCK_SKEW_SECONDS) {
    throw new StepUpError("stale_authentication", "authentication is not recent enough");
  }

  const acr = typeof payload.acr === "string" ? payload.acr : "";
  if (acr !== (config.requiredAcr ?? WORLD_ACR_ORB)) {
    throw new StepUpError("insufficient_acr", "authentication level is below the required level");
  }

  return { subject: payload.sub, issuer: WORLD_ISSUER, authTime, acr };
}

async function exchangeCode(code: string, codeVerifier: string, ctx: CallbackContext): Promise<string> {
  const { config } = ctx;
  const doFetch = ctx.fetchImpl ?? fetch;
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");

  let res: Response;
  try {
    res = await doFetch(WORLD_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${basic}` },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: config.redirectUri,
        code_verifier: codeVerifier,
      }).toString(),
    });
  } catch {
    throw new StepUpError("token_exchange_failed", "token endpoint unreachable");
  }

  if (!res.ok) {
    // Only World's own OAuth error fields (for example invalid_client, invalid_grant), never the request, so the log says why without leaking anything.
    const why = await res.json().then((b: { error?: unknown; error_description?: unknown }) => [b.error, b.error_description].filter((x) => typeof x === "string").join(": ").slice(0, 160)).catch(() => "");
    throw new StepUpError("token_exchange_failed", `token endpoint returned ${res.status}${why ? ` (${why})` : ""}`);
  }
  const body = (await res.json()) as { id_token?: unknown };
  if (typeof body.id_token !== "string") throw new StepUpError("token_exchange_failed", "no id_token in response");
  return body.id_token;
}
