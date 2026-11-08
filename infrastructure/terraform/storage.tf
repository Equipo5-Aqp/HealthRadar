# Copia off-site de los backups semanales (HU-303). backup_healthradar.sh sube aquí
# el dump de PostgreSQL y el export de n8n; tf_restore_healthradar.sh descarga el último.

resource "azurerm_storage_account" "backups" {
  name                            = local.storage_account_name
  resource_group_name             = azurerm_resource_group.dr.name
  location                        = azurerm_resource_group.dr.location
  account_kind                    = "StorageV2"
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  access_tier                     = "Hot"
  min_tls_version                 = "TLS1_2"
  https_traffic_only_enabled      = true
  allow_nested_items_to_be_public = false
  tags                            = local.tags

  blob_properties {
    # Papelera: un blob borrado por error se recupera durante 7 días.
    delete_retention_policy {
      days = 7
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_storage_container" "backups" {
  name                  = "backups"
  storage_account_id    = azurerm_storage_account.backups.id
  container_access_type = "private"
}

resource "azurerm_storage_management_policy" "retencion" {
  storage_account_id = azurerm_storage_account.backups.id

  rule {
    name    = "borrar-backups-antiguos"
    enabled = true

    filters {
      prefix_match = ["${azurerm_storage_container.backups.name}/"]
      blob_types   = ["blockBlob"]
    }

    actions {
      base_blob {
        delete_after_days_since_modification_greater_than = var.retencion_backups_dias
      }
    }
  }
}
