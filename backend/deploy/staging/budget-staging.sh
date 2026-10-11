#!/usr/bin/env bash
# Creates/updates the staging cost budget: monthly, ACTUAL cost of resources tagged
# cost-center=flacronai-staging-qa, email alerts at $25 / $50 / $100 to the approved recipient.
# Alerts are NOTIFICATIONS ONLY — AWS does not stop or cap spending; thresholds are not spend approval.
# Prerequisite: cost-allocation tag "cost-center" activated (ACCESS_REQUEST §A3); costs are only
# attributed from activation onward and appear with up to ~24 h delay.
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*"  # Git Bash: do not rewrite /aws/..., /flacronai/... args into Windows paths
set -euo pipefail
AWS="${AWS_CLI:-aws}"; PROFILE="${AWS_PROFILE_NAME:-flacron-qa}"
a() { "$AWS" "$@" --profile "$PROFILE" --region us-east-1; }
ACCOUNT="$(a sts get-caller-identity --query Account --output text | tr -d '\r')"
RECIPIENT="${BUDGET_EMAIL:?set BUDGET_EMAIL}"; NAME="flacronai-staging-qa"
BUDGET="{\"BudgetName\":\"$NAME\",\"BudgetType\":\"COST\",\"TimeUnit\":\"MONTHLY\",\"BudgetLimit\":{\"Amount\":\"100\",\"Unit\":\"USD\"},\"CostFilters\":{\"TagKeyValue\":[\"user:cost-center\$flacronai-staging-qa\"]}}"
if a budgets describe-budget --account-id "$ACCOUNT" --budget-name "$NAME" >/dev/null 2>&1; then
  a budgets update-budget --account-id "$ACCOUNT" --new-budget "$BUDGET"
  echo "budget updated (notifications unchanged)"; exit 0
fi
N=""
for amt in 25 50 100; do
  N="$N{\"Notification\":{\"NotificationType\":\"ACTUAL\",\"ComparisonOperator\":\"GREATER_THAN\",\"Threshold\":$amt,\"ThresholdType\":\"ABSOLUTE_VALUE\"},\"Subscribers\":[{\"SubscriptionType\":\"EMAIL\",\"Address\":\"$RECIPIENT\"}]},"
done
a budgets create-budget --account-id "$ACCOUNT" --budget "$BUDGET" --notifications-with-subscribers "[${N%,}]"
echo "budget $NAME created: alerts at \$25/\$50/\$100 (actual, monthly) -> $RECIPIENT"
