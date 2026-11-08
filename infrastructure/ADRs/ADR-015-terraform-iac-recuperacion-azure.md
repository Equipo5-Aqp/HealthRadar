# ADR-015: Terraform como Infraestructura como Código para la recuperación ante desastres en Azure

**Estado:** Aceptado (2026-10-30)
**Relacionado con:** ADR-002, ADR-008, ADR-011
**Complementa a:** ADR-011 (la VM sigue siendo la del portal; este ADR define cómo recrearla)

## Contexto

El ADR-011 aprovisionó la VM `Standard_B2als_v2` a mano desde el portal de Azure. La docente exige demostrar que el sistema se puede **restaurar completo si la VM se cae o se borra**, usando Infraestructura como Código (Terraform o equivalente).

Al revisar la recuperación se encontraron tres puntos únicos de falla:

1. **Infraestructura no reproducible:** red, NSG, IP fija, auto-shutdown, swap y Docker se configuraron a mano (`Manual_Despliegue_Azure_VM.md`).
2. **Backups en el mismo disco:** `backup_healthradar.sh` (HU-303) guarda los dumps en `/home/azureuser/backups/healthradar`. Si se borra la VM, se pierden con ella.
3. **Secretos solo en la VM:** `infrastructure/.env` contiene `N8N_ENCRYPTION_KEY`. Sin esa clave, las credenciales de n8n del dump son irrecuperables.

Restricciones: crédito de Azure for Students (US$100, ADR-011), 4 GiB de RAM sin contenedores nuevos (AGENTS.md, regla 1) y la VM de producción no debe arriesgarse.

## Decisión

Se adopta **Terraform (provider `azurerm` 4.x)** en `infrastructure/terraform/`, en **modo contingencia**:

- **Siempre existe** (`crear_vm = false`): un grupo de recursos `healthradar-dr-rg`, separado del de la VM del portal, con:
  - **Storage Account LRS**, contenedor privado `backups`, retención de 90 días y papelera de 7 días;
  - **Key Vault** (RBAC) con el secreto `healthradar-env` = contenido de `infrastructure/.env`.
  
  Ambos llevan `prevent_destroy`.
- **Solo en una recuperación o simulacro** (`crear_vm = true`): una VM idéntica a la del ADR-011 (B2als_v2, Ubuntu 24.04, 30 GiB StandardSSD, IP estática, NSG 22/3000, apagado a las 02:00 de Lima) con **identidad administrada**. cloud-init clona el repo y ejecuta `tf_bootstrap_vm.sh`: swap → Docker → `.env` desde Key Vault → build secuencial → `tf_restore_healthradar.sh` (último dump del Storage) → `migrate.sh` → stack → cron de backups.
- **La VM del portal no se importa.** Solo se le activa la identidad administrada para que `backup_healthradar.sh` suba cada backup al Storage (`BACKUP_STORAGE_ACCOUNT`).
- **Acceso sin claves:** VMs y scripts usan tokens IMDS de la identidad administrada (`tf_azure_blob.sh`: curl + python3, sin az CLI en la VM). El secreto se sube con `az keyvault secret set`, **fuera de Terraform**, para que el `.env` no quede en claro en `terraform.tfstate`.
- **Restore portable:** `tf_restore_healthradar.sh` funciona en cualquier host con Docker. Así se prueba gratis en una VM local de VMware Workstation (`tf_bootstrap_vm.sh --env-file --dump`) antes del simulacro en Azure.

Objetivos: **RPO de 1 semana** (backup de los viernes) y **RTO de ~30–40 min**.

## Alternativas descartadas

| Alternativa | Motivo |
| --- | --- |
| **Bicep / ARM** | Nativo de Azure, pero la docente pidió Terraform. Terraform es multi-nube y tiene `plan` legible para la revisión. |
| **Azure Backup (Recovery Services Vault)** | Snapshot de VM completa, pero cuesta ~US$5+/mes más almacenamiento: excesivo para el crédito estudiantil. Tampoco deja IaC. |
| **Importar la VM del portal a Terraform** | Un plan mal revisado podría modificar o recrear producción en plena entrega. Queda como paso posterior opcional. |
| **Disco de datos persistente para `/var/lib/docker`** | Sobrevive a la recreación de la VM, pero no al borrado del grupo de recursos ni a la corrupción. Los backups off-site cubren ambos casos. |
| **Estado remoto (backend `azurerm`)** | Requiere un storage de bootstrap previo. Con un solo operador (el Arquitecto), el estado local es suficiente. |

## Consecuencias

**Beneficios:**

- El sistema completo se recrea con `terraform apply -var crear_vm=true` (o `tf_recuperar_healthradar.ps1`), sin pasos manuales en el portal.
- Backups y secretos viven fuera de la VM. El borrado de la VM o de su grupo de recursos ya no destruye los datos.
- Costo en contingencia menor a US$0.10/mes. Un simulacro de 2 h cuesta ~US$0.10.
- Sin contenedores, RAM ni puertos nuevos (ADR-008).

**Riesgos y mitigación:**

| Riesgo | Mitigación |
| --- | --- |
| `.env` desactualizado en Key Vault | Volver a subirlo tras cada cambio de secretos (README de Terraform, 3.3). |
| La VM recreada tiene otra IP | Actualizar el secreto `AZURE_VM_HOST` de GitHub (el script lo recuerda). |
| Pérdida del estado local | Los recursos persistentes tienen `prevent_destroy` y nombres deterministas (`sufijo_unico`); se reimportan con `terraform import`. |
| La copia restaurada ejecuta los workflows programados de n8n con las API keys reales | Simulacros cortos, o desactivar los workflows en la copia. |
| Repo privado en el futuro | cloud-init necesitaría un token de lectura; hoy el clone HTTPS es anónimo, igual que `setup_azure_vm.sh`. |
