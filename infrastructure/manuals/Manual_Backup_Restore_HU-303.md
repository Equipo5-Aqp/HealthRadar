# Manual de Backup y Restore — HU-303 / ADR-015

Lo que se hizo, en orden:

1. **Azure:** Storage para los backups y Key Vault para el `.env` (sección 1).
2. **Backups:** los 2 backups semanales de la VM de producción, cada uno con su `.sha256` (sección 2).
3. **Restore:** HealthRadar levantado en un Ubuntu local, por SSH desde la laptop y con `tmux` (sección 3).

| Terminal | Prompt |
| --- | --- |
| Laptop (PowerShell) | `PS D:\GitHub\HealthRadar>` |
| VM de Azure (producción) | `azureuser@healthradar-vm:~$` |
| Ubuntu local (VMware) | `<usuario>@<servidor>:~$` |

---

## 1. Lo que se creó en Azure (desde la laptop)

### 1.1 Identidad administrada de la VM de producción

Permite que la VM suba backups al Storage sin guardar claves. No reinicia la VM.

Portal → VM `healthradar-vm` → **Seguridad** → **Identidad** → *Asignada por el sistema* → **Activado** → **Guardar** → copiar el **Id. de objeto (entidad de seguridad)**.

### 1.2 Storage y Key Vault con Terraform

```powershell
az login
cd infrastructure\terraform
Copy-Item terraform.tfvars.example terraform.tfvars
notepad terraform.tfvars
```

```hcl
subscription_id        = "<az account show --query id -o tsv>"
sufijo_unico           = "ch1n1t0"
vm_actual_principal_id = "<Id. de objeto del paso 1.1>"
crear_vm               = false
```

```powershell
terraform init
terraform plan     # solo RG, Storage, contenedor, política, Key Vault y roles
terraform apply    # escribir "yes"
terraform output
```

Quedó creado:

| Recurso | Nombre | Para qué |
| --- | --- | --- |
| Grupo de recursos | `healthradar-dr-rg` | Separado del RG de la VM: sobrevive si la VM se borra |
| Storage Account | `healthradarbkch1n1t0` | Copia off-site de los backups |
| Contenedor | `backups` | Privado |
| Política de ciclo de vida | `borrar-backups-antiguos` | Borra backups de más de 90 días |
| Key Vault | `healthradar-kv-ch1n1t0` | Guarda el `.env` como secreto `healthradar-env` |
| Roles RBAC | — | Tu cuenta: *Storage Blob Data Contributor* y *Key Vault Secrets Officer*. La VM: *Storage Blob Data Contributor* (contenedor) y *Key Vault Secrets User* |

> `terraform.tfstate` y `terraform.tfvars` no se versionan. Guárdalos junto a la clave SSH.

### 1.3 Subir el `.env` al Key Vault

```powershell
scp -i "$HOME\.ssh\healthradar-vm_key.pem" azureuser@<IP_VM_AZURE>:~/HealthRadar/infrastructure/.env "$env:TEMP\hr.env"
az keyvault secret set --vault-name healthradar-kv-ch1n1t0 -n healthradar-env -f "$env:TEMP\hr.env" --query id -o tsv
Remove-Item "$env:TEMP\hr.env"
```

El `.env` incluye la `N8N_ENCRYPTION_KEY`: sin ella, las credenciales de n8n del backup no se pueden descifrar. Si cambias el `.env` de producción, repite este paso.

---

## 2. Los 2 backups y sus `.sha256` (en la VM de Azure)

| Backup | Contenido |
| --- | --- |
| `pg_<año>-W<semana>.dump.gz` + `.sha256` | Toda la base PostgreSQL, **incluido n8n** (workflows y credenciales cifradas), porque comparten la base |
| `n8n-workflows_<año>-W<semana>.tar.gz` + `.sha256` | Un JSON por workflow, para restaurar un solo flujo |

