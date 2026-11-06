#!/bin/bash
# Runs ON the EC2 server (sent by deploy.sh through SSM). Pulls the latest image and restarts the backend and Caddy.
# Secrets are read from Parameter Store into /opt/invoice-agent/api.env (root-only), never written to the image.
set -euo pipefail
REGION="$1"; IMAGE="$2"; HOST="$3"; SSM_PREFIX="$4"; APP_URL="$5"
BASE=/opt/invoice-agent
mkdir -p "$BASE/data" "$BASE/caddy-data" "$BASE/caddy-config"

# 1. Secrets -> env file (600). Parameter names are the variable names.
umask 077
aws ssm get-parameters-by-path --region "$REGION" --path "$SSM_PREFIX" --with-decryption \
  --query "Parameters[].[Name,Value]" --output text |
  while IFS=$'\t' read -r name value; do printf '%s=%s\n' "${name##*/}" "$value"; done > "$BASE/api.env.new"
{
  echo "NODE_ENV=production"
  echo "PORT=3001"
  echo "DB_PATH=/data/agentinvoice.db"
  echo "APP_URL=$APP_URL"
  echo "WORLD_REDIRECT_URI=https://$HOST/api/world/callback"
} >> "$BASE/api.env.new"
mv "$BASE/api.env.new" "$BASE/api.env"
umask 022

# 2. Caddy: automatic HTTPS for the sslip.io host, proxying to the backend.
cat > "$BASE/Caddyfile" <<EOF
$HOST {
  encode gzip
  reverse_proxy api:3001
}
EOF

# 3. Pull the new image (the instance role can read ECR) and restart.
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${IMAGE%%/*}" >/dev/null
docker pull "$IMAGE"
docker network inspect ia >/dev/null 2>&1 || docker network create ia >/dev/null

docker rm -f api >/dev/null 2>&1 || true
docker run -d --name api --network ia --restart unless-stopped \
  --env-file "$BASE/api.env" -v "$BASE/data:/data" \
  --log-opt max-size=10m --log-opt max-file=3 \
  "$IMAGE"

if ! docker ps --format '{{.Names}}' | grep -qx caddy; then
  docker rm -f caddy >/dev/null 2>&1 || true
  docker run -d --name caddy --network ia --restart unless-stopped -p 80:80 -p 443:443 \
    -v "$BASE/Caddyfile:/etc/caddy/Caddyfile:ro" -v "$BASE/caddy-data:/data" -v "$BASE/caddy-config:/config" \
    caddy:2.8.4
else
  docker exec caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null
fi

docker image prune -f >/dev/null
for i in $(seq 1 30); do
  if docker exec api node -e "fetch('http://127.0.0.1:3001/api/invoices').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    echo "backend healthy"; exit 0
  fi
  sleep 2
done
echo "backend did not become healthy"; docker logs --tail 40 api; exit 1
