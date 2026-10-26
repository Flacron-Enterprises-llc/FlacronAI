#!/usr/bin/env bash
# FlacronAI STAGING backend — one always-on EC2 instance (t4g.small, Docker + Caddy HTTPS), isolated
# from production. Creates/updates ONLY resources named/tagged flacronai-staging; never touches
# flacronai-production-cluster, flacronai-alb, the shared Express/Gamezone ALB, production ECR or
# secrets. Idempotent: the first run provisions, later runs redeploy the current working tree.
# Secrets never pass through this script (instance reads Secrets Manager itself).
# Requires: STAGING_HOST (HTTPS hostname pointing at the staging Elastic IP — see README).
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*"  # Git Bash: do not rewrite /aws/..., /flacronai/... args into Windows paths
set -euo pipefail

AWS="${AWS_CLI:-aws}"; PROFILE="${AWS_PROFILE_NAME:-flacron-qa}"; REGION="us-east-1"
a() { "$AWS" "$@" --profile "$PROFILE" --region "$REGION"; }
ACCOUNT="$(a sts get-caller-identity --query Account --output text | tr -d '\r')"
[ "$ACCOUNT" = "${STAGING_AWS_ACCOUNT_ID:?set STAGING_AWS_ACCOUNT_ID}" ] || { echo "wrong account $ACCOUNT"; exit 1; }
NAME="flacronai-backend-staging"; SG_NAME="flacronai-staging-web"; PROFILE_NAME="flacronai-staging-ec2"
BUCKET="flacronai-staging-build-$ACCOUNT"; LOG_GROUP="/flacronai/staging/backend"
TYPE="${INSTANCE_TYPE:-t4g.small}"; HOST="${STAGING_HOST:-}"
TAGSPEC="{Key=env,Value=staging},{Key=app,Value=flacronai},{Key=cost-center,Value=flacronai-staging-qa}"
IMAGE_TAG="${IMAGE_TAG:-staging-$(git rev-parse --short HEAD)-$(date +%Y%m%d%H%M)}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
t() { tr -d '\r'; }

echo "== 1. Network: own security group in the default VPC (80/443 only; no SSH)"
VPC="$(a ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text | t)"
SG="$(a ec2 describe-security-groups --filters Name=group-name,Values="$SG_NAME" Name=vpc-id,Values="$VPC" --query 'SecurityGroups[0].GroupId' --output text | t)"
if [ "$SG" = None ]; then
  SG="$(a ec2 create-security-group --group-name "$SG_NAME" --description "FlacronAI staging HTTPS (Caddy)" --vpc-id "$VPC" \
    --tag-specifications "ResourceType=security-group,Tags=[$TAGSPEC]" --query GroupId --output text | t)"
  a ec2 authorize-security-group-ingress --group-id "$SG" --ip-permissions \
    'IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0,Description=ACME+redirect}]' \
    'IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0,Description=HTTPS}]' >/dev/null
fi

echo "== 2. Build bucket (private, encrypted, bundles expire after 14 days) + log group (14-day retention)"
if ! a s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  a s3api create-bucket --bucket "$BUCKET" >/dev/null
  a s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  a s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration \
    '{"Rules":[{"ID":"expire-bundles","Status":"Enabled","Filter":{"Prefix":"src/"},"Expiration":{"Days":14}}]}'
  a s3api put-bucket-tagging --bucket "$BUCKET" --tagging "TagSet=[$TAGSPEC]"
fi
a logs create-log-group --log-group-name "$LOG_GROUP" --tags env=staging,app=flacronai,cost-center=flacronai-staging-qa 2>/dev/null || true
a logs put-retention-policy --log-group-name "$LOG_GROUP" --retention-in-days 14

echo "== 3. Instance (always-on CPU; standard credits = no burst surcharge; IMDSv2; encrypted 20 GB gp3)"
IID="$(a ec2 describe-instances --filters Name=tag:Name,Values="$NAME" Name=instance-state-name,Values=pending,running,stopping,stopped \
  --query 'Reservations[0].Instances[0].InstanceId' --output text | t)"
if [ "$IID" = None ]; then
  SUBNET="$(a ec2 describe-subnets --filters Name=vpc-id,Values="$VPC" Name=default-for-az,Values=true Name=availability-zone,Values=us-east-1a \
    --query 'Subnets[0].SubnetId' --output text | t)"
  USERDATA="$(printf '#!/bin/bash\nset -e\ndnf -y install docker unzip\nsystemctl enable --now docker\nfallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo "/swapfile none swap sw 0 0" >> /etc/fstab\n')"
  IID="$(a ec2 run-instances --image-id resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64 \
    --instance-type "$TYPE" --subnet-id "$SUBNET" --security-group-ids "$SG" --associate-public-ip-address \
    --iam-instance-profile Name="$PROFILE_NAME" --credit-specification CpuCredits=standard \
    --metadata-options HttpTokens=required,HttpPutResponseHopLimit=1,HttpEndpoint=enabled \
    --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=20,VolumeType=gp3,Encrypted=true,DeleteOnTermination=true}' \
    --user-data "$USERDATA" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME},$TAGSPEC]" "ResourceType=volume,Tags=[$TAGSPEC]" \
    --query 'Instances[0].InstanceId' --output text | t)"
  a ec2 wait instance-running --instance-ids "$IID"
