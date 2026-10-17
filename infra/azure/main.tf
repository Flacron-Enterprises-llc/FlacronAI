locals {
  suffix = var.environment == "production" ? "prod" : var.environment
  # Key Vault secret names: STRIPE_SECRET_KEY -> stripe-secret-key
  kv_names = { for n in var.secret_names : n => lower(replace(n, "_", "-")) }
}

data "azurerm_client_config" "current" {}

resource "azurerm_resource_group" "app" {
  name     = "rg-flacronai-${local.suffix}"
  location = var.location
  tags     = var.tags
}

resource "azurerm_log_analytics_workspace" "app" {
  name                = "log-flacronai-${local.suffix}"
  location            = azurerm_resource_group.app.location
  resource_group_name = azurerm_resource_group.app.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = var.tags
}

# ── Registry ─────────────────────────────────────────────────────────────────
resource "azurerm_container_registry" "acr" {
  name                = "acrflacronai"
  location            = azurerm_resource_group.app.location
  resource_group_name = azurerm_resource_group.app.name
  sku                 = "Basic"
  admin_enabled       = false
  tags                = var.tags
}

# Pull-only, repository-scoped token. Used until an Owner grants AcrPull to
# the app identity (then set acr_pull_with_identity = true).
resource "azurerm_container_registry_scope_map" "pull" {
  name                    = "flacronai-api-pull"
  container_registry_name = azurerm_container_registry.acr.name
  resource_group_name     = azurerm_resource_group.app.name
  actions = [
    "repositories/flacronai-backend/content/read",
    "repositories/flacronai-backend/metadata/read",
  ]
}

resource "azurerm_container_registry_token" "pull" {
  name                    = "flacronai-api-pull"
  container_registry_name = azurerm_container_registry.acr.name
  resource_group_name     = azurerm_resource_group.app.name
  scope_map_id            = azurerm_container_registry_scope_map.pull.id
}

resource "azurerm_container_registry_token_password" "pull" {
  container_registry_token_id = azurerm_container_registry_token.pull.id
  password1 {
    expiry = timeadd(plantimestamp(), "2160h") # 90 days -- rotate by re-applying
  }
  lifecycle {
    ignore_changes = [password1[0].expiry]
  }
}

# ── Identity + Key Vault ─────────────────────────────────────────────────────
resource "azurerm_user_assigned_identity" "api" {
  name                = "id-flacronai-api-${local.suffix}"
  location            = azurerm_resource_group.app.location
  resource_group_name = azurerm_resource_group.app.name
  tags                = var.tags
}

# Access-policy mode: a Contributor can grant data-plane access without an
# Owner-level role assignment.
resource "azurerm_key_vault" "app" {
  name                       = "kv-flacronai-${local.suffix}"
  location                   = azurerm_resource_group.app.location
  resource_group_name        = azurerm_resource_group.app.name
  tenant_id                  = var.tenant_id
  sku_name                   = "standard"
  rbac_authorization_enabled = false
  purge_protection_enabled   = true
  soft_delete_retention_days = 30
  tags                       = var.tags

  access_policy {
    tenant_id          = var.tenant_id
    object_id          = data.azurerm_client_config.current.object_id
    secret_permissions = ["Get", "List", "Set", "Delete", "Recover"]
  }

  access_policy {
    tenant_id          = var.tenant_id
    object_id          = azurerm_user_assigned_identity.api.principal_id
    secret_permissions = ["Get", "List"]
  }
}

resource "azurerm_key_vault_secret" "acr_pull_password" {
  name         = "acr-pull-token-password"
  value        = azurerm_container_registry_token_password.pull.password1[0].value
  key_vault_id = azurerm_key_vault.app.id
  content_type = "acr-token"
}

# Application secret VALUES are loaded out-of-band by
# scripts/multicloud/sync-secrets-azure.js (never in Terraform state).

# ── Container Apps ───────────────────────────────────────────────────────────
resource "azurerm_container_app_environment" "app" {
  name                       = "cae-flacronai-${local.suffix}"
  location                   = azurerm_resource_group.app.location
  resource_group_name        = azurerm_resource_group.app.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.app.id
  tags                       = var.tags
}

