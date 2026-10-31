#!/usr/bin/env bash
# READ-ONLY prerequisite check for the EC2 staging plan. Creates nothing: every mutating call uses
# --dry-run (AWS answers "DryRunOperation" = would be allowed, "UnauthorizedOperation" = denied).
# Usage: AWS_CLI="/c/Program Files/Amazon/AWSCLIV2/aws.exe" bash verify-staging-prereqs.sh
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*"  # Git Bash: do not rewrite /aws/..., /flacronai/... args into Windows paths
set -uo pipefail
AWS="${AWS_CLI:-aws}"; PROFILE="${AWS_PROFILE_NAME:-flacron-qa}"; REGION="us-east-1"
a() { "$AWS" "$@" --profile "$PROFILE" --region "$REGION"; }
ok() { printf '  [ok]   %s\n' "$*"; }; no() { printf '  [FAIL] %s\n' "$*"; }; info() { printf '  [info] %s\n' "$*"; }
dry() { # dry <label> <aws args...>
  local label="$1"; shift; local out; out="$(a "$@" --dry-run 2>&1)"
  if grep -q DryRunOperation <<<"$out"; then ok "$label allowed"; else no "$label: $(grep -oE '(UnauthorizedOperation|AccessDenied|InvalidParameter[A-Za-z]*|[A-Za-z]+Exception)[^.]*' <<<"$out" | head -1)"; fi
}

echo "== Identity / ownership"
ACCOUNT="$(a sts get-caller-identity --query Account --output text 2>/dev/null | tr -d '\r')"
[ "$ACCOUNT" = "${STAGING_AWS_ACCOUNT_ID:?set STAGING_AWS_ACCOUNT_ID}" ] && ok "account $STAGING_AWS_ACCOUNT_ID" || { no "not logged in to $STAGING_AWS_ACCOUNT_ID (run: aws login --profile $PROFILE)"; exit 1; }
ORG="$(a organizations describe-organization --query 'Organization.[Id,MasterAccountId]' --output text 2>&1 | tr -d '\r')"
info "organization: ${ORG:-none} (if MasterAccountId != $STAGING_AWS_ACCOUNT_ID, cost-tag activation happens in that payer account)"

echo "== Network (default VPC, internet access, public IPs)"
VPC="$(a ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text | tr -d '\r')"
[ "$VPC" != None ] && ok "default VPC $VPC" || no "no default VPC"
IGW="$(a ec2 describe-internet-gateways --filters Name=attachment.vpc-id,Values="$VPC" --query 'InternetGateways[0].InternetGatewayId' --output text | tr -d '\r')"
[ "$IGW" != None ] && ok "internet gateway $IGW" || no "no internet gateway on default VPC"
SUBNET="$(a ec2 describe-subnets --filters Name=vpc-id,Values="$VPC" Name=default-for-az,Values=true Name=availability-zone,Values=us-east-1a --query 'Subnets[0].[SubnetId,MapPublicIpOnLaunch]' --output text | tr -d '\r')"
info "subnet us-east-1a: $SUBNET"
RT="$(a ec2 describe-route-tables --filters Name=vpc-id,Values="$VPC" Name=association.main,Values=true --query "RouteTables[0].Routes[?DestinationCidrBlock=='0.0.0.0/0'].GatewayId | [0]" --output text | tr -d '\r')"
[[ "$RT" == igw-* ]] && ok "main route table 0.0.0.0/0 -> $RT" || no "no 0.0.0.0/0 route to an internet gateway ($RT)"
EIPS="$(a ec2 describe-addresses --query 'length(Addresses)' --output text | tr -d '\r')"
EIPQ="$(a service-quotas get-service-quota --service-code ec2 --quota-code L-0263D0A3 --query 'Quota.Value' --output text 2>/dev/null | tr -d '\r')"
info "Elastic IPs in use: $EIPS / quota ${EIPQ:-unknown (default 5)}"
VCPUQ="$(a service-quotas get-service-quota --service-code ec2 --quota-code L-1216C47A --query 'Quota.Value' --output text 2>/dev/null | tr -d '\r')"
info "On-demand standard vCPU quota: ${VCPUQ:-unknown} (t4g.small needs 2)"
a ec2 describe-instance-type-offerings --filters Name=instance-type,Values=t4g.small Name=location,Values=us-east-1a --location-type availability-zone \
  --query 'length(InstanceTypeOfferings)' --output text | grep -q 1 && ok "t4g.small offered in us-east-1a" || no "t4g.small not offered in us-east-1a"
AMI="$(a ssm get-parameters --names /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64 --query 'Parameters[0].Value' --output text 2>&1 | tr -d '\r')"
[[ "$AMI" == ami-* ]] && ok "AL2023 arm64 AMI $AMI" || no "cannot resolve AMI parameter ($AMI)"

echo "== Permission dry-runs (nothing is created)"
SUB_ID="${SUBNET%%[[:space:]]*}"
TAGS="ResourceType=instance,Tags=[{Key=cost-center,Value=flacronai-staging-qa}]"
dry "ec2:RunInstances t4g.small (no role)" ec2 run-instances --image-id "$AMI" --instance-type t4g.small --subnet-id "$SUB_ID" --tag-specifications "$TAGS"
dry "ec2:RunInstances WITH instance profile (needs Ibrahim A1+A2)" ec2 run-instances --image-id "$AMI" --instance-type t4g.small \
  --subnet-id "$SUB_ID" --iam-instance-profile Name=flacronai-staging-ec2 --tag-specifications "$TAGS"
dry "ec2:AllocateAddress" ec2 allocate-address --domain vpc
dry "ec2:CreateSecurityGroup" ec2 create-security-group --group-name flacronai-staging-dryrun --description dryrun --vpc-id "$VPC"
a ssm describe-instance-information --max-results 5 >/dev/null 2>&1 && ok "ssm:DescribeInstanceInformation" || no "ssm:DescribeInstanceInformation denied"
a ssm list-commands --max-results 1 >/dev/null 2>&1 && ok "ssm:ListCommands (Run Command API reachable)" || no "ssm:ListCommands denied"
a secretsmanager list-secrets --filters Key=name,Values=flacronai/staging --query 'length(SecretList)' --output text >/dev/null 2>&1 \
  && ok "secretsmanager:ListSecrets" || no "secretsmanager:ListSecrets denied"
a logs describe-log-groups --log-group-name-prefix /flacronai/staging >/dev/null 2>&1 && ok "logs:DescribeLogGroups" || no "logs denied"
a s3api list-buckets --query 'length(Buckets)' --output text >/dev/null 2>&1 && ok "s3:ListAllMyBuckets" || no "s3 denied"
a budgets describe-budgets --account-id $STAGING_AWS_ACCOUNT_ID --query 'length(Budgets)' --output text >/dev/null 2>&1 \
  && ok "budgets:ViewBudget ($(a budgets describe-budgets --account-id $STAGING_AWS_ACCOUNT_ID --query 'length(Budgets)' --output text | tr -d '\r') existing)" || no "budgets denied"
CT="$(a ce list-cost-allocation-tags --tag-keys cost-center --query 'CostAllocationTags[0].Status' --output text 2>&1 | tr -d '\r')"
info "cost-allocation tag cost-center: $CT (needs Active; Ibrahim A3)"
a iam get-instance-profile --instance-profile-name flacronai-staging-ec2 >/dev/null 2>&1 \
  && ok "instance profile flacronai-staging-ec2 exists" || info "instance profile flacronai-staging-ec2 missing or unreadable (Ibrahim A1/A2)"
echo "Done. Nothing was created."
