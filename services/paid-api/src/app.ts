// The paid API is the Express x402 app in expressApp.ts (GET /ping, GET /score), run by server.ts.
// The earlier Fastify /score accepted any header containing "x402" and returned a hard-coded score; it is gone.
export { buildPaidExpressApp, type PaidExpressConfig } from "./expressApp.js";
// Band rules live in @invoiceagent/shared so the website and this API always agree.
export { computeBand } from "@invoiceagent/shared";
