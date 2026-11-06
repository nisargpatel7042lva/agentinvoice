# Invoice Agent backend (Sidd's Fastify + SQLite service). Build from the repo root:
#   fly deploy --config services/backend/fly.toml
# Runs under Node (better-sqlite3 crashes Bun 1.3.x); Bun is only used to install the workspace.
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g bun@1.3.14

WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --filter @invoiceagent/backend --filter @invoiceagent/shared --filter invoiceagent

ENV NODE_ENV=production \
    PORT=3001 \
    DB_PATH=/data/agentinvoice.db
EXPOSE 3001
CMD ["node_modules/.bin/tsx", "services/backend/src/server.ts"]
