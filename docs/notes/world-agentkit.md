# World AgentKit: notes (AgentKit prompt, step 1)

Sources: docs.world.org/agents/agent-kit/{integrate, sdk-reference}, github.com/worldcoin/agentkit (README, cli/REGISTRATION.md), and the installed npm packages `@worldcoin/agentkit@0.2.1` and `@worldcoin/agentkit-core@0.2.1` (types and source read directly in node_modules, so names below are VERIFIED from the package unless marked). Read once on 2026-11-06.

## Status warning

- The GitHub repo `worldcoin/agentkit` says it was archived and is read-only (archived on 2026-10-20 per the page). The docs site still documents AgentKit as "Beta".
- AgentKit is an extension of x402 that lets a site tell human-backed agents from bots. It is not the auth.world.org step-up flow (see `world-agentpass.md`). Whether the Agent Pass prize means AgentKit or the step-up is still UNVERIFIED until a World mentor answers.

## What AgentKit proves (honest note)

AgentKit proves that an agent wallet is registered to a unique, World ID-verified human. It does NOT approve any single action. Our approval service binds agent, action, amount, expiry and single use.

## Packages and versions

- `@worldcoin/agentkit` 0.2.1 (re-exports `@worldcoin/agentkit-core` 0.2.1, depends on `@x402/core`).
- `@worldcoin/agentkit-cli` 0.2.0, binary `agentkit`.

## Verified exports (from the installed types)

- `AGENTKIT = "agentkit"`: the extension name and the HTTP header name (`headers.get(AGENTKIT)`).
- `parseAgentkitHeader(header: string): AgentkitPayload`: base64 JSON, validated with zod. Throws on bad base64, bad JSON or schema mismatch.
- `AgentkitPayload` fields: `domain, address, statement?, uri, version, chainId, type ("eip191" | "eip1271" | "ed25519"), nonce, issuedAt, expirationTime?, notBefore?, requestId?, resources?, signatureScheme?, signature`.
- `validateAgentkitMessage(payload, expectedResourceUri, { maxAge?, checkNonce? }): Promise<{ valid, error? }>`. Checks domain, uri host, `issuedAt` age (`maxAge` in ms), expiry, `notBefore`. `checkNonce(nonce)` must return `true` when the nonce is acceptable; `false` produces "Nonce validation failed (possible replay attack)" (verified in source).
- `verifyAgentkitSignature(payload, rpcUrlOrOptions?): Promise<{ valid, address?, error? }>`. For `eip155:*` chains it uses viem `verifyMessage` on a public client (default public RPC for the signed chain unless `rpcUrl` or `rpcUrls[chainId]` is given).
- `createAgentBookVerifier({ client?, contractAddress?, rpcUrl? }): { lookupHuman(address): Promise<string | null> }`. Always queries AgentBook on World Chain (eip155:480). Returns `null` for unregistered wallets and on lookup failure.
- `AgentKitStorage` interface: `tryIncrementUsage(endpoint, humanId, limit)`, optional `hasUsedNonce(nonce)`, `recordNonce(nonce)`. `InMemoryAgentKitStorage` implements it.
- Client side: `createAgentkitClient({ signer, fetch?, onEvent? })` returns `{ fetch, createHeader(extension) }`. `AgentkitSigner = { address, chainId, type, signMessage(message) }`.
- Server side: `createAgentkitHooks`, `declareAgentkitExtension`, `agentkitResourceServerExtension` (x402 integration; we do not use them, we verify headers directly).
- Helpers: `formatSIWEMessage(info, address)` builds the signed SIWE message from payload fields.

## Chain

- AgentBook canonical deployment: World Chain mainnet (eip155:480), `0xA23aB2712eA7BBa896930544C7d6636a96b944dA` per the SDK reference.
- CONFLICT: `cli/REGISTRATION.md` lists Base `0xE1D1D3526A6FAa37eb36bD10B933C1b77f4561a4` and Base Sepolia `0xA23aB2712eA7BBa896930544C7d6636a96b944dA`, and says registration is gasless through a hosted relay. Confirm the target chain before relying on it.
- Our demo runs on Hedera testnet, but `lookupHuman` always reads World Chain. The agent wallet that signs must be registered there.

## Registration (CLI)

- `npx @worldcoin/agentkit-cli register <agent-address>` and `... status <agent-address>`.
- Flags: `--network <base|base-sepolia>`, `--manual` (print call data instead of submitting), `--auto` (submit via relay). `API_URL` env overrides the relay. Relay: https://x402-worldchain.vercel.app.
- It needs a wallet address for the agent and World App on a phone: the CLI shows a QR code and deep link, then returns a proof for `register(address agent, uint256 root, uint256 nonce, uint256 nullifierHash, uint256[8] proof)`.
- UNVERIFIED: any IDKit steps beyond the World App QR flow. Ask the World mentor, do not guess.

## Tests

No SDK test helpers exist (NOT FOUND). In `agentkit.test.ts` the header and signature are real (built with viem and the SDK's own `formatSIWEMessage`, checked by the SDK's own parse, validate and signature functions). Only the AgentBook lookup is mocked, because it needs World Chain and a registered wallet.

## Status of the register script (2026-11-06)

- `scripts/register-agent.ts` wraps `npx @worldcoin/agentkit-cli register <address>` and then calls `lookupHuman`. The read-only `--status` mode ran against World Chain and returned null for the demo agent `0x950Cbdd2D314054097E71e5585584Ab66A1B9942`. A null is also what the SDK returns on a failed lookup, so null alone cannot tell "not registered" from "RPC failed".
- The real registration has NOT been run. It needs World App on a phone to scan the QR code, which the AI cannot do. BLOCKER: Siddharth must run `bun scripts/register-agent.ts` and scan the code. Run `bun scripts/register-agent.ts --status` afterwards to confirm.
