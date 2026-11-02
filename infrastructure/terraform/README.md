# Recuperación de HealthRadar desde cero (Terraform + Azure)

Manual para volver a levantar **todo el sistema** si la VM de Azure se cae, se corrompe o se borra. Decisión: [ADR-015](../ADRs/ADR-015-terraform-iac-recuperacion-azure.md).

| | |
| --- | --- |
| **RPO** (datos que se pueden perder) | hasta 1 semana (backup de los viernes a las 20:00) |
| **RTO** (tiempo para volver a estar en línea) | ~30–40 min (la mayor parte es compilar las 4 imágenes en 2 vCPU) |
| **Costo en contingencia** | menos de US$0.10/mes del crédito de Azure for Students |

## 1. Qué crea Terraform

```text
RG healthradar-dr-rg  (separado del RG de la VM del portal: sobrevive si esa VM se borra)
 ├─ Storage Account  healthradarbk<sufijo> ─ contenedor "backups" (privado, retención 90 días)
 ├─ Key Vault        healthradar-kv-<sufijo> ─ secreto "healthradar-env" (= infrastructure/.env)
 ├─ Permisos RBAC    tú + identidad de la VM actual
 └─ solo con crear_vm = true:
      VNet + NSG (22, 3000) + IP estática + VM B2als_v2 Ubuntu 24.04 + auto-shutdown 02:00
      └─ cloud-init → bootstrap_vm.sh: swap → Docker → .env desde Key Vault → build
                      → restore del último backup del Storage → stack arriba → cron de backups
```

| Modo | `crear_vm` | Qué existe | Para qué |
| --- | --- | --- | --- |
| Contingencia (normal) | `false` | Storage + Key Vault | La VM del portal respalda aquí cada semana |
| Recuperación / simulacro | `true` | Todo lo anterior + VM nueva | La VM nueva se restaura sola |

No agrega contenedores, no cambia la RAM ni los puertos de `docker-compose.yml` (AGENTS.md, reglas 1 y 2).

| Archivo | Rol |
| --- | --- |
| `versions.tf`, `variables.tf`, `main.tf` | Provider, variables, grupo de recursos |
| `storage.tf`, `keyvault.tf`, `rbac.tf` | Almacén externo de backups y secretos |
| `vm.tf`, `cloud-init.yaml.tftpl` | VM de recuperación (solo con `crear_vm = true`) |
| `../scripts-poc-arquitectura/bootstrap_vm.sh` | Convierte un Ubuntu vacío en el host de producción |
| `../scripts-poc-arquitectura/restore_healthradar.sh` | Restaura un dump y levanta el stack (en cualquier host con Docker) |
| `../scripts-poc-arquitectura/azure_blob.sh` | Acceso a Blob/Key Vault con identidad administrada (curl + python3) |
| `../scripts-poc-arquitectura/recuperar_healthradar.ps1` | Atajo de un comando desde Windows 11 |

## 2. Requisitos en tu laptop (Windows 11)

```powershell
winget install --id Hashicorp.Terraform -e
winget install --id Microsoft.AzureCLI -e
# Cerrar y abrir PowerShell, luego:
terraform -version
az login
az account show --query "{nombre:name, id:id}" -o table
```

La VM nueva usa la **misma clave SSH** que la actual, así el secreto `AZURE_VM_SSH_KEY` de GitHub Actions sigue sirviendo. Saca la clave pública de la privada:

```powershell
ssh-keygen -y -f "$HOME\.ssh\healthradar-vm_key.pem" | Out-File -Encoding ascii "$HOME\.ssh\healthradar-vm_key.pub"
```

## 3. Puesta en marcha (una sola vez, la VM actual no se toca)

### 3.1 Activar la identidad administrada de la VM actual

Le permite subir backups al Storage sin claves. No reinicia la VM.

- **Portal:** VM `healthradar-vm` → **Seguridad** → **Identidad** → pestaña *Asignada por el sistema* → **Estado: Activado** → **Guardar** → copiar el **Id. de objeto (entidad de seguridad)**.
- **O con az CLI:**

  ```powershell
  az vm identity assign -g <grupo-de-la-vm-actual> -n healthradar-vm --query systemAssignedIdentity -o tsv
  ```

