# World ID Agent Pass: integration debrief (draft)

Required by the prize: time to first success, friction, missing capability or documentation, and the one improvement with the greatest impact. Updated as we build.

## Time to first success

TBD. The real step-up flow (task 1.6) has not run yet. `scripts/world-stepup-live.ts` prints the seconds from start to a validated result.

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

TBD after the real flow runs. Current candidate: one runnable end-to-end example of step-up for an agent action, including the `acr` a test account receives.

## Honest note

World proves a fresh human authentication. Our server binds it to one agent, action, amount, expiry and single use. Test proofs use fake identities, so we do not claim production security.
