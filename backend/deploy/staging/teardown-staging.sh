#!/usr/bin/env bash
# Removes ALL staging AWS resources created by deploy-staging.sh (staging names/tags only). Stops all
# AWS staging cost except the kept secret ($0.40/mo). Kept: secret flacronai/staging/app, IAM role
# flacronai-staging-ec2, budget, Firebase project flacronai-staging-qa (delete separately).
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*"  # Git Bash: do not rewrite /aws/..., /flacronai/... args into Windows paths
set -euo pipefail
AWS="${AWS_CLI:-aws}"; PROFILE="${AWS_PROFILE_NAME:-flacron-qa}"; REGION="us-east-1"
a() { "$AWS" "$@" --profile "$PROFILE" --region "$REGION"; }
ACCOUNT="$(a sts get-caller-identity --query Account --output text | tr -d '\r')"
IID="$(a ec2 describe-instances --filters Name=tag:Name,Values=flacronai-backend-staging Name=instance-state-name,Values=pending,running,stopping,stopped \
  --query 'Reservations[0].Instances[0].InstanceId' --output text | tr -d '\r')"
if [ "$IID" != None ]; then a ec2 terminate-instances --instance-ids "$IID" >/dev/null; a ec2 wait instance-terminated --instance-ids "$IID"; fi
EIP="$(a ec2 describe-addresses --filters Name=tag:Name,Values=flacronai-backend-staging --query 'Addresses[0].AllocationId' --output text | tr -d '\r')"
[ "$EIP" != None ] && a ec2 release-address --allocation-id "$EIP" || true
SG="$(a ec2 describe-security-groups --filters Name=group-name,Values=flacronai-staging-web --query 'SecurityGroups[0].GroupId' --output text | tr -d '\r')"
[ "$SG" != None ] && a ec2 delete-security-group --group-id "$SG" || true
a s3 rb "s3://flacronai-staging-build-$ACCOUNT" --force >/dev/null 2>&1 || true
a logs delete-log-group --log-group-name /flacronai/staging/backend 2>/dev/null || true
echo "Staging AWS resources removed. Kept: secret, IAM role, budget, Firebase staging project."
