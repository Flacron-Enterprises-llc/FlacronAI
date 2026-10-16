variable "region" {
  type    = string
  default = "us-east"
}

variable "environment" {
  type    = string
  default = "production"
}

variable "resource_group_name" {
  description = "Pre-existing, FlacronAI-dedicated resource group."
  type        = string
  default     = "FlacronAI"
}

variable "deployer_service_id_name" {
  description = "Pre-existing CI service ID (scoped policies are added here, nothing else changed)."
  type        = string
  default     = "flacronai-deployer"
}

variable "icr_namespace" {
  type    = string
  default = "flacronai"
}

variable "deploy_apps" {
  description = "false on first apply: create project/namespace/IAM, then load secrets + images, then true."
  type        = bool
  default     = true
}

variable "api_image_tag" {
  description = "Initial tag; CI owns the tag afterwards (ignored by Terraform)."
  type        = string
  default     = "bootstrap"
}

variable "web_image_tag" {
  type    = string
  default = "bootstrap"
}

variable "api_cpu" {
  type    = string
  default = "1"
}

variable "api_memory" {
  type    = string
  default = "4G"
}

variable "api_min_scale" {
  type    = number
  default = 1
}

variable "api_max_scale" {
  type    = number
  default = 3
}

variable "plain_env" {
  description = "Non-secret runtime config (generated from AWS + per-cloud overrides)."
  type        = map(string)
  default     = {}
}
