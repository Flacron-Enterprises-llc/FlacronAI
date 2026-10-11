#!/usr/bin/env bash
# Pause/resume the staging backend without losing data or the HTTPS hostname.
#   bash pause-staging.sh stop   -> instance stopped: compute billing stops; EBS (~$1.60) + Elastic IP (~$3.65) continue
#   bash pause-staging.sh start  -> instance + containers come back (restart policy), same IP/hostname
#   bash pause-staging.sh status
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*"  # Git Bash: do not rewrite /aws/..., /flacronai/... args into Windows paths
set -euo pipefail
AWS="${AWS_CLI:-aws}"; PROFILE="${AWS_PROFILE_NAME:-flacron-qa}"; REGION="us-east-1"
a() { "$AWS" "$@" --profile "$PROFILE" --region "$REGION"; }
IID="$(a ec2 describe-instances --filters Name=tag:Name,Values=flacronai-backend-staging Name=instance-state-name,Values=pending,running,stopping,stopped \
  --query 'Reservations[0].Instances[0].InstanceId' --output text | tr -d '\r')"
[ "$IID" != None ] || { echo "no staging instance"; exit 1; }
case "${1:-status}" in
  stop)  a ec2 stop-instances --instance-ids "$IID" >/dev/null; a ec2 wait instance-stopped --instance-ids "$IID"; echo "stopped $IID";;
  start) a ec2 start-instances --instance-ids "$IID" >/dev/null; a ec2 wait instance-running --instance-ids "$IID"; echo "running $IID";;
  *)     a ec2 describe-instances --instance-ids "$IID" --query 'Reservations[0].Instances[0].State.Name' --output text;;
esac