### 3.2 Crear el Storage y el Key Vault

```powershell
cd infrastructure\terraform
Copy-Item terraform.tfvars.example terraform.tfvars
notepad terraform.tfvars   # subscription_id, sufijo_unico, vm_actual_principal_id; crear_vm = false
terraform init
terraform plan             # debe mostrar solo RG, Storage, contenedor, política, Key Vault y roles
terraform apply            # escribir "yes"
terraform output
```

> **Anota `sufijo_unico`** y los outputs `storage_account` y `key_vault`. Si pierdes `terraform.tfstate`, con esos nombres encuentras todo en el portal.

### 3.3 Subir el `.env` a Key Vault

El `.env` vive en la VM. Tráelo, súbelo como secreto y **borra la copia local**:

```powershell
scp -i "$HOME\.ssh\healthradar-vm_key.pem" azureuser@<IP_VM_ACTUAL>:~/HealthRadar/infrastructure/.env "$env:TEMP\hr.env"
az keyvault secret set --vault-name <key_vault> -n healthradar-env -f "$env:TEMP\hr.env" --query id -o tsv
Remove-Item "$env:TEMP\hr.env"
```

> Tiene que ser con `az`: el cuadro de texto del portal no acepta secretos de varias líneas.
> Si cambias el `.env` de producción (rotar una API key, etc.), repite este paso. Si no, la VM restaurada arrancaría con el `.env` viejo.

### 3.4 Activar la copia off-site del backup semanal

Primero este cambio tiene que estar en `main`. Al hacer merge, `deploy.yml` actualiza solo el repo de la VM. No uses `git pull`: la VM queda en un commit fijo (HEAD separado). En la VM actual (por SSH), comprueba que llegó y edita el crontab:

```bash
ls ~/HealthRadar/infrastructure/scripts-poc-arquitectura/azure_blob.sh   # debe existir
crontab -e
```

Deja el crontab así. Las líneas `BACKUP_STORAGE_*` son las nuevas; el script lee estas variables del entorno, no del `.env`:

```cron
TZ=America/Lima
BACKUP_STORAGE_ACCOUNT=<storage_account>
BACKUP_STORAGE_CONTAINER=backups
0 20 * * 5 /home/azureuser/HealthRadar/infrastructure/scripts-poc-arquitectura/backup_healthradar.sh >> /home/azureuser/backups/healthradar/backup.log 2>&1
```

Prueba manual y verificación desde tu laptop:

```bash
# En la VM
BACKUP_STORAGE_ACCOUNT=<storage_account> ~/HealthRadar/infrastructure/scripts-poc-arquitectura/backup_healthradar.sh
```

```powershell
# En tu laptop
az storage blob list --account-name <storage_account> -c backups --auth-mode login --query "[].{nombre:name, tamano:properties.contentLength}" -o table
```

Deben aparecer `pg_<semana>.dump.gz`, `n8n-workflows_<semana>.tar.gz` y sus `.sha256`.

> El cron usa la zona horaria del sistema. Revisa `timedatectl` en la VM actual: si dice `UTC`, el backup corre a las 15:00 de Lima. Para corregirlo: `sudo timedatectl set-timezone America/Lima`. La VM de recuperación ya la fija sola.

## 4. Recuperación real (la VM de producción se perdió)

```powershell
cd <repo>
.\infrastructure\scripts-poc-arquitectura\recuperar_healthradar.ps1
```

Equivale a `terraform apply -var crear_vm=true`. Después:

1. **Deja `crear_vm = true` en `terraform.tfvars`.** Si no, el próximo `terraform apply` sin `-var` borraría la VM.
2. Sigue el progreso: `ssh -i ~/.ssh/healthradar-vm_key.pem azureuser@<IP> 'tail -f /var/log/healthradar-bootstrap.log'`, o `cloud-init status --wait`.
3. Cuando aparezca `[EXITO] HealthRadar levantado desde cero.`, abre `http://<IP>:3000` e inicia sesión.
4. Actualiza el secreto **`AZURE_VM_HOST`** en GitHub (Settings → Secrets and variables → Actions) con la IP nueva, para que `deploy.yml` despliegue ahí.
5. Si la VM vieja sigue existiendo pero dañada, bórrala desde el portal cuando la nueva esté verificada.

