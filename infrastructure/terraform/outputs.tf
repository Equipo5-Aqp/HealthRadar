output "storage_account" {
  description = "Storage Account de backups (BACKUP_STORAGE_ACCOUNT en el crontab de la VM)."
  value       = azurerm_storage_account.backups.name
}

output "storage_container" {
  description = "Contenedor de backups (BACKUP_STORAGE_CONTAINER)."
  value       = azurerm_storage_container.backups.name
}

output "key_vault" {
  description = "Key Vault donde vive el .env."
  value       = azurerm_key_vault.secretos.name
}

output "env_secret_name" {
  description = "Nombre del secreto con el contenido de infrastructure/.env."
  value       = local.env_secret_name
}

output "ip_publica" {
  description = "IP pública de la VM de recuperación (nuevo valor del secreto AZURE_VM_HOST de GitHub)."
  value       = var.crear_vm ? azurerm_public_ip.dr[0].ip_address : null
}

output "ssh" {
  description = "Comando para entrar a la VM de recuperación."
  value       = var.crear_vm ? "ssh -i ~/.ssh/healthradar-vm_key.pem azureuser@${azurerm_public_ip.dr[0].ip_address}" : null
}

output "url" {
  description = "URL del sistema restaurado."
  value       = var.crear_vm ? "http://${azurerm_public_ip.dr[0].ip_address}:3000" : null
}
