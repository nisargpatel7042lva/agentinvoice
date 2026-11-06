# Shared settings for the AWS scripts. Names only; no secrets live here.
# Git Bash on Windows may not see a freshly installed AWS CLI until a new terminal; add its default location.
command -v aws >/dev/null 2>&1 || export PATH="$PATH:/c/Program Files/Amazon/AWSCLIV2"
export AWS_REGION="${AWS_REGION:-ap-south-1}"          # Mumbai
export APP="invoice-agent-api"
export ECR_REPO="invoice-agent-api"
export INSTANCE_TYPE="${INSTANCE_TYPE:-t3.micro}"      # 2 vCPU, 1 GB; the image is built off the server, so 1 GB is enough to run it
export ROOT_DISK_GB="${ROOT_DISK_GB:-20}"
export SSM_PREFIX="/invoice-agent/api"                 # Parameter Store path for the backend's secrets
export ROLE="invoice-agent-api-ec2"
export SG="invoice-agent-api-web"
export TAG_KEY="app"
export TAG_VAL="invoice-agent-api"

# Every setting the backend reads (services/backend/src). The secret ones go to Parameter Store as SecureString.
export BACKEND_VARS="HEDERA_ACCOUNT_ID HEDERA_PRIVATE_KEY HEDERA_RPC_URL HCS_TOPIC_ID INVOICE_MARKET_ADDRESS SUPPLIER_PRIVATE_KEY INDEXER_START_BLOCK SEPOLIA_RPC_URL ENS_PUBLISHER_KEY ENS_RESOLVER_ADDRESS ENS_AGENT_NAME WORLD_CLIENT_ID WORLD_CLIENT_SECRET DEMO_VAULT_ADDRESS ATS_BOND_ADDRESS APPROVAL_TTL_SECONDS SAUCERSWAP_STATUS SAUCERSWAP_OPERATOR_ACCOUNT_ID"

aws_() { aws --region "$AWS_REGION" "$@"; }
account_id() { aws_ sts get-caller-identity --query Account --output text; }
ecr_uri() { echo "$(account_id).dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"; }
instance_id() {
  aws_ ec2 describe-instances \
    --filters "Name=tag:${TAG_KEY},Values=${TAG_VAL}" "Name=instance-state-name,Values=pending,running,stopped" \
    --query "Reservations[0].Instances[0].InstanceId" --output text
}