Los `.sha256` permiten detectar un backup corrupto: el restore los verifica antes de tocar la base.

Entra a la VM:

```powershell
ssh -i "$HOME\.ssh\healthradar-vm_key.pem" azureuser@<IP_VM_AZURE>
```

### 2.1 Hora de Lima y carpeta

```bash
sudo timedatectl set-timezone America/Lima
mkdir -p ~/backups/healthradar && chmod 700 ~/backups/healthradar
```

Con la VM en UTC, el backup "de las 20:00" correría a las 15:00 de Lima.

### 2.2 Programar el backup (viernes 20:00)

```bash
( crontab -l 2>/dev/null | grep -v -e backup_healthradar.sh -e '^TZ=America/Lima' -e '^BACKUP_STORAGE_'
cat <<'EOF'
TZ=America/Lima
BACKUP_STORAGE_ACCOUNT=healthradarbkch1n1t0
BACKUP_STORAGE_CONTAINER=backups
HR_KEY_VAULT=healthradar-kv-ch1n1t0
0 20 * * 5 /home/azureuser/HealthRadar/infrastructure/scripts-poc-arquitectura/backup_healthradar.sh >> /home/azureuser/backups/healthradar/backup.log 2>&1
EOF
) | crontab -
crontab -l
```

Con `HR_KEY_VAULT`, cada backup avisa en el log si el `.env` del Key Vault ya no coincide con el de la VM (sección 1.3). Sin `BACKUP_STORAGE_ACCOUNT`, el backup se queda solo en la VM. En la VM se conservan las últimas **2** semanas; en el Storage, **90 días**.

### 2.3 Primera corrida manual

```bash
BACKUP_STORAGE_ACCOUNT=healthradarbkch1n1t0 HR_KEY_VAULT=healthradar-kv-ch1n1t0 ~/HealthRadar/infrastructure/scripts-poc-arquitectura/backup_healthradar.sh
```

✅ Debe terminar así:

```
[1/3] pg_dump de ... (incluye datos + n8n: misma BD)...
 -> OK: pg_2026-W45.dump.gz (56M).
[2/3] Export de workflows n8n...
 -> OK: n8n-workflows_2026-W45.tar.gz con N flujos (...).
[off-site] Subiendo a healthradarbkch1n1t0/backups...
 -> OK: 4 archivos subidos al Storage.
[env] Comparando infrastructure/.env con Key Vault healthradar-kv-ch1n1t0...
 -> OK: el .env de Key Vault coincide con el de esta VM.
[3/3] Rotacion (retencion: 2)...
  [EXITO] Backup semanal completado.
```

### 2.4 Verificar en Azure (desde la laptop)

```powershell
az storage blob list --account-name healthradarbkch1n1t0 -c backups --auth-mode login --query "[].{archivo:name, bytes:properties.contentLength}" -o table
```

✅ 4 archivos: `pg_...dump.gz` (decenas de MB), `n8n-workflows_...tar.gz` (varios KB; si pesa ~111 bytes está vacío) y sus dos `.sha256`.

---

## 3. Restore en el Ubuntu local (por SSH desde la laptop)

El Ubuntu local es una VM de VMware con **Ubuntu Server 24.04** (igual que producción), 4096 MB de RAM, 2 CPU, red NAT y OpenSSH instalado. Su IP (`ip -4 addr show`) es `<IP_UBUNTU>`.

### 3.1 Llevar el backup y el `.env` (en la laptop)

