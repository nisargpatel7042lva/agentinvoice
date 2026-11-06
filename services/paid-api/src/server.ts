import { buildPaidExpressApp } from "./expressApp.js";

const port = Number(process.env.PAID_API_PORT || 4020);
const host = process.env.HOST || "0.0.0.0";

const app = buildPaidExpressApp();

app.listen(port, host, () => {
  console.log(`[paid-api] x402 Express server listening on http://${host}:${port}`);
});
