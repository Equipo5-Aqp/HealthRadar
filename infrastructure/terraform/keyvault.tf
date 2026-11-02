# Guarda infrastructure/.env (incluye N8N_ENCRYPTION_KEY, sin la cual las credenciales
# de n8n del dump son irrecuperables). El secreto NO se gestiona con Terraform: así su
# valor nunca queda en claro dentro de terraform.tfstate. Se sube con `az keyvault secret set`.

resource "azurerm_key_vault" "secretos" {
  name                       = local.key_vault_name
  resource_group_name        = azurerm_resource_group.dr.name
  location                   = azurerm_resource_group.dr.location
  tenant_id                  = data.azurerm_client_config.actual.tenant_id
  sku_name                   = "standard"
  rbac_authorization_enabled = true
  soft_delete_retention_days = 7
  purge_protection_enabled   = false
  tags                       = local.tags

  lifecycle {
    prevent_destroy = true
  }
}
