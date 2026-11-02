# ADR-015: Terraform como IaC de recuperación ante desastres en Azure.
# Estado local (terraform.tfstate, gitignored): ver README.md, sección "Estado de Terraform".

terraform {
  required_version = ">= 1.6"

  required_providers {
    azurerm = {
      source = "hashicorp/azurerm"
      # >= 4.42: rbac_authorization_enabled en azurerm_key_vault
      version = ">= 4.42, < 5.0"
    }
  }
}

provider "azurerm" {
  # azurerm v4 exige la suscripción explícita (Azure for Students, ADR-011).
  subscription_id = var.subscription_id

  features {
    key_vault {
      # Un `destroy` accidental deja el vault en soft-delete (7 días) en vez de purgarlo.
      purge_soft_delete_on_destroy = false
    }
  }
}