fi
STATE="$(a ec2 describe-instances --instance-ids "$IID" --query 'Reservations[0].Instances[0].State.Name' --output text | t)"
[ "$STATE" = stopped ] && { a ec2 start-instances --instance-ids "$IID" >/dev/null; a ec2 wait instance-running --instance-ids "$IID"; }

echo "== 4. Elastic IP (stable address for the HTTPS hostname)"
EIP_ALLOC="$(a ec2 describe-addresses --filters Name=tag:Name,Values="$NAME" --query 'Addresses[0].AllocationId' --output text | t)"
if [ "$EIP_ALLOC" = None ]; then
  EIP_ALLOC="$(a ec2 allocate-address --domain vpc --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=$NAME},$TAGSPEC]" \
    --query AllocationId --output text | t)"
fi
a ec2 associate-address --allocation-id "$EIP_ALLOC" --instance-id "$IID" --allow-reassociation >/dev/null
EIP="$(a ec2 describe-addresses --allocation-ids "$EIP_ALLOC" --query 'Addresses[0].PublicIp' --output text | t)"
echo "Elastic IP: $EIP"
[ -n "$HOST" ] || { echo "Set STAGING_HOST (DNS A record -> $EIP) and re-run to deploy the app."; exit 0; }

echo "== 5. Source bundle -> S3 (backend/ only; no .env, no node_modules)"
TMP="$(mktemp -d)"
(
  cd "$REPO_ROOT"
  export GIT_INDEX_FILE="$TMP/index"
  git read-tree HEAD
  git add -A -- backend
  TREE="$(git write-tree)"
  unset GIT_INDEX_FILE
  git -c core.autocrlf=false -c core.eol=lf archive --format=zip -o "$TMP/src.zip" "$TREE" backend
)
node -e "
const b=require('fs').readFileSync(process.argv[1]);const n=[];let i=0;
while((i=b.indexOf(Buffer.from([0x50,0x4b,1,2]),i))>=0){const l=b.readUInt16LE(i+28);n.push(b.slice(i+46,i+46+l).toString());i+=46+l+b.readUInt16LE(i+30)+b.readUInt16LE(i+32);}
if(n.some(x=>/(^|\/)\.env(\.local)?$|node_modules\//.test(x))){console.error('bundle contains .env/node_modules - abort');process.exit(1)}
console.log('bundle ok:',n.length,'files');" "$TMP/src.zip"
a s3 cp "$(lp "$TMP/src.zip")" "s3://$BUCKET/src/$IMAGE_TAG.zip" --only-show-errors
tr -d '' < "$REPO_ROOT/backend/deploy/staging/remote-deploy.sh" > "$TMP/remote-deploy.sh"   # LF-only for Linux
a s3 cp "$(lp "$TMP/remote-deploy.sh")" "s3://$BUCKET/src/remote-deploy.sh" --only-show-errors
rm -rf "$TMP"

echo "== 6. Deploy on the instance via SSM Run Command (no SSH)"
for i in $(seq 1 30); do
  [ "$(a ssm describe-instance-information --filters Key=InstanceIds,Values="$IID" --query 'length(InstanceInformationList)' --output text | t)" = 1 ] && break
  [ "$i" = 30 ] && { echo "SSM agent not registered (instance profile / network?)"; exit 1; }; sleep 10
done
PARAMS="$(mktemp)"
node -e 'const [b,r,m,t,h]=process.argv.slice(1);process.stdout.write(JSON.stringify({commands:[
  "cloud-init status --wait >/dev/null 2>&1 || true",
  `aws s3 cp s3://${b}/src/remote-deploy.sh /root/remote-deploy.sh --region ${r} --only-show-errors`,
  `ANTHROPIC_MODEL=${m} bash /root/remote-deploy.sh ${t} ${h} ${b}`],executionTimeout:["1800"]}))'   "$BUCKET" "$REGION" "${STAGING_ANTHROPIC_MODEL:-claude-opus-4-8}" "$IMAGE_TAG" "$HOST" > "$PARAMS"
CMD="$(a ssm send-command --instance-ids "$IID" --document-name AWS-RunShellScript --comment "flacronai staging $IMAGE_TAG"   --cloud-watch-output-config "CloudWatchOutputEnabled=true,CloudWatchLogGroupName=$LOG_GROUP"   --parameters "file://$(lp "$PARAMS")"   --query Command.CommandId --output text | t)"
while :; do
  S="$(a ssm get-command-invocation --command-id "$CMD" --instance-id "$IID" --query Status --output text 2>/dev/null | t || echo Pending)"
  case "$S" in Pending|InProgress|Delayed) sleep 15;; *) break;; esac
done
a ssm get-command-invocation --command-id "$CMD" --instance-id "$IID" --query StandardOutputContent --output text | tail -5
rm -f "$PARAMS"
[ "$S" = Success ] || { echo "remote deploy: $S (see CloudWatch $LOG_GROUP)"; exit 1; }
echo "Deployed $IMAGE_TAG -> https://$HOST  (verify: /health 200, /api/v1/billing/status 401)"
