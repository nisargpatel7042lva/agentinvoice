#!/bin/bash
# Uploads the backend's settings to Parameter Store (encrypted SecureString). Run it yourself:
#   bash deploy/aws/put-secrets.sh path/to/backend.env
# It reads only the variable names the backend uses (config.sh BACKEND_VARS), skips empty ones,
# and never prints a value. Re-run after changing a value, then run deploy.sh to restart.
set -euo pipefail
cd "$(dirname "$0")"
source ./config.sh
FILE="${1:?usage: put-secrets.sh path/to/backend.env}"
[ -f "$FILE" ] || { echo "No such file: $FILE"; exit 1; }

value_of() {
  # Last assignment wins; strips one pair of surrounding quotes. Does not evaluate the file.
  grep -E "^[[:space:]]*(export[[:space:]]+)?$1=" "$FILE" | tail -n1 | sed -E "s/^[[:space:]]*(export[[:space:]]+)?$1=//; s/^\"(.*)\"$/\1/; s/^'(.*)'$/\1/"
}

n=0
for name in $BACKEND_VARS; do
  v=$(value_of "$name" || true)
  [ -z "$v" ] && { echo "skip  $name (not set)"; continue; }
  aws_ ssm put-parameter --name "$SSM_PREFIX/$name" --type SecureString --overwrite --value "$v" >/dev/null
  echo "saved $name"
  n=$((n + 1))
done
echo "$n settings stored under $SSM_PREFIX (region $AWS_REGION)."
