# World ID Agent Pass: integration debrief (draft)

Required by the prize: time to first success, friction, missing capability or documentation, and the one improvement with the greatest impact. Updated as we build.

**Status:** draft. Fill the TBD fields only after a **measured live** Orb step-up on the real portal (or the hosted callback). Do not invent timings or ACR values. `scripts/world-stepup-live.ts` prints elapsed seconds from start to a validated result when you run it.

## Time to first success

TBD — record after a real live run (your own stopwatch or the script output). Leave blank until then.

## Friction so far

- The prize page links to "World ID Agent Pass Docs" at https://auth.world.org/docs, but the docs never use the name "Agent Pass". They describe World ID sign-in (OIDC) with step-up. We had to infer that these are the same thing, and the mentor was not available to confirm it.
- The docs mention `selfie` acr values, but the discovery document lists only `orb` and `orb-face` under `acr_values_supported`. It is not clear which levels a test account can reach.
- The docs call the redirect a "callback" that must be HTTPS. Whether local development over `http://localhost` works is not stated.
- No SDK or package is named. We used a generic OIDC/JWT library (`jose`) and wrote the PKCE and validation code ourselves.
- Self-service client registration may be limited (`account_not_eligible`).

## Missing capability or documentation

- A worked example of the step-up flow for an agent, with the exact parameters.
- A statement of what a test (fake identity) account returns for `acr`, `amr` and `auth_time`.
- A named package or reference implementation for validating the ID token.

## Highest-impact improvement

TBD after the real live flow you will cite for the prize. Current candidate (until replaced with your measured takeaway): one runnable end-to-end example of step-up for an agent action, including the `acr` a test account receives.

## What the approval does on chain

After World proves a fresh human, the backend signs an EIP-712 `LargePayment` message (vault, invoice, amount, one-time nonce, expiry) with the vault's verifier key. The buyer agent attaches it to `payInvoice`, and `BuyerVault` verifies the signature, the expiry and the nonce itself. A payment above the threshold without it reverts, so the human check is enforced by the contract, not only by our software. Optionally `WORLD_ALLOWED_SUBJECT_HASHES` limits approval to the sponsor's own World identity.

## Honest note

World proves a fresh human authentication. Our server binds it to one agent, action, amount, expiry and single use. Test proofs use fake identities, so we do not claim production security.
