#!/bin/bash
# Build the backend image, push it to ECR, and restart it on the EC2 server through SSM.
#   bash deploy/aws/deploy.sh
# Needs Docker running locally and an AWS CLI login. Run provision.sh once first.
set -euo pipefail
cd "$(dirname "$0")"
source ./config.sh
ROOT="$(cd ../.. && pwd)"
URI=$(ecr_uri)
SHA=$(git -C "$ROOT" rev-parse --short HEAD)
APP_URL="${APP_URL:-https://invoice-agent-zeta.vercel.app}"

ID=$(instance_id)
[ "$ID" != "None" ] || { echo "No server yet. Run provision.sh first."; exit 1; }
EIP=$(aws_ ec2 describe-addresses --filters "Name=tag:$TAG_KEY,Values=$TAG_VAL" --query "Addresses[0].PublicIp" --output text)
HOST="${EIP//./-}.sslip.io"

echo "Building $URI:$SHA"
docker build -f "$ROOT/services/backend/Dockerfile" -t "$URI:$SHA" -t "$URI:latest" "$ROOT"
aws_ ecr get-login-password | docker login --username AWS --password-stdin "${URI%%/*}" >/dev/null
docker push -q "$URI:$SHA"
docker push -q "$URI:latest"

echo "Restarting on $ID ($HOST)"
SCRIPT=$(base64 -w0 < server/run.sh)
CMD_ID=$(aws_ ssm send-command --instance-ids "$ID" --document-name AWS-RunShellScript \
  --comment "deploy $SHA" \
  --parameters "commands=[\"echo $SCRIPT | base64 -d > /tmp/run.sh\",\"bash /tmp/run.sh $AWS_REGION $URI:$SHA $HOST $SSM_PREFIX $APP_URL\"]" \
  --query Command.CommandId --output text)
for i in $(seq 1 120); do
  ST=$(aws_ ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$ID" --query Status --output text 2>/dev/null || echo Pending)
  case "$ST" in Success|Failed|Cancelled|TimedOut) break ;; esac
  sleep 5
done
aws_ ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$ID" \
  --query "{status:Status,out:StandardOutputContent,err:StandardErrorContent}" --output text | tail -n 30

echo "Check: https://$HOST/api/invoices"
