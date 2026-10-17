terraform {
  required_version = ">= 1.9.0"

  required_providers {
    ibm = {
      source  = "IBM-Cloud/ibm"
      version = "~> 1.80"
    }
  }

  # Same encrypted, versioned state account as infra/azure (decision D6).
  backend "azurerm" {
    resource_group_name  = "rg-flacronai-tfstate"
    storage_account_name = "stflacronaitfstate"
    container_name       = "tfstate"
    key                  = "ibm/production.tfstate"
  }
}

# Auth: IC_API_KEY env var (an operator's key at bootstrap; never committed).
provider "ibm" {
  region = var.region
}