## 5. Simulacro en Azure (opcional, ~US$0.10)

Es la demostración completa en la nube. Sale del crédito de estudiante, no de tu bolsillo, y puedes omitirla si basta la prueba en VMware (sección 6).

1. `recuperar_healthradar.ps1` → esperar el `[EXITO]` en el log.
2. Comparar con producción (en cada VM):

   ```bash
   docker exec healthradar-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT count(*) AS migraciones FROM healthradar_schema_migrations;" -c "SELECT count(*) AS workflows FROM workflow_entity;"'
   ```

3. Abrir `http://<IP_nueva>:3000`, iniciar sesión y revisar el dashboard y los históricos.
4. Retirar la VM: `recuperar_healthradar.ps1 -Destruir`. Storage y Key Vault se conservan.

> Mientras exista, la copia restaurada ejecuta los workflows programados de n8n (Fase A/B, clima, embeddings) con las **API keys reales**. Haz el simulacro corto, o desactiva los workflows programados en la copia.

## 6. Prueba local en VMware Workstation Pro 17 (US$0)

Terraform solo crea recursos en Azure: no puede crear la VM en VMware. En tu laptop se prueba **lo que corre dentro de la VM** (`bootstrap_vm.sh` + `restore_healthradar.sh`), que es la parte que más puede fallar. La VM local es gratis: la ISO de Ubuntu Server y VMware Workstation Pro 17 (uso personal) no cuestan nada, y la VM usa la RAM y CPU de tu laptop (mínimo 8 GB en total; ideal 16 GB).

### 6.1 Crear la VM

1. Descarga **Ubuntu Server 24.04 LTS** (ISO) desde ubuntu.com/download/server.
2. VMware → *Create a New Virtual Machine* → *Typical* → ISO descargada.
3. Hardware igual a la B2als_v2: **4 GB de RAM, 2 vCPU, disco de 40 GB**. Red **NAT**.
4. En el instalador: usuario a elección (p. ej. `hradmin`) y marcar **Install OpenSSH server**.
5. Al terminar, en la VM: `ip -4 addr show` → anota la IP (p. ej. `192.168.x.x`).

### 6.2 Llevar el backup y el `.env` a la VM

Desde tu laptop (PowerShell). Baja el último backup del Storage (o cópialo de la VM actual con `scp`) y el `.env` desde Key Vault:

```powershell
az storage blob download --account-name <storage_account> -c backups --auth-mode login -n pg_<semana>.dump.gz -f "$env:TEMP\pg.dump.gz"
az storage blob download --account-name <storage_account> -c backups --auth-mode login -n pg_<semana>.dump.gz.sha256 -f "$env:TEMP\pg.dump.gz.sha256"
az keyvault secret download --vault-name <key_vault> -n healthradar-env -f "$env:TEMP\hr.env"

scp "$env:TEMP\pg.dump.gz" "$env:TEMP\pg.dump.gz.sha256" "$env:TEMP\hr.env" hradmin@<IP_VM_LOCAL>:~/
Remove-Item "$env:TEMP\pg.dump.gz*", "$env:TEMP\hr.env"
```

### 6.3 Levantar el sistema en la VM

```bash
ssh hradmin@<IP_VM_LOCAL>
git clone https://github.com/Roberto-Bautista/Celula5_HealthRadar.git ~/HealthRadar
sudo bash ~/HealthRadar/infrastructure/scripts-poc-arquitectura/bootstrap_vm.sh \
  --env-file ~/hr.env --dump ~/pg.dump.gz
```

Es exactamente lo que ejecuta cloud-init en Azure, pero con el `.env` y el dump locales (modo local: no usa Key Vault ni Blob).

**Éxito:**

- el log termina en `[EXITO] HealthRadar levantado desde cero.`;
- `http://<IP_VM_LOCAL>:3000` abre desde el navegador de tu laptop y el login funciona;
- los conteos de la sección 5, paso 2, coinciden con producción.

