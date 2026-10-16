variable "subscription_id" {
  type    = string
  default = "bce797d8-a46b-4f3a-930a-db2851eb2d80"
}

variable "tenant_id" {
  type    = string
  default = "429aae01-ef3d-4e76-9ef0-38a293e867c7"
}

variable "environment" {
  type    = string
  default = "production"
}

variable "location" {
  type    = string
  default = "eastus"
}

variable "github_repository" {
  description = "owner/repo allowed to federate into the deploy identity"
  type        = string
  default     = "Flacron-Enterprises-llc/FlacronAI"
}

variable "api_image" {
  description = "Initial API image (repo:tag in ACR). CI replaces the tag on every deploy; Terraform ignores later changes."
  type        = string
  default     = "flacronai-backend:bootstrap"
}

variable "deploy_app" {
  description = "Create the Container App. Set false on the first apply so Key Vault + secrets + image exist before the app references them."
  type        = bool
  default     = true
}

variable "acr_pull_with_identity" {
  description = "true once an Owner has granted AcrPull to the app identity (admin-role-assignments.sh); false uses a pull-only ACR token."
  type        = bool
  default     = false
}

variable "api_cpu" {
  type    = number
  default = 1.0
}

variable "api_memory" {
  type    = string
  default = "2Gi"
}

variable "api_min_replicas" {
  type    = number
  default = 1
}

variable "api_max_replicas" {
  type    = number
  default = 3
}

variable "plain_env" {
  description = "Non-secret runtime config (from AWS task def plain env + per-cloud overrides)."
  type        = map(string)
  default     = {}
}

variable "secret_names" {
  description = "Env var names whose values live in Key Vault (secret name = lower-kebab of env var)."
  type        = list(string)
  default = [
    "ANTHROPIC_API_KEY", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "FIREBASE_API_KEY",
    "FIREBASE_PRIVATE_KEY", "GEMINI_API_KEY", "JWT_SECRET", "OPENAI_API_KEY", "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET", "WATSONX_API_KEY", "GOOGLE_MAPS_SERVER_KEY", "REALTY_API_KEY",
  ]
}

variable "swa_sku" {
  type    = string
  default = "Standard"
}

variable "tags" {
  type = map(string)
  default = {
    app        = "flacronai"
    env        = "production"
    owner      = "flacron-enterprises"
    managed-by = "terraform"
  }
}
