#!/bin/bash
# One-time setup of the backend's AWS resources. Safe to re-run: existing pieces are reused.
#   bash deploy/aws/provision.sh
# Creates: an ECR repository, an IAM role for the server (pull images, read its own secrets, SSM access),
# a security group open on 80/443 only, one EC2 instance (Amazon Linux 2023) and an Elastic IP.
set -euo pipefail
cd "$(dirname "$0")"
source ./config.sh
ACCOUNT=$(account_id)
echo "Account $ACCOUNT, region $AWS_REGION"

# ECR repository (private, scan on push).
aws_ ecr describe-repositories --repository-names "$ECR_REPO" >/dev/null 2>&1 ||
  aws_ ecr create-repository --repository-name "$ECR_REPO" --image-scanning-configuration scanOnPush=true >/dev/null
echo "ECR: $(ecr_uri)"

# IAM role + instance profile.
if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE" --assume-role-policy-document '{
    "Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
  aws iam attach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
fi
aws iam put-role-policy --role-name "$ROLE" --policy-name read-own-secrets --policy-document "{
  \"Version\":\"2012-10-17\",\"Statement\":[
    {\"Effect\":\"Allow\",\"Action\":[\"ssm:GetParametersByPath\",\"ssm:GetParameters\"],\"Resource\":\"arn:aws:ssm:${AWS_REGION}:${ACCOUNT}:parameter${SSM_PREFIX}*\"},
    {\"Effect\":\"Allow\",\"Action\":\"kms:Decrypt\",\"Resource\":\"*\",\"Condition\":{\"StringEquals\":{\"kms:ViaService\":\"ssm.${AWS_REGION}.amazonaws.com\"}}}]}"
if ! aws iam get-instance-profile --instance-profile-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-instance-profile --instance-profile-name "$ROLE" >/dev/null
  aws iam add-role-to-instance-profile --instance-profile-name "$ROLE" --role-name "$ROLE"
  sleep 10 # IAM is eventually consistent
fi

# Security group in the default VPC: HTTP/HTTPS only, no SSH (we use SSM).
VPC=$(aws_ ec2 describe-vpcs --filters Name=isDefault,Values=true --query "Vpcs[0].VpcId" --output text)
SG_ID=$(aws_ ec2 describe-security-groups --filters "Name=group-name,Values=$SG" "Name=vpc-id,Values=$VPC" --query "SecurityGroups[0].GroupId" --output text)
if [ "$SG_ID" = "None" ]; then
  SG_ID=$(aws_ ec2 create-security-group --group-name "$SG" --description "Invoice Agent backend: 80/443 only" --vpc-id "$VPC" --query GroupId --output text)
  aws_ ec2 authorize-security-group-ingress --group-id "$SG_ID" --ip-permissions \
    'IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0}]' \
    'IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0}]' >/dev/null
fi
echo "Security group: $SG_ID"

# The instance.
ID=$(instance_id)
if [ "$ID" = "None" ]; then
  AMI=$(aws_ ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 --query Parameter.Value --output text)
  ID=$(aws_ ec2 run-instances --image-id "$AMI" --instance-type "$INSTANCE_TYPE" \
    --iam-instance-profile Name="$ROLE" --security-group-ids "$SG_ID" \
    --user-data file://server/user-data.sh \
    --metadata-options HttpTokens=required,HttpEndpoint=enabled \
    --block-device-mappings "[{\"DeviceName\":\"/dev/xvda\",\"Ebs\":{\"VolumeSize\":${ROOT_DISK_GB},\"VolumeType\":\"gp3\",\"Encrypted\":true,\"DeleteOnTermination\":false}}]" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=$TAG_KEY,Value=$TAG_VAL},{Key=Name,Value=$APP}]" \
    --query "Instances[0].InstanceId" --output text)
  echo "Started instance $ID, waiting for it to run…"
  aws_ ec2 wait instance-running --instance-ids "$ID"
fi
echo "Instance: $ID"

# Elastic IP, so the address (and the sslip.io host) never changes.
EIP=$(aws_ ec2 describe-addresses --filters "Name=tag:$TAG_KEY,Values=$TAG_VAL" --query "Addresses[0].PublicIp" --output text)
if [ "$EIP" = "None" ]; then
  ALLOC=$(aws_ ec2 allocate-address --domain vpc --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=$TAG_KEY,Value=$TAG_VAL}]" --query AllocationId --output text)
  aws_ ec2 associate-address --instance-id "$ID" --allocation-id "$ALLOC" >/dev/null
  EIP=$(aws_ ec2 describe-addresses --allocation-ids "$ALLOC" --query "Addresses[0].PublicIp" --output text)
fi
echo "Public IP: $EIP"
echo "Backend URL: https://${EIP//./-}.sslip.io"