```powershell
$SA = "healthradarbkch1n1t0"; $KV = "healthradar-kv-ch1n1t0"; $U = "<usuario>"; $IP = "<IP_UBUNTU>"
Remove-Item "$env:TEMP\pg.dump.gz*", "$env:TEMP\hr.env" -ErrorAction SilentlyContinue

$ultimo = az storage blob list --account-name $SA -c backups --auth-mode login --query "sort_by([?ends_with(name,'.dump.gz')], &properties.lastModified)[-1].name" -o tsv
az storage blob download --account-name $SA -c backups --auth-mode login -n $ultimo -f "$env:TEMP\pg.dump.gz" -o none
az storage blob download --account-name $SA -c backups --auth-mode login -n "$ultimo.sha256" -f "$env:TEMP\pg.dump.gz.sha256" -o none
az keyvault secret download --vault-name $KV -n healthradar-env -f "$env:TEMP\hr.env"

scp "$env:TEMP\pg.dump.gz" "$env:TEMP\pg.dump.gz.sha256" "$env:TEMP\hr.env" "${U}@${IP}:~/"
Remove-Item "$env:TEMP\pg.dump.gz*", "$env:TEMP\hr.env"
```

✅ `scp` muestra 3 líneas al `100%`. El último `Remove-Item` borra de la laptop el `.env` con secretos de producción.

### 3.2 Entrar por SSH y abrir tmux

```powershell
ssh <usuario>@<IP_UBUNTU>
```

```bash
ls -lh ~/pg.dump.gz ~/pg.dump.gz.sha256 ~/hr.env
tmux new -s hr
```

`tmux` mantiene el proceso vivo si se corta el SSH. Aparece una barra verde abajo.

### 3.3 Levantar todo el sistema

Dentro de tmux:

```bash
git clone https://github.com/Equipo5-Aqp/HealthRadar.git ~/HealthRadar
sudo bash ~/HealthRadar/infrastructure/scripts-poc-arquitectura/tf_bootstrap_vm.sh --env-file ~/hr.env --dump ~/pg.dump.gz
```

Clona **sin** `sudo`: el script usa como dueño del sistema al dueño de la carpeta del repo.

| Etapa | Qué hace | Tiempo aprox. |
| --- | --- | --- |
| `[1/6] Swap` | 4 GB de swap y hora de Lima | segundos |
| `[2/6] Docker` | Instala Docker oficial | 2–5 min |
| `[3/6] Variables de entorno` | Copia `hr.env` a `infrastructure/.env` | segundos |
| `[4/6] Compilando imagenes` | n8n y los 3 microfrontends, una a la vez | 5–40 min |
| `[5/6] Datos` | Verifica el sha256, restaura el dump y aplica migraciones | 3–8 min |
| `[6/6] Cron de backups` | Programa el backup semanal | segundos |

✅ Termina con **`[EXITO] HealthRadar levantado desde cero.`** y los 7 contenedores en `(healthy)`. Si falla, repetir el mismo `sudo bash ...` es seguro: no restaura dos veces.

| tmux | Teclas |
| --- | --- |
| Salir sin detener el proceso | **Ctrl+B**, suelta, **D** |
| Volver (también tras un corte de SSH) | `tmux attach -t hr` |
| Ver texto anterior | **Ctrl+B**, suelta, **[** → flechas. Sales con **q** |

### 3.4 Verificar

1. Navegador de la laptop: `http://<IP_UBUNTU>:3000` → login con un usuario de producción → Panorama, Consulta e Históricos.
2. Conteos (en el Ubuntu con `sudo`; en la VM de Azure sin `sudo`). Deben coincidir:

   ```bash
   sudo docker exec healthradar-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT count(*) AS migraciones FROM healthradar_schema_migrations;" -c "SELECT count(*) AS workflows FROM workflow_entity;" -c "SELECT count(*) AS usuarios FROM usuario;"'
   ```

### 3.5 Apagar al terminar

La copia usa las **API keys reales**: mientras esté encendida, n8n ejecuta los workflows programados y gasta cuota. En el Ubuntu:

```bash
shred -u ~/hr.env ~/pg.dump.gz ~/pg.dump.gz.sha256
sudo docker compose -f ~/HealthRadar/infrastructure/docker-compose.yml down
```

Para volver a mostrarlo: `sudo docker compose -f ~/HealthRadar/infrastructure/docker-compose.yml up -d`.