resource "azurerm_container_app" "api" {
  count                        = var.deploy_app ? 1 : 0
  name                         = "ca-flacronai-api-${local.suffix}"
  container_app_environment_id = azurerm_container_app_environment.app.id
  resource_group_name          = azurerm_resource_group.app.name
  revision_mode                = "Single"
  tags                         = var.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.api.id]
  }

  dynamic "registry" {
    for_each = var.acr_pull_with_identity ? [1] : []
    content {
      server   = azurerm_container_registry.acr.login_server
      identity = azurerm_user_assigned_identity.api.id
    }
  }

  dynamic "registry" {
    for_each = var.acr_pull_with_identity ? [] : [1]
    content {
      server               = azurerm_container_registry.acr.login_server
      username             = azurerm_container_registry_token.pull.name
      password_secret_name = "acr-pull-token-password"
    }
  }

  secret {
    name                = "acr-pull-token-password"
    identity            = azurerm_user_assigned_identity.api.id
    key_vault_secret_id = "${azurerm_key_vault.app.vault_uri}secrets/acr-pull-token-password"
  }

  dynamic "secret" {
    for_each = local.kv_names
    content {
      name                = secret.value
      identity            = azurerm_user_assigned_identity.api.id
      key_vault_secret_id = "${azurerm_key_vault.app.vault_uri}secrets/${secret.value}"
    }
  }

  ingress {
    external_enabled           = true
    target_port                = 3000
    transport                  = "auto"
    allow_insecure_connections = false
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = var.api_min_replicas
    max_replicas = var.api_max_replicas

    http_scale_rule {
      name                = "http-concurrency"
      concurrent_requests = "50"
    }

    container {
      name   = "flacronai-backend"
      image  = "${azurerm_container_registry.acr.login_server}/${var.api_image}"
      cpu    = var.api_cpu
      memory = var.api_memory

      dynamic "env" {
        for_each = var.plain_env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.kv_names
        content {
          name        = env.key
          secret_name = env.value
        }
      }

      startup_probe {
        transport               = "HTTP"
        port                    = 3000
        path                    = "/health"
        interval_seconds        = 5
        failure_count_threshold = 24
      }

      liveness_probe {
        transport               = "HTTP"
        port                    = 3000
        path                    = "/health"
        interval_seconds        = 30
        failure_count_threshold = 3
      }

      readiness_probe {
        transport               = "HTTP"
        port                    = 3000
        path                    = "/health"
        interval_seconds        = 10
        failure_count_threshold = 3
      }
    }
  }

  lifecycle {
    # CI owns the running image tag (immutable Git SHA).
    ignore_changes = [template[0].container[0].image]
  }

  depends_on = [azurerm_key_vault_secret.acr_pull_password]
}

# ── Frontend ─────────────────────────────────────────────────────────────────
resource "azurerm_static_web_app" "web" {
  name                = "swa-flacronai-${local.suffix}"
  resource_group_name = azurerm_resource_group.app.name
  location            = "eastus2" # SWA control plane is only offered in a few regions; content is global
  sku_tier            = var.swa_sku
  sku_size            = var.swa_sku
  tags                = var.tags
}

# ── GitHub Actions deploy identity (OIDC federation, no client secret) ───────
resource "azuread_application" "gh_deploy" {
  display_name = "gh-flacronai-deploy-${local.suffix}"
  owners       = [data.azurerm_client_config.current.object_id]
}

resource "azuread_service_principal" "gh_deploy" {
  client_id = azuread_application.gh_deploy.client_id
  owners    = [data.azurerm_client_config.current.object_id]
}

resource "azuread_application_federated_identity_credential" "gh_env" {
  application_id = azuread_application.gh_deploy.id
  display_name   = "github-env-azure-${var.environment}"
  description    = "GitHub Actions, environment azure-${var.environment} only"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${var.github_repository}:environment:azure-${var.environment}"
}
