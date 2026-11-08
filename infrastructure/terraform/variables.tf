variable "subscription_id" {
  description = "ID de la suscripción Azure for Students (az account show --query id -o tsv)."
  type        = string
}

variable "location" {
  description = "Región de Azure. Azure for Students solo permite centralus, eastus, brazilsouth, chilecentral y westus3 (ADR-011)."
  type        = string
  default     = "centralus"
}

variable "prefix" {
  description = "Prefijo de nombres. Solo minúsculas y números: se usa también en el nombre del Storage Account."
  type        = string
  default     = "healthradar"

  validation {
    condition     = can(regex("^[a-z0-9]{3,11}$", var.prefix))
    error_message = "prefix debe tener 3-11 caracteres en minúsculas o números."
  }
}

variable "sufijo_unico" {
  description = "Sufijo para los nombres globales del Storage Account y del Key Vault (p. ej. iniciales del equipo). Anotarlo: sin él no se encuentran los recursos si se pierde el estado."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]{2,8}$", var.sufijo_unico))
    error_message = "sufijo_unico debe tener 2-8 caracteres en minúsculas o números."
  }
}

variable "crear_vm" {
  description = "false = modo contingencia (solo Storage + Key Vault). true = crea la VM de recuperación, que se restaura sola desde el último backup."
  type        = bool
  default     = false
}

variable "vm_size" {
  description = "Tamaño de la VM (ADR-011)."
  type        = string
  default     = "Standard_B2als_v2"
}

variable "ssh_public_key_path" {
  description = "Clave pública SSH de azureuser. Derivarla de la clave actual para que el secreto AZURE_VM_SSH_KEY de GitHub siga sirviendo: ssh-keygen -y -f healthradar-vm_key.pem."
  type        = string
  default     = "~/.ssh/healthradar-vm_key.pub"
}

variable "ssh_source_cidr" {
  description = "Origen permitido para SSH (22). '*' porque deploy.yml entra desde runners de GitHub Actions con IP variable; solo se acepta llave, nunca contraseña."
  type        = string
  default     = "*"
}

variable "repo_url" {
  description = "Repositorio que clona la VM de recuperación."
  type        = string
  default     = "https://github.com/Equipo5-Aqp/HealthRadar.git"
}

variable "repo_ref" {
  description = "Rama, tag o SHA que despliega la VM de recuperación."
  type        = string
  default     = "main"
}

variable "vm_actual_principal_id" {
  description = "Object ID de la identidad administrada de la VM actual (creada en el portal). Le da permiso para subir backups al Storage. Vacío = sin permiso."
  type        = string
  default     = ""
}

variable "operadores_lectura" {
  description = "Object IDs de las personas que pueden restaurar en un Ubuntu propio (tf_preparar_host.sh): solo leen el .env y bajan backups. az ad user show --id <correo> --query id -o tsv"
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for id in var.operadores_lectura : can(regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", id))])
    error_message = "Cada elemento de operadores_lectura debe ser un Object ID (GUID en minúsculas), no un correo."
  }
}

variable "retencion_backups_dias" {
  description = "Días que se conserva cada backup en el Storage. Generoso a propósito: si la VM deja de respaldar, la política de ciclo de vida no debe borrar el último backup bueno."
  type        = number
  default     = 90
}

variable "auto_shutdown_hora" {
  description = "Hora de apagado diario de la VM de recuperación (HHMM, hora de Lima). ADR-011: 02:00."
  type        = string
  default     = "0200"
}
