data "azurerm_client_config" "actual" {}

locals {
  # Nombres globales: Storage solo admite minúsculas/números (máx. 24); Key Vault, máx. 24.
  storage_account_name = "${var.prefix}bk${var.sufijo_unico}"
  key_vault_name       = "${var.prefix}-kv-${var.sufijo_unico}"

  # Nombre del secreto que tf_bootstrap_vm.sh convierte en infrastructure/.env
  env_secret_name = "healthradar-env"

  tags = {
    proyecto       = "HealthRadar"
    gestionado_por = "terraform"
    adr            = "ADR-015"
  }
}

# Grupo de recursos propio, separado del grupo de la VM creada en el portal:
# si se borra la VM (o su grupo), los backups y secretos siguen aquí.
resource "azurerm_resource_group" "dr" {
  name     = "${var.prefix}-dr-rg"
  location = var.location
  tags     = local.tags

  lifecycle {
    prevent_destroy = true
  }
}
