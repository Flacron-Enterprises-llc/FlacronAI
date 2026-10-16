#!/usr/bin/env bash
# FlacronAI Azure production -- role assignments that need an Owner / User
# Access Administrator (the developer account is Contributor and cannot create
# role assignments). Run ONCE by the subscription Owner
# (rodrigue@FlacronEnterprises.onmicrosoft.com):
#
#   az login --tenant 429aae01-ef3d-4e76-9ef0-38a293e867c7
#   bash infra/azure/admin-role-assignments.sh
#
# Every assignment is scoped to a single FlacronAI resource -- nothing at
# subscription or resource-group level, nothing touching other apps.
set -euo pipefail

SUB=bce797d8-a46b-4f3a-930a-db2851eb2d80
RG=rg-flacronai-prod
az account set --subscription "$SUB"

ACR_ID=$(az acr show -n acrflacronai -g "$RG" --query id -o tsv)
APP_ID=$(az containerapp show -n ca-flacronai-api-prod -g "$RG" --query id -o tsv)
SWA_ID=$(az staticwebapp show -n swa-flacronai-prod -g "$RG" --query id -o tsv)

# GitHub Actions deploy identity (Entra app gh-flacronai-deploy-prod, OIDC
# federated to environment azure-production of Flacron-Enterprises-llc/FlacronAI).
GH_SP=88830d54-20ba-486f-917e-8a85180df3d7
# Runtime identity of the API container (id-flacronai-api-prod).
API_MI=8ff89241-637e-458b-8a16-2aa80eeaf8d4

assign() { # principal role scope
  az role assignment create --assignee-object-id "$1" --assignee-principal-type ServicePrincipal \
    --role "$2" --scope "$3" -o none && echo "OK  $2  ->  ${3##*/}"
}

# 1. CI pushes images to the FlacronAI registry only
assign "$GH_SP" "AcrPush" "$ACR_ID"
# 2. CI updates the FlacronAI API container app only (new image revision / rollback)
assign "$GH_SP" "Contributor" "$APP_ID"
# 3. CI reads the Static Web App deployment token and deploys the frontend
assign "$GH_SP" "Contributor" "$SWA_ID"
# 4. (recommended) API pulls images with its managed identity instead of the
#    90-day ACR token; afterwards set acr_pull_with_identity = true in Terraform.
assign "$API_MI" "AcrPull" "$ACR_ID"

echo "Done. Re-run the 'Deploy FlacronAI (Azure + IBM)' workflow (target: azure) to verify."
