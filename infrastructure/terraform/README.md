# Recuperación de HealthRadar desde cero (Terraform + Azure)

Manual para volver a levantar **todo el sistema**, con sus datos, en una máquina nueva. Decisión: [ADR-015](../ADRs/ADR-015-terraform-iac-recuperacion-azure.md).

| | |
| --- | --- |
| **RPO** (datos que se pueden perder) | hasta 1 semana (backup de los viernes a las 20:00) |
| **RTO** (tiempo para volver a estar en línea) | ~30–40 min (la mayor parte es compilar las 4 imágenes en 2 vCPU) |
| **Costo en contingencia** | menos de US$0.10/mes del crédito de Azure for Students |

¿Qué quieres hacer?

| Situación | Sección |
| --- | --- |
| Tengo un Ubuntu (VMware, servidor, otra nube) y quiero HealthRadar funcionando con los datos de producción | [2. Restaurar en un Ubuntu](#2-restaurar-en-un-ubuntu-cualquiera), opción A |
| Tengo una PC con **Windows** y quiero lo mismo | [2. Restaurar en un Ubuntu](#2-restaurar-en-un-ubuntu-cualquiera), opción B (Ubuntu dentro de Windows con WSL) |
| Soy el Arquitecto y debo dar acceso a una persona | [3. Dar acceso](#3-dar-acceso-a-una-persona-arquitecto) |
| La VM de Azure se perdió y quiero una nueva en Azure | [4. Recuperación en Azure](#4-recuperación-en-azure-con-terraform) |

## 1. Cómo funciona (leer primero)

HealthRadar se reconstruye con **tres piezas**:

| Pieza | Qué contiene | Dónde vive |
| --- | --- | --- |
| Código | Microfrontends, n8n, migraciones, `docker-compose.yml`, scripts | Este repositorio (`git clone`) |
| `.env` | Contraseñas, API keys y la `N8N_ENCRYPTION_KEY` | Key Vault `healthradar-kv-<sufijo>`, secreto `healthradar-env` |
| Dump de PostgreSQL | **Todos los datos**: casos, históricos, embeddings, usuarios de la app, workflows y credenciales de n8n, trazas de Phoenix (todo comparte la misma base) | Storage `healthradarbk<sufijo>`, contenedor `backups` |

Terraform **crea** el Key Vault y el Storage (vacíos) y da los permisos. **No mueve datos**: el `.env` lo sube el Arquitecto con `az`, y el cron de la VM de producción sube el dump cada viernes.

```text
VM de producción ── cron viernes 20:00 ── backup_healthradar.sh ──▶ Storage (pg_<semana>.dump.gz + .sha256)
Arquitecto ── az keyvault secret set ───────────────────────────────▶ Key Vault (.env)

Ubuntu nuevo:  git clone ─▶ tf_preparar_host.sh (login con TU cuenta: baja .env y dump)
                         ─▶ tf_bootstrap_vm.sh  (Docker, build, restore, arranque, cron)
```

Sin la `N8N_ENCRYPTION_KEY` del `.env` original, las credenciales de n8n del dump no se pueden descifrar. Por eso siempre se restauran **las dos cosas juntas**.

## 2. Restaurar en un Ubuntu cualquiera

Para una persona que nunca tocó el sistema. Hay dos formas de tener el Ubuntu; desde el paso 2.3 los comandos son **los mismos**:

| | Opción A: Ubuntu en VMware (o un servidor) | Opción B: Windows con WSL |
| --- | --- | --- |
| Qué es | Una máquina virtual o física con Ubuntu | Un Ubuntu real que corre dentro de Windows (lo instala Microsoft, gratis) |
| Cómo entras | Por SSH desde tu laptop | Abriendo la app **Ubuntu 24.04** del menú Inicio |
| Dirección del sistema | `http://<IP_UBUNTU>:3000` | `http://localhost:3000` |

¿Por qué no "directo" en Windows? Los contenedores de HealthRadar son de Linux y necesitan un kernel de Linux. Incluso Docker Desktop crea por dentro una distro WSL oculta. Con WSL visible se usan los mismos scripts que en producción.

### 2.1 Lo que necesitas

| Qué | Detalle |
| --- | --- |
| Opción A: un Ubuntu Server **24.04** | 4 GB de RAM, 2 CPU, 30 GB de disco, internet y OpenSSH. En VMware: red NAT o Bridged |
| Opción B: Windows 10 (22H2) u 11 | 8 GB de RAM como mínimo (16 GB recomendado), 30 GB libres en `C:`, virtualización activada en la BIOS (casi siempre viene activada), permiso de administrador |
| Usuario con `sudo` en ese Ubuntu | El que creaste al instalarlo |
| Tu cuenta `@usmp.pe` con permiso | Pídele al Arquitecto que te agregue (sección 3). Sin eso, el paso 2.4 da *Forbidden* |
| El sufijo de los recursos | `ch1n1t0` |
| En tu laptop | Un navegador (y en la opción A, una terminal con `ssh`; Windows 11 ya lo trae). No hace falta instalar Azure CLI ni Terraform en Windows |

Nunca pidas ni prestes la contraseña de otra cuenta de Azure: cada persona entra con la suya.

### 2.2 Abrir una terminal de Ubuntu

#### Opción A: Ubuntu en VMware (por SSH)

En la consola del Ubuntu (la ventana de VMware):

```bash
hostname -I
```

La primera dirección (por ejemplo `192.168.88.130`) es `<IP_UBUNTU>`. Desde la terminal de tu laptop:

```powershell
ssh <usuario>@<IP_UBUNTU>
```

#### Opción B: Windows con WSL

1. Abre **PowerShell como administrador** (clic derecho en Inicio → *Terminal (administrador)*) e instala Ubuntu 24.04:

   ```powershell
   wsl --install -d Ubuntu-24.04
   ```

   Si pide reiniciar, reinicia. Si ya tenías WSL con otra distro, este comando agrega Ubuntu 24.04 aparte, sin tocar la otra.

2. Abre **Ubuntu 24.04** desde el menú Inicio. La primera vez pide crear un usuario y una contraseña de Linux (no tienen relación con tu cuenta de Windows ni con Azure). Esa contraseña es la de `sudo`.

3. Solo si tienes **Docker Desktop** instalado: ciérralo durante la restauración (icono de la ballena junto al reloj → *Quit Docker Desktop*). El script instala su propio Docker dentro de Ubuntu.

4. Solo si tu PC tiene **8 GB de RAM**: WSL usa por defecto la mitad (4 GB). Para darle 6 GB, en PowerShell (normal):

   ```powershell
   notepad "$env:USERPROFILE\.wslconfig"
   ```

   Escribe estas dos líneas, guarda y ejecuta `wsl --shutdown`. Luego vuelve a abrir Ubuntu.

   ```ini
   [wsl2]
   memory=6GB
   ```

Desde aquí, todos los comandos van **en la ventana de Ubuntu**, no en PowerShell. Mantén esa ventana abierta mientras uses el sistema: si se cierran todas, WSL puede apagarse.

### 2.3 Clonar el repositorio

En el Ubuntu, **sin `sudo`** (el dueño de la carpeta será el usuario que opera el sistema):

```bash
git clone https://github.com/Equipo5-Aqp/HealthRadar.git ~/HealthRadar
```

> Si dice `git: command not found`: `sudo apt-get update && sudo apt-get install -y git`.
>
> En WSL, clona en `~` (dentro de Ubuntu), **nunca** en `/mnt/c/...`. Las carpetas de Windows cambian los finales de línea de los scripts (CRLF) y son mucho más lentas para Docker.

### 2.4 Fase 1: preparar el host (~5 min, interactivo)

```bash
bash ~/HealthRadar/infrastructure/scripts-poc-arquitectura/tf_preparar_host.sh --sufijo ch1n1t0
```

El script pide la clave de `sudo` (solo para instalar paquetes) y luego muestra algo así:

```text
To sign in, use a web browser to open the page https://microsoft.com/devicelogin
and enter the code ABCD1234 to authenticate.
```

En el **navegador de tu laptop**, abre esa página, escribe el código y entra con **tu** cuenta `@usmp.pe`. Tu contraseña nunca pasa por el Ubuntu. Si el navegador ya tenía tu sesión de la USMP abierta, no vuelve a pedir la contraseña: es normal.

Si después aparece una lista de suscripciones (*Select a subscription and tenant*), presiona **Enter**. Da igual cuál quede: el script solo usa los permisos sobre el Key Vault y el Storage.

| Etapa | Qué hace |
| --- | --- |
| `[1/5]` | Revisa Ubuntu, RAM y disco, y muestra la IP. En WSL, además, comprueba `systemd` y que no esté usando el Docker de Docker Desktop |
| `[2/5]` | Instala `git`, `curl`, `tmux` y Azure CLI |
| `[3/5]` | Login con código (sesión temporal: se borra al terminar) |
| `[4/5]` | Baja el `.env` del Key Vault a `infrastructure/.env` (permisos 600) y comprueba que no falten variables |
| `[5/5]` | Baja el último `pg_*.dump.gz` y su `.sha256` a `~/backups/healthradar/restore/` y verifica el hash |

✅ Termina con `[LISTO] Fase 1 completada` y te muestra el comando exacto de la fase 2. Si falla, corrige lo que dice el error y vuelve a ejecutarlo: es seguro repetirlo.

### 2.5 Fase 2: levantar el sistema (~30–40 min, desatendido)

Dentro de `tmux`, para que siga corriendo si se corta el SSH (en WSL no hay SSH, pero tampoco molesta):

```bash
tmux new -s hr
sudo bash ~/HealthRadar/infrastructure/scripts-poc-arquitectura/tf_bootstrap_vm.sh --dump ~/backups/healthradar/restore/pg_<semana>.dump.gz
```

(Copia la ruta exacta que imprimió la fase 1.)

| Etapa | Qué hace | Tiempo aprox. |
| --- | --- | --- |
| `[1/6] Swap` | 4 GB de swap y hora de Lima (en WSL se omite la swap: la maneja Windows) | segundos |
| `[2/6] Docker` | Instala Docker oficial | 2–5 min |
| `[3/6] Variables de entorno` | Conserva el `.env` de la fase 1 y valida `docker compose config` | segundos |
| `[4/6] Compilando imagenes` | n8n y los 3 microfrontends, una a la vez | 5–40 min |
| `[5/6] Datos` | Verifica el sha256, restaura el dump y aplica migraciones nuevas | 3–8 min |
| `[6/6] Cron de backups` | Programa un backup local semanal en este host | segundos |

✅ Termina con **`[EXITO] HealthRadar levantado desde cero.`** y los 7 contenedores en `(healthy)`. Si falla, repetir el mismo `sudo bash ...` es seguro: no restaura dos veces.

| tmux | Teclas |
| --- | --- |
| Salir sin detener el proceso | **Ctrl+B**, suelta, **D** |
| Volver (también tras un corte de SSH) | `tmux attach -t hr` |
| Ver texto anterior | **Ctrl+B**, suelta, **[** → flechas. Sales con **q** |

### 2.6 Verificar

1. En el navegador: `http://<IP_UBUNTU>:3000` (opción A) o `http://localhost:3000` (opción B) → inicia sesión con un usuario de producción → revisa Panorama, Consulta e Históricos.
2. Conteos (deben coincidir con producción):

   ```bash
   sudo docker exec healthradar-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT count(*) AS migraciones FROM healthradar_schema_migrations;" -c "SELECT count(*) AS workflows FROM workflow_entity;" -c "SELECT count(*) AS usuarios FROM usuario;"'
   ```

### 2.7 Al terminar

> **Importante:** la copia usa las **API keys reales**. Mientras esté encendida, n8n ejecuta los workflows programados (Fase A/B, clima, embeddings) y gasta cuota. No dejes una copia de prueba encendida.

```bash
shred -u ~/backups/healthradar/restore/pg_*                                   # copia del dump
sudo docker compose -f ~/HealthRadar/infrastructure/docker-compose.yml down     # apagar
```

Para volver a encenderla: `sudo docker compose -f ~/HealthRadar/infrastructure/docker-compose.yml up -d`. Si el Ubuntu se va a descartar, borra también `~/HealthRadar/infrastructure/.env` con `shred -u`.

En la opción B (WSL), desde PowerShell:

| Para | Comando |
| --- | --- |
| Apagar todo (Ubuntu y contenedores) | `wsl --shutdown` |
| Volver a encender | Abrir **Ubuntu 24.04**; los contenedores arrancan solos en ~2 min |
| **Borrar todo** (Ubuntu, datos, `.env` y dump) al terminar la evaluación | `wsl --unregister Ubuntu-24.04` (no se puede deshacer) |

## 3. Dar acceso a una persona (Arquitecto)

La persona recibe solo **lectura**: puede bajar el `.env` y los backups, pero no puede cambiar el `.env` ni borrar backups.

| Recurso | Rol que recibe |
| --- | --- |
| Key Vault | *Key Vault Secrets User* (leer el secreto) |
| Contenedor `backups` | *Storage Blob Data Reader* (listar y bajar) |

> Leer el `.env` significa ver **todas** las claves de producción. Da acceso solo a personas de confianza del equipo.

En tu laptop, con tu sesión de `az`:

```powershell
az ad user show --id personaX@usmp.pe --query id -o tsv     # Object ID de la persona
cd infrastructure\terraform
notepad terraform.tfvars
```

```hcl
operadores_lectura = [
  "11111111-2222-3333-4444-555555555555", # personaX@usmp.pe
]
```

```powershell
terraform plan     # debe mostrar solo 2 role_assignment nuevos por persona
terraform apply    # escribir "yes"
```

El permiso tarda hasta ~10 minutos en propagarse. Para **quitar** el acceso: borra el ID de la lista y repite `terraform apply`.

Tú no necesitas estar en la lista: como operador ya tienes permisos de escritura.

## 4. Recuperación en Azure con Terraform

Crea una VM nueva en Azure que se restaura sola: Terraform la crea y le pasa los **nombres** del Key Vault y del Storage por cloud-init. Después la VM baja el `.env` y el dump con su identidad administrada y ejecuta el mismo `tf_bootstrap_vm.sh` de la sección 2.

Requisitos en tu laptop (Windows 11): Terraform, Azure CLI y la clave SSH de producción.

```powershell
winget install --id Hashicorp.Terraform -e
winget install --id Microsoft.AzureCLI -e
# Cerrar y abrir PowerShell, luego:
az login
ssh-keygen -y -f "$HOME\.ssh\healthradar-vm_key.pem" | Out-File -Encoding ascii "$HOME\.ssh\healthradar-vm_key.pub"
```

La VM nueva usa la **misma clave SSH**, así el secreto `AZURE_VM_SSH_KEY` de GitHub Actions sigue sirviendo.

### 4.1 Recuperación real (la VM de producción se perdió)

```powershell
.\infrastructure\scripts-poc-arquitectura\tf_recuperar_healthradar.ps1
```

Equivale a `terraform apply -var crear_vm=true`. Después:

1. **Deja `crear_vm = true` en `terraform.tfvars`.** Si no, el próximo `terraform apply` sin `-var` borraría la VM.
2. Sigue el progreso: `ssh -i ~/.ssh/healthradar-vm_key.pem azureuser@<IP> 'tail -f /var/log/healthradar-bootstrap.log'`.
3. Cuando aparezca `[EXITO] HealthRadar levantado desde cero.`, abre `http://<IP>:3000` e inicia sesión.
4. Actualiza el secreto **`AZURE_VM_HOST`** en GitHub (Settings → Secrets and variables → Actions) con la IP nueva, para que `deploy.yml` despliegue ahí.
5. Si la VM vieja sigue existiendo pero dañada, bórrala desde el portal cuando la nueva esté verificada.

### 4.2 Simulacro en Azure (opcional, ~US$0.10)

1. `tf_recuperar_healthradar.ps1` → esperar el `[EXITO]` en el log.
2. Comparar los conteos de la sección 2.6 en ambas VMs (en Azure, sin `sudo`).
3. Retirar la VM: `tf_recuperar_healthradar.ps1 -Destruir`. Storage y Key Vault se conservan.

Aplica la misma advertencia de la sección 2.7: la copia ejecuta los workflows con las API keys reales.

## 5. Puesta en marcha inicial (una sola vez, ya realizada)

Así quedó configurado el sistema de respaldo. Solo se repite si se crea todo de nuevo. El detalle de lo ejecutado está en el [Manual de Backup y Restore](../manuals/Manual_Backup_Restore_HU-303.md).

1. **Identidad administrada de la VM de producción:** Portal → VM `healthradar-vm` → **Seguridad** → **Identidad** → *Asignada por el sistema* → **Activado** → copiar el **Id. de objeto**.
2. **Crear Storage y Key Vault:**

   ```powershell
   cd infrastructure\terraform
   Copy-Item terraform.tfvars.example terraform.tfvars
   notepad terraform.tfvars   # subscription_id, sufijo_unico, vm_actual_principal_id; crear_vm = false
   terraform init
   terraform plan             # solo RG, Storage, contenedor, política, Key Vault y roles
   terraform apply
   ```

3. **Subir el `.env`** (tiene que ser con `az`: el portal no acepta secretos de varias líneas):

   ```powershell
   scp -i "$HOME\.ssh\healthradar-vm_key.pem" azureuser@<IP_VM_ACTUAL>:~/HealthRadar/infrastructure/.env "$env:TEMP\hr.env"
   az keyvault secret set --vault-name healthradar-kv-<sufijo> -n healthradar-env -f "$env:TEMP\hr.env" --query id -o tsv
   Remove-Item "$env:TEMP\hr.env"
   ```

4. **Cron de la VM de producción** (`crontab -e`), con la copia off-site:

   ```cron
   TZ=America/Lima
   BACKUP_STORAGE_ACCOUNT=healthradarbk<sufijo>
   BACKUP_STORAGE_CONTAINER=backups
   HR_KEY_VAULT=healthradar-kv-<sufijo>
   0 20 * * 5 /home/azureuser/HealthRadar/infrastructure/scripts-poc-arquitectura/backup_healthradar.sh >> /home/azureuser/backups/healthradar/backup.log 2>&1
   ```

> **Mantén el `.env` del Key Vault al día.** La subida es manual: si cambias el `.env` de producción (rotar una API key, etc.), repite el paso 3. Si no, toda restauración arranca con el `.env` viejo.
>
> Para que no se olvide, el backup de cada viernes compara el `.env` de la VM con el del Key Vault (gracias a `HR_KEY_VAULT` en el crontab). Si no coinciden, escribe en el log los **nombres** de las variables distintas, nunca sus valores. Revísalo después de cada cambio y, de vez en cuando, en la VM:
>
> ```bash
> grep -E 'AVISO|\[env\]' ~/backups/healthradar/backup.log | tail -n 5
> ```
>
> `OK: el .env de Key Vault coincide` = todo bien. `[AVISO] El .env de Key Vault esta DESACTUALIZADO. Variables distintas: GEMINI_API_KEY` = repite el paso 3.

## 6. Qué crea Terraform y qué hace cada archivo

```text
RG healthradar-dr-rg  (separado del RG de la VM del portal: sobrevive si esa VM se borra)
 ├─ Storage Account  healthradarbk<sufijo> ─ contenedor "backups" (privado, retención 90 días)
 ├─ Key Vault        healthradar-kv-<sufijo> ─ secreto "healthradar-env" (lo sube el Arquitecto, no Terraform)
 ├─ Permisos RBAC    operador + VM de producción + operadores_lectura
 └─ solo con crear_vm = true:
      VNet + NSG (22, 3000) + IP estática + VM B2als_v2 Ubuntu 24.04 + auto-shutdown 02:00
```

| Modo | `crear_vm` | Qué existe | Para qué |
| --- | --- | --- | --- |
| Contingencia (normal) | `false` | Storage + Key Vault | La VM del portal respalda aquí cada semana |
| Recuperación / simulacro | `true` | Todo lo anterior + VM nueva | La VM nueva se restaura sola |

No agrega contenedores ni cambia la RAM o los puertos de `docker-compose.yml` (AGENTS.md, reglas 1 y 2).

| Archivo | Rol |
| --- | --- |
| `versions.tf` | Versión de Terraform y del provider `azurerm`; suscripción |
| `variables.tf` | Variables (región, sufijo, `crear_vm`, `operadores_lectura`, retención…) |
| `main.tf` | Nombres de los recursos y grupo de recursos `healthradar-dr-rg` |
| `storage.tf` | Storage Account, contenedor `backups`, papelera de 7 días y borrado a los 90 días |
| `keyvault.tf` | Key Vault vacío. El secreto no se gestiona aquí para que no quede en claro en `terraform.tfstate` |
| `rbac.tf` | Roles de cada identidad sobre el Key Vault y el Storage |
| `vm.tf`, `cloud-init.yaml.tftpl` | VM de recuperación en Azure y su primer arranque (solo con `crear_vm = true`) |
| `outputs.tf` | Nombres de Storage y Key Vault; IP, SSH y URL de la VM nueva |
| `terraform.tfvars.example` | Plantilla de `terraform.tfvars` |
| `terraform.tfvars`, `terraform.tfstate` | Configuración y estado locales. **No se versionan** |

Scripts relacionados, en `../scripts-poc-arquitectura/`:

| Script | Dónde corre | Rol |
| --- | --- | --- |
| `tf_preparar_host.sh` | Ubuntu nuevo | Fase 1: herramientas, login con tu cuenta, `.env` y último dump |
| `tf_bootstrap_vm.sh` | Ubuntu nuevo o VM de Azure | Fase 2: swap, Docker, build, restore, arranque y cron |
| `tf_restore_healthradar.sh` | Cualquier host con Docker | Restaura un dump y levanta el stack (lo llama `tf_bootstrap_vm.sh`) |
| `backup_healthradar.sh` | VM de producción (cron) | Dump + export de n8n + subida al Storage |
| `tf_azure_blob.sh` | VMs de Azure | Blob y Key Vault con identidad administrada (curl + python3) |
| `tf_recuperar_healthradar.ps1` | Laptop Windows | Crea o retira la VM de recuperación en Azure |

## 7. Validar Terraform sin crear nada

```powershell
cd infrastructure\terraform
terraform fmt -check
terraform init
terraform validate
terraform plan                      # contingencia: no debe tocar la VM del portal
terraform plan -var crear_vm=true   # revisar la VM que se crearía, sin aplicar
```

El CI (`infra-security-ci.yml`) corre `fmt` y `validate` de Terraform y `shellcheck` de los scripts en cada PR.

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

- La restauración en un Ubuntu (sección 2) no depende del estado: sigue funcionando.

## 10. Problemas comunes

| Síntoma | Causa / solución |
| --- | --- |
| `tf_preparar_host.sh`: *Forbidden* o *does not have secrets get permission* | Tu cuenta no está en `operadores_lectura` o el permiso aún se propaga (hasta ~10 min). Ver sección 3 |
| `AADSTS50020` o "la cuenta no existe en el inquilino" | Entraste con una cuenta que no es `@usmp.pe`. Repite con la correcta, o agrega `--tenant usmp.pe` |
| `backup.log`: `[AVISO] El .env de Key Vault esta DESACTUALIZADO` | Alguien cambió el `.env` de producción y no lo subió: repite la sección 5, paso 3. El backup en sí terminó bien |
| `Al .env del Key Vault le faltan variables` | El secreto está desactualizado respecto a `docker-compose.yml`: el Arquitecto debe volver a subirlo (sección 5, paso 3) |
| WSL: `WSL sin systemd` | Ejecuta en Ubuntu el comando que muestra el error, luego `wsl --shutdown` en PowerShell y vuelve a abrir Ubuntu |
| WSL: `Esta distro usa el Docker de Docker Desktop` | Cierra Docker Desktop y, en *Settings → Resources → WSL integration*, desactiva Ubuntu-24.04 |
| WSL: `localhost:3000` no abre | Comprueba que la ventana de Ubuntu sigue abierta y que `sudo docker ps` muestra los contenedores. Si no, abre Ubuntu y espera ~2 min |
| `sha256 no coincide` | La descarga se cortó: vuelve a ejecutar `tf_preparar_host.sh` |
| `No hay ningun pg_*.dump.gz` | Todavía no corrió un backup con `BACKUP_STORAGE_ACCOUNT` (sección 5, paso 4) |
| `La BD ya tiene N tablas` | El restore se niega a pisar datos. En un host nuevo no pasa; para forzar: `tf_restore_healthradar.sh --force <dump>` |
| n8n arranca pero las credenciales fallan | El `.env` no tiene la `N8N_ENCRYPTION_KEY` original: hay que volver a subirlo (sección 5, paso 3) |
| `StorageAccountAlreadyTaken` o nombre de vault ocupado | Los nombres son globales: cambia `sufijo_unico` |
| `RequestDisallowedByPolicy` | Región no permitida por Azure for Students: usa `centralus`, `eastus`, `brazilsouth`, `chilecentral` o `westus3` |
| VM de Azure, log: `intento n/20 fallido ... RBAC` | Normal los primeros minutos: el permiso de la VM tarda en propagarse |
| Ver el log de arranque (VM de Azure) | `sudo tail -n 200 /var/log/healthradar-bootstrap.log` y `cloud-init status --long` |
