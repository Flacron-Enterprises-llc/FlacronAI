locals {
  suffix   = var.environment == "production" ? "prod" : var.environment
  registry = "us.icr.io"
  # Generic Code Engine secret holding all sensitive runtime values. Created and
  # rotated by scripts/multicloud/sync-secrets-ibm.js -- values never in TF state.
  app_secret_name = "flacronai-api-secrets"
}

# us.icr.io belongs to the us-south registry region.
provider "ibm" {
  alias  = "registry"
  region = "us-south"
}

data "ibm_resource_group" "app" {
  name = var.resource_group_name
}

resource "ibm_code_engine_project" "app" {
  name              = "flacronai-${local.suffix}"
  resource_group_id = data.ibm_resource_group.app.id
}

# ── Registry ─────────────────────────────────────────────────────────────────
resource "ibm_cr_namespace" "app" {
  provider          = ibm.registry
  name              = var.icr_namespace
  resource_group_id = data.ibm_resource_group.app.id
}

resource "ibm_cr_retention_policy" "app" {
  provider        = ibm.registry
  namespace       = ibm_cr_namespace.app.name
  images_per_repo = 20
  retain_untagged = false
}

# ── IAM: CI deployer (pre-existing service ID, add scoped policies only) ─────
data "ibm_iam_service_id" "deployer" {
  name = var.deployer_service_id_name
}

resource "ibm_iam_service_policy" "deployer_ce" {
  iam_id      = data.ibm_iam_service_id.deployer.service_ids[0].iam_id
  roles       = ["Viewer", "Writer"]
  description = "FlacronAI CI: update apps in Code Engine project flacronai-${local.suffix} only"
  resources {
    service              = "codeengine"
    resource_instance_id = ibm_code_engine_project.app.project_id
  }
}

resource "ibm_iam_service_policy" "deployer_cr" {
  iam_id      = data.ibm_iam_service_id.deployer.service_ids[0].iam_id
  roles       = ["Writer"]
  description = "FlacronAI CI: push images to ICR namespace ${var.icr_namespace} only"
  resources {
    service       = "container-registry"
    resource_type = "namespace"
    resource      = var.icr_namespace
  }
}

# ── IAM: runtime image pull (separate identity, read-only) ───────────────────
resource "ibm_iam_service_id" "puller" {
  name        = "flacronai-ce-puller"
  description = "Code Engine pulls FlacronAI images (Reader on ICR namespace ${var.icr_namespace} only)"
}

resource "ibm_iam_service_policy" "puller_cr" {
  iam_id = ibm_iam_service_id.puller.iam_id
  roles  = ["Reader"]
  resources {
    service       = "container-registry"
    resource_type = "namespace"
    resource      = var.icr_namespace
  }
}

resource "ibm_iam_service_api_key" "puller" {
  name           = "flacronai-ce-puller-key"
  iam_service_id = ibm_iam_service_id.puller.iam_id
  description    = "Rotate every 90 days (terraform apply -replace)"
}

resource "ibm_code_engine_secret" "registry" {
  project_id = ibm_code_engine_project.app.project_id
  name       = "icr-flacronai-pull"
  format     = "registry"
  data = {
    server   = local.registry
    username = "iamapikey"
    password = ibm_iam_service_api_key.puller.apikey
  }
}

# ── Apps ─────────────────────────────────────────────────────────────────────
resource "ibm_code_engine_app" "api" {
  count               = var.deploy_apps ? 1 : 0
  project_id          = ibm_code_engine_project.app.project_id
  name                = "flacronai-api"
  image_reference     = "${local.registry}/${var.icr_namespace}/flacronai-backend:${var.api_image_tag}"
  image_secret        = ibm_code_engine_secret.registry.name
  image_port          = 3000
  managed_domain_mappings = "local_public"

  scale_cpu_limit               = var.api_cpu
  scale_memory_limit            = var.api_memory
  scale_min_instances           = var.api_min_scale
  scale_max_instances           = var.api_max_scale
  scale_concurrency             = 50
  scale_concurrency_target      = 40
  scale_request_timeout         = 300

  dynamic "run_env_variables" {
    for_each = var.plain_env
    content {
      type  = "literal"
      name  = run_env_variables.key
      value = run_env_variables.value
    }
  }

  run_env_variables {
    type      = "secret_full_reference"
    reference = local.app_secret_name
  }

  probe_readiness {
    type              = "http"
    path              = "/health"
    port              = 3000
    initial_delay     = 5
    interval          = 10
    timeout           = 5
    failure_threshold = 3
  }

  probe_liveness {
    type              = "http"
    path              = "/health"
    port              = 3000
    initial_delay     = 10 # CE maximum; interval x threshold gives startup slack
    interval          = 30
    timeout           = 5
    failure_threshold = 3
  }

  lifecycle {
    ignore_changes = [image_reference]
  }
}

resource "ibm_code_engine_app" "web" {
  count                   = var.deploy_apps ? 1 : 0
  project_id              = ibm_code_engine_project.app.project_id
  name                    = "flacronai-web"
  image_reference         = "${local.registry}/${var.icr_namespace}/flacronai-web:${var.web_image_tag}"
  image_secret            = ibm_code_engine_secret.registry.name
  image_port              = 8080
  managed_domain_mappings = "local_public"

  scale_cpu_limit     = "0.25"
  scale_memory_limit  = "0.5G"
  scale_min_instances = 1
  scale_max_instances = 3

  probe_readiness {
    type = "http"
    path = "/healthz"
    port = 8080
  }

  lifecycle {
    ignore_changes = [image_reference]
  }
}
