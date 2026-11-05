# World ID Agent Pass: notes (task 1.1)

Source: auth.world.org docs and the ETHGlobal World prize page, read once on 2026-11-06 by a web-fetch subagent. Anything marked UNVERIFIED was not fetched or not stated.

## Mentor question (ask in the first 10 minutes)

**Answer: PENDING (ask the World mentor, then write it here).**

Questions to ask:
1. The docs never say "Agent Pass". Is Agent Pass simply World ID sign-in with step-up at auth.world.org, or a different product (AgentKit)?
2. Self-service client registration may be disabled for us. Can the mentor enable our Google account in the portal (`account_not_eligible` otherwise)?
3. Test proofs use fake identities. Does the Orb `acr` still come back for a test account, and what should we request for the demo?
4. Which of the two Agent Pass prizes ($2,500 Continuity only, $5,000) do we qualify for?

## What the docs say

- The docs call the feature "World ID", "World IdP" and "OIDC". "Agent Pass" appears only as a link label on the prize page pointing at https://auth.world.org/docs. AgentKit is NOT FOUND in any page read.
- Step-up (https://auth.world.org/docs/guides/step-up): require recent World ID authentication before a sensitive action, using OIDC `max_age`, `prompt=login` and essential `claims` for `acr`.
- RFC 9470 challenge for agents/API clients: `WWW-Authenticate: Bearer error="insufficient_user_authentication", max_age="300", acr_values="https://world.org/oidc/acr/orb"`. Both client and auth server must support it.

## Endpoints and names (as stated in the docs)

- Issuer: `https://auth.world.org`
- Discovery: `https://auth.world.org/.well-known/openid-configuration` (UNVERIFIED contents, not fetched)
- Authorize: `GET https://auth.world.org/api/v1/authorize`
- Token: `POST https://auth.world.org/api/v1/token`
- Device authorization: `POST https://auth.world.org/api/v1/device_authorization`
- UserInfo and JWKS: read `userinfo_endpoint` and `jwks_uri` from discovery (literal URLs NOT FOUND)
- Authorize params: `client_id`, `redirect_uri`, `response_type=code`, `scope=openid`, `state`, `nonce`, `code_challenge`, `code_challenge_method=S256`
- Step-up params: `max_age` (0 = fresh), `prompt=login`, `prompt=none`, `acr_values`, `claims`
- Token params: `grant_type=authorization_code`, `client_id`, `client_secret`, `code`, `redirect_uri`, `code_verifier`
- PKCE `S256` is required, even for confidential clients.
- Client auth: `client_secret_basic` (portal default), `client_secret_post`, `private_key_jwt`. Fixed for the client's lifetime.
- Callback includes `iss`: require it to equal the issuer exactly before redeeming the code.
- ID token claims: `iss`, `sub`, `aud`, `exp`, `iat`, `jti`, `auth_time`, `acr`, `amr`, `nonce` (browser flow only).
- `acr` values: `https://world.org/oidc/acr/orb`, `.../selfie`, `.../orb-face`, `.../selfie-face`.
- Validation: RS256 signature via `jwks_uri`; `iss` = issuer; `aud` = our client id; `exp`; apply policy to `auth_time`, `acr`, `amr`. Store `(iss, sub)`.
- Unsupported: implicit, hybrid, client credentials, request objects, dynamic client registration.
- SDK or npm package: NOT FOUND (docs say "an OIDC library"). Check npm before choosing one (UNVERIFIED).

## Client registration

1. Sign in with Google at https://auth.world.org/portal (self-service may be limited).
2. Register an HTTPS callback URL (the docs say "callback"; must match scheme, path, query and port exactly; no wildcards). Local dev over plain HTTP is UNVERIFIED, so check whether `http://localhost` is accepted or whether we need a tunnel.
3. Choose client auth method.
4. Keep client id and secret (prefix `worldidp_client_secret_`) only in the backend `.env`.
5. Accepted accounts: Settings, Authenticate, Default accepted accounts (Orb, Selfie Check, or Any).

## Prize requirements (https://ethglobal.com/events/mumbai/prizes/world)

- Official Agent Pass integration; full journey (request, user completion, validated result, protected action).
- A denied, expired, cancelled or failed path where the protected action does NOT happen.
- Validation in a secure backend; never expose secrets or trust an unvalidated client response.
- Short integration debrief: time to first success, friction, missing capability or docs, top improvement (goes in `docs/FEEDBACK_WORLD.md`).
- Judges prefer a meaningful action needing a human identity or approval layer over a plain login screen.
- Prizes: $2,500 (Continuity Track only: 1st $1,500, 2nd $1,000) and $5,000 (1st $2,500, 2nd $1,500, 3rd $1,000), the latter noted "Proofs are using fake identities, DO NOT rely on them for production." Not stated whether the $5,000 one is Continuity-only.

## Fallback

If blocked after two attempts: wallet-signed sponsor approval, drop the World claim, tell Nisarg.
