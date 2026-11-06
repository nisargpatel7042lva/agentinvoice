# Approval service and ENS publisher: notes (Phase 3)

## Approval service (spec v2)

- States: pending, approved, rejected, expired (`src/approval/machine.ts`; rejected and expired are terminal; an unused approved approval can still expire).
- `POST /api/approvals {invoiceId}` -> `{ approvalId, authorizationUrl }` (201). The vault and amount are read from the invoice, never from the client. 404 unknown invoice, 409 Paid/Defaulted invoice, 400 bad body, 503 when WORLD_* env is missing. approvalId is a random UUID used as the OIDC `state`.
- `GET /api/world/callback` runs `handleCallback` (PKCE, nonce, fresh `auth_time`, `orb` acr), then approves or rejects and redirects 302 to `APP_URL/approval/<id>?result=approved|rejected|expired|error&code=<error code>`. Cancel, bad token, wrong nonce, stale authentication and wrong acr reject the approval for good; a replayed callback changes nothing. Only the hash of (issuer:subject) is stored.
- `GET /api/approvals/:id` -> shared `Approval`. Approvals expire on read, by a 30 s sweep, and after `APPROVAL_TTL_SECONDS` (default 600).
- Single use: `consumeApproval(db, id, {invoiceId, amount}, now)` with distinct errors not_found, not_approved, expired, replay, wrong_invoice, oversize; a failed attempt does not burn the approval. It is an internal function: spec v2 has no route that calls it, and BuyerVault.payInvoice has no approval argument. How the vault enforces the World approval on-chain is undecided (ask Nisarg and Mann).
- NOT built because spec v2 does not define them: EIP-712 attestations (no domain or types are frozen), demo-control endpoints, deny route (denying is cancelling at World).
- Honest note: World proves a fresh human authentication; this server binds it to one invoice, vault, maximum amount, expiry and single use. Test proofs use fake identities.
- Not verified live: the real World flow (needs the portal client, task 1.6).

## ENS publisher

- `src/ens/publisher.ts`: `buildRecords` (paid, late = Late + Defaulted, status; a sponsor-set `paused` is kept unless an invoice defaulted), `publishRecords` (reads first, writes only changed keys, 3 attempts per read/write, never throws on network errors, refuses any key except paid, late, status), `createEnsPublisher` (publishes at start, on every indexed change, and every 60 s). Seed rows never count.
- `src/ens/live.ts`: real Sepolia reads and writes through the permissioned resolver with the publisher wallet. The server starts it only when ENS_PUBLISHER_KEY, ENS_RESOLVER_ADDRESS, ENS_AGENT_NAME and DEMO_VAULT_ADDRESS are set.
- Verified live on Sepolia: `publish-live.ts paid=1 status=active` wrote only `paid` (status unchanged, so no transaction), `readAgentFromEns` returned paid 1, `limit=999` is refused before any transaction, then paid was reset to 0.
- On a default the publisher writes status `defaulted`. Revoking or expiring the subname is a sponsor action (`bun scripts/ens/revoke.ts`), not done by the backend, so the backend never holds the sponsor key.
