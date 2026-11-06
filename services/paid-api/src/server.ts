import { buildPaidApp } from "./app.js";

const port = Number(process.env.PAID_API_PORT || 4020);
const host = process.env.HOST || "0.0.0.0";

const app = buildPaidApp();

app.listen({ port, host }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`[paid-api] x402 score server listening on ${address}`);
});

