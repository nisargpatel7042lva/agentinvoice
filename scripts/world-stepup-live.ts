// Runs one real World ID step-up against auth.world.org (task 1.6).
// Usage: bun scripts/world-stepup-live.ts   (bun loads .env automatically)
// Needs WORLD_CLIENT_ID, WORLD_CLIENT_SECRET, WORLD_REDIRECT_URI in .env.
// WORLD_REDIRECT_URI must be registered in the World portal. If it is an https tunnel,
// set WORLD_LISTEN_PORT to the local port the tunnel forwards to (default 8788).
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { handleCallback, remoteWorldKeys, StepUpError, type PendingStepUp } from "../services/backend/src/world/callback.js";
import { startStepUp, stepUpConfigFromEnv } from "../services/backend/src/world/stepup.js";

const { clientId, redirectUri } = stepUpConfigFromEnv();
const clientSecret = process.env.WORLD_CLIENT_SECRET;
if (!clientSecret) throw new Error("Missing env: WORLD_CLIENT_SECRET");

const callbackPath = new URL(redirectUri).pathname;
const port = Number(process.env.WORLD_LISTEN_PORT || new URL(redirectUri).port || 8788);

const approvalId = randomUUID();
const started = startStepUp(approvalId, { clientId, redirectUri });
const pending: PendingStepUp = {
  nonce: started.nonce,
  codeVerifier: started.codeVerifier,
  expiresAt: Math.floor(Date.now() / 1000) + 600,
  consumed: false,
};
const t0 = Date.now();
const keys = remoteWorldKeys();

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", redirectUri);
  if (url.pathname !== callbackPath) {
    res.writeHead(404).end();
    return;
  }
  try {
    const result = await handleCallback(
      {
        code: url.searchParams.get("code") ?? undefined,
        state: url.searchParams.get("state") ?? undefined,
        iss: url.searchParams.get("iss") ?? undefined,
        error: url.searchParams.get("error") ?? undefined,
      },
      {
        config: { clientId, clientSecret, redirectUri },
        getPending: (state) => (state === approvalId ? pending : undefined),
        consume: () => {
          pending.consumed = true;
        },
        getKey: keys,
      },
    );
    const subjectHash = createHash("sha256").update(`${result.issuer}:${result.subject}`).digest("hex").slice(0, 16);
    console.log("VALIDATED. subject hash:", subjectHash, "acr:", result.acr, "auth_time:", result.authTime);
    console.log("seconds from start to validated result:", Math.round((Date.now() - t0) / 1000));
    res.writeHead(200, { "content-type": "text/plain" }).end("World step-up validated. You can close this tab.");
  } catch (err) {
    const code = err instanceof StepUpError ? err.code : "internal_error";
    console.log("REJECTED:", code, err instanceof Error ? err.message : "");
    res.writeHead(400, { "content-type": "text/plain" }).end(`Step-up rejected: ${code}`);
  }
  server.close();
});

server.listen(port, () => {
  console.log(`Listening on port ${port}, callback path ${callbackPath}`);
  console.log("Open this URL in your browser and sign in with World ID:\n");
  console.log(started.url, "\n");
});

setTimeout(() => {
  console.log("Timed out after 5 minutes without a callback.");
  process.exit(1);
}, 5 * 60 * 1000).unref();
