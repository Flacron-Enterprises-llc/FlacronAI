terraform {
  required_version = ">= 1.9.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.40"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 3.4"
    }
  }

  # State: Azure Storage in rg-flacronai-tfstate (created by bootstrap.sh).
  # Contributor-only access -> key-based backend auth (the provider lists the
  # account key through ARM; nothing is stored in the repo).
  backend "azurerm" {
    resource_group_name  = "rg-flacronai-tfstate"
    storage_account_name = "stflacronaitfstate"
    container_name       = "tfstate"
    key                  = "azure/production.tfstate"
  }
}

provider "azurerm" {
  features {
    key_vault {
      purge_soft_delete_on_destroy = false
    }
  }
  subscription_id                 = var.subscription_id
  tenant_id                       = var.tenant_id
  resource_provider_registrations = "none"
}

provider "azuread" {
  tenant_id = var.tenant_id
}