Al terminar: `shred -u ~/hr.env` y borra la VM (contiene secretos de producción). Aplica la misma advertencia sobre los workflows programados de la sección 5.

### 6.4 Restore en un host que ya tiene Docker (WSL, Docker Desktop, otro servidor)

Si el host ya tiene Docker y el repo clonado, basta con el `.env` en `infrastructure/.env` y:

```bash
bash infrastructure/scripts-poc-arquitectura/restore_healthradar.sh ~/pg.dump.gz
```

## 7. Validar Terraform sin crear nada

```powershell
cd infrastructure\terraform
terraform fmt -check
terraform init
terraform validate
terraform plan                      # contingencia: no debe tocar la VM del portal
terraform plan -var crear_vm=true   # revisar la VM que se crearía, sin aplicar
```

El CI (`infra-security-ci.yml`, job `verify-terraform`) corre `fmt` y `validate` en cada PR.

## 8. Costos aproximados (Central US, USD)

Confírmalos en la [calculadora de precios de Azure](https://azure.microsoft.com/pricing/calculator/).

| Recurso | Cuándo cobra | Aprox. |
| --- | --- | --- |
| Storage LRS Hot (1–4 GB de backups) | siempre | ~$0.02–0.08/mes |
| Key Vault Standard (1 secreto, pocas lecturas) | por operación ($0.03 / 10 000) | ~$0.00 |
| Grupo de recursos, VNet, NSG, roles | — | gratis |
| VM B2als_v2 + disco + IP estática | solo con `crear_vm = true` | ~$0.05/h (simulacro de 2 h ≈ $0.10) |

## 9. Estado de Terraform

El estado (`terraform.tfstate`) es **local** y no se versiona (`.gitignore`). Guárdalo junto a la clave SSH. Si se pierde:

- Storage, contenedor y Key Vault siguen existiendo (`prevent_destroy`). Impórtalos:

  ```powershell
  terraform import azurerm_resource_group.dr /subscriptions/<sub>/resourceGroups/healthradar-dr-rg
  terraform import azurerm_storage_account.backups /subscriptions/<sub>/resourceGroups/healthradar-dr-rg/providers/Microsoft.Storage/storageAccounts/<storage_account>
  terraform import azurerm_key_vault.secretos /subscriptions/<sub>/resourceGroups/healthradar-dr-rg/providers/Microsoft.KeyVault/vaults/<key_vault>
  ```

  Haz lo mismo con cada recurso que `terraform apply` reporte como "already exists" (contenedor, política, roles). El ID de cada uno aparece en el mensaje de error.

- O, en una emergencia, levanta el sistema en cualquier host con Docker usando la sección 6.

## 10. Problemas comunes

| Síntoma | Causa / solución |
| --- | --- |
| `StorageAccountAlreadyTaken` o nombre de vault ocupado | Los nombres son globales: cambia `sufijo_unico` |
| `RequestDisallowedByPolicy` | Región no permitida por Azure for Students: usa `centralus`, `eastus`, `brazilsouth`, `chilecentral` o `westus3` |
| Log: `intento n/20 fallido ... RBAC` | Normal los primeros minutos: el permiso de la VM tarda en propagarse |
| `No se encontro ningun pg_*.dump.gz` | Todavía no corrió un backup con `BACKUP_STORAGE_ACCOUNT` (sección 3.4) |
| `La BD ya tiene N tablas` | El restore se niega a pisar datos. En una VM nueva no pasa; para forzar: `restore_healthradar.sh --force <dump>` |
| n8n arranca pero las credenciales fallan | El `.env` de Key Vault no tiene la `N8N_ENCRYPTION_KEY` original: vuelve a subirlo (3.3) |
| Ver el log de arranque | `sudo tail -n 200 /var/log/healthradar-bootstrap.log` y `cloud-init status --long` |
| Re-ejecutar el arranque | `sudo bash ~/HealthRadar/infrastructure/scripts-poc-arquitectura/bootstrap_vm.sh` (idempotente; no restaura dos veces) |
