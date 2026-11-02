# Permisos por identidad (sin claves de acceso en la VM ni en el repo).
#   Operador (quien ejecuta terraform): sube el .env y lista/descarga backups desde su laptop.
#   VM actual (portal) y VM de recuperación: leen el .env y suben/descargan backups vía IMDS.

resource "azurerm_role_assignment" "operador_kv" {
  scope                = azurerm_key_vault.secretos.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = data.azurerm_client_config.actual.object_id
}

resource "azurerm_role_assignment" "operador_blob" {
  scope                = azurerm_storage_account.backups.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = data.azurerm_client_config.actual.object_id
}

resource "azurerm_role_assignment" "vm_actual_blob" {
  count                = var.vm_actual_principal_id == "" ? 0 : 1
  scope                = azurerm_storage_container.backups.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = var.vm_actual_principal_id
  principal_type       = "ServicePrincipal"
}

resource "azurerm_role_assignment" "vm_actual_kv" {
  count                = var.vm_actual_principal_id == "" ? 0 : 1
  scope                = azurerm_key_vault.secretos.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = var.vm_actual_principal_id
  principal_type       = "ServicePrincipal"
}

resource "azurerm_role_assignment" "vm_dr_blob" {
  count                = var.crear_vm ? 1 : 0
  scope                = azurerm_storage_container.backups.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_linux_virtual_machine.dr[0].identity[0].principal_id
  principal_type       = "ServicePrincipal"
}

resource "azurerm_role_assignment" "vm_dr_kv" {
  count                = var.crear_vm ? 1 : 0
  scope                = azurerm_key_vault.secretos.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_linux_virtual_machine.dr[0].identity[0].principal_id
  principal_type       = "ServicePrincipal"
}
