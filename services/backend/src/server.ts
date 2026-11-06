import { buildApp } from "./app.js";

const dbPath = process.env.DB_PATH ?? "agentinvoice.db";
const port = Number(process.env.PORT ?? 3001);

const app = buildApp({ dbPath });
await app.listen({ port, host: "0.0.0.0" });
