# Manual de Backups, Restore y Levantar HealthRadar en Ubuntu — HU-303 / ADR-015

Guía paso a paso para tres tareas:

1. **Respaldar** el sistema cada semana, dentro y fuera de la VM (sección 2).
2. **Restaurar** los datos si se dañan (secciones 3 y 4).
3. **Levantar HealthRadar desde cero en un Ubuntu nuevo**: una VM de VMware en tu laptop o cualquier servidor (sección 5).

La recuperación automática en Azure con Terraform (crear la VM nueva con un comando) está en [`infrastructure/terraform/README.md`](../terraform/README.md).

| | |
| --- | --- |
| Script de backup | `infrastructure/scripts-poc-arquitectura/backup_healthradar.sh` |
| Script de restore | `infrastructure/scripts-poc-arquitectura/restore_healthradar.sh` |
| Script para un Ubuntu nuevo | `infrastructure/scripts-poc-arquitectura/bootstrap_vm.sh` |
| Frecuencia | Viernes 20:00 (hora de Lima), por cron |
| Copia local | `/home/azureuser/backups/healthradar/`, últimas **2** semanas |
| Copia en Azure (off-site) | Storage Account, contenedor `backups`, últimos **90 días** |
| `.env` (secretos) | Key Vault, secreto `healthradar-env` |
| RAM adicional | **0 MB**: no crea contenedores ni puertos (ADR-008) |

---

## 0. Antes de empezar

### 0.1 Dónde se ejecuta cada comando

Este manual usa **tres terminales distintas**. Fíjate en el prompt para saber en cuál estás:

| Terminal | Cómo se ve el prompt | Para qué |
| --- | --- | --- |
| **Laptop** (PowerShell de Windows) | `PS D:\GitHub\HealthRadar>` | `az`, `terraform`, `scp`, `ssh`, `Remove-Item` y todo lo que use `$env:...` |
| **VM de Azure** (producción) | `azureuser@healthradar-vm:~$` | Cron y backups |
| **Ubuntu nuevo** (VMware u otro servidor) | `tu-usuario@nombre-servidor:~$` | Levantar la copia del sistema |

A la VM de Azure entras desde la laptop con:

```powershell
ssh -i "$HOME\.ssh\healthradar-vm_key.pem" azureuser@<IP_VM_AZURE>
```

Para salir de cualquier VM: `exit`.

### 0.2 Valores de tu entorno

Los comandos usan estos valores entre `< >`. Reemplázalos por los tuyos.

| Valor | Qué es | Cómo obtenerlo (en la laptop) |
| --- | --- | --- |
| `<storage_account>` | Storage donde se guardan los backups | `terraform -chdir=infrastructure/terraform output -raw storage_account` |
| `<key_vault>` | Key Vault donde está el `.env` | `terraform -chdir=infrastructure/terraform output -raw key_vault` |
| `<IP_VM_AZURE>` | IP pública de producción | Portal de Azure → VM → Información general |
| `<usuario>` | Tu usuario del Ubuntu nuevo | El que elegiste al instalarlo (ver 5.4) |
| `<IP_UBUNTU>` | IP del Ubuntu nuevo | `ip -4 addr show` en ese Ubuntu (ver 5.5) |

### 0.3 Cómo se conecta tu laptop con Azure (la sesión)

**No pones tu cuenta ni tu contraseña en ningún archivo.**

1. Ejecutas `az login` en la laptop. Se abre el navegador, entras con tu cuenta y Azure CLI guarda un token en `C:\Users\<tú>\.azure\`.
2. Los comandos `az storage ...` y `az keyvault ...` (y también Terraform) usan ese token. Funcionan porque Terraform te dio permisos sobre el Storage y el Key Vault (`rbac.tf`).
3. La **VM de Azure** no usa tu sesión. Tiene su propia **identidad administrada**: una "cuenta" de la VM que le permite subir backups sin guardar claves.

Si un comando `az` dice que la sesión expiró, vuelve a ejecutar `az login`.

> No confundas los dos `.env`: `infrastructure/.env` es el de la **aplicación** (contraseñas de Postgres, API keys). No se usa para conectar la laptop con Azure.

---

## 1. Qué contiene cada backup

| Archivo | Contenido | Para qué sirve |
| --- | --- | --- |
| `pg_<año>-W<semana>.dump.gz` | **Toda** la base PostgreSQL: casos, boletines, usuarios, sesiones, trazas de Phoenix y **también n8n** (workflows, credenciales cifradas, ejecuciones), porque n8n usa la misma base | Restore completo. **Es el importante** |
| `n8n-workflows_<año>-W<semana>.tar.gz` | Un JSON por workflow de n8n | Restaurar **un solo** flujo sin tocar la base (sección 4) |
| `*.sha256` | Huella de cada archivo | Detectar si un backup está corrupto |
| `.env` (en Key Vault, aparte) | Contraseñas, API keys y la **`N8N_ENCRYPTION_KEY`** | Sin la `N8N_ENCRYPTION_KEY` original, las credenciales de n8n del dump **no se pueden descifrar** |

El nombre usa la semana ISO del año (`2026-W45`). Repetir el backup en la misma semana **sobrescribe** los archivos de esa semana.

---

## 2. Activar los backups automáticos (una sola vez, en la VM de Azure)

**Requisitos:** que ya esté hecho lo de `infrastructure/terraform/README.md`, secciones 3.1 a 3.3: identidad de la VM activada, `terraform apply` ejecutado y `.env` subido al Key Vault.

Todo este bloque se ejecuta **en la VM de Azure**.

### 2.1 Comprobar que los scripts están en la VM

```bash
git -C ~/HealthRadar log -1 --oneline
ls -l ~/HealthRadar/infrastructure/scripts-poc-arquitectura/ | grep -E 'azure_blob|backup_healthradar'
```

✅ Deben aparecer `azure_blob.sh` y `backup_healthradar.sh`, este último con `-rwxr-xr-x` (la `x` indica que es ejecutable).

❌ Si falta `azure_blob.sh`: el último deploy no llegó. Revisa en GitHub → Actions → **Deploy CD**. No uses `git pull`: la VM queda en un commit fijo que pone el deploy.

### 2.2 Comprobar Docker, disco e identidad

```bash
docker ps --format '{{.Names}}' | grep -E 'postgres|n8n'
df -h ~
curl -s -H "Metadata: true" "http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https://storage.azure.com/" | python3 -c 'import json,sys; print("OK: la VM tiene identidad" if "access_token" in json.load(sys.stdin) else "ERROR: sin identidad")'
```

Resultado esperado:

| Comando | ✅ Esperado | ❌ Si no |
| --- | --- | --- |
| `docker ps` | `healthradar-postgres` y `healthradar-n8n` | *permission denied*: `sudo usermod -aG docker azureuser`, sal con `exit` y vuelve a entrar |
| `df -h ~` | Más de 2 GB en `Avail` | El backup se detiene con menos de 1 GB: libera disco |
| `curl ...` | `OK: la VM tiene identidad` | Portal → VM → Seguridad → **Identidad** → *Asignada por el sistema* → **Activado** |

### 2.3 Poner la hora de Lima

```bash
timedatectl | grep "Time zone"
```

Si no dice `America/Lima`:

```bash
sudo timedatectl set-timezone America/Lima
```

**Por qué:** el cron programa las tareas con la hora del sistema. Con la VM en UTC, el backup "de las 20:00" correría a las 15:00 de Lima. Los contenedores no se ven afectados.

### 2.4 Crear la carpeta de backups

```bash
mkdir -p ~/backups/healthradar && chmod 700 ~/backups/healthradar
ls -ld ~/backups/healthradar
```

✅ `drwx------ ... azureuser azureuser ... /home/azureuser/backups/healthradar`. Es seguro repetir `mkdir -p`: si la carpeta ya existe, no borra nada.

### 2.5 Programar el backup (crontab)

Copia y pega **todo el bloque** de una vez, cambiando `<storage_account>`. Conserva otras tareas que ya tengas en el crontab:

```bash
( crontab -l 2>/dev/null | grep -v -e backup_healthradar.sh -e '^TZ=America/Lima' -e '^BACKUP_STORAGE_'
cat <<'EOF'
TZ=America/Lima
BACKUP_STORAGE_ACCOUNT=<storage_account>
BACKUP_STORAGE_CONTAINER=backups
0 20 * * 5 /home/azureuser/HealthRadar/infrastructure/scripts-poc-arquitectura/backup_healthradar.sh >> /home/azureuser/backups/healthradar/backup.log 2>&1
EOF
) | crontab -
crontab -l
```

| Línea | Qué hace |
| --- | --- |
| `TZ=America/Lima` | Hora de Lima para el script |
| `BACKUP_STORAGE_ACCOUNT=...` | Activa la copia en Azure. Sin esta línea, el backup queda solo en la VM |
| `BACKUP_STORAGE_CONTAINER=backups` | Contenedor creado por Terraform |
| `0 20 * * 5 ...` | Viernes (`5`) a las 20:00; el resultado se guarda en `backup.log` |

> Estas variables van en el **crontab**, no en el `.env`: el script las lee del entorno del cron.

### 2.6 Primera corrida manual (para no esperar al viernes)

```bash
BACKUP_STORAGE_ACCOUNT=<storage_account> ~/HealthRadar/infrastructure/scripts-poc-arquitectura/backup_healthradar.sh
```

Tarda unos minutos y hace un `pg_dump` de producción, así que ejecútalo cuando haya poco uso. ✅ Debe terminar así:

```
[1/3] pg_dump de ... (incluye datos + n8n: misma BD)...
 -> OK: pg_2026-W45.dump.gz (56M).
[2/3] Export de workflows n8n...
Successfully exported N workflows.
 -> OK: n8n-workflows_2026-W45.tar.gz con N flujos (...).
[off-site] Subiendo a <storage_account>/backups...
 -> OK: 4 archivos subidos al Storage.
[3/3] Rotacion (retencion: 2)...
  [EXITO] Backup semanal completado.
```

La cantidad de flujos (`N`) debe ser mayor que 0. Si sale `[AVISO] n8n no exporto ningun flujo`, revisa el mensaje de n8n que aparece justo arriba. El dump de PostgreSQL igual contiene los workflows.

### 2.7 Verificar que el backup está en Azure (desde la laptop)

```powershell
az storage blob list --account-name <storage_account> -c backups --auth-mode login --query "[].{archivo:name, bytes:properties.contentLength}" -o table
```

✅ Deben aparecer 4 archivos de la semana: `pg_...dump.gz` (decenas de MB), su `.sha256`, `n8n-workflows_...tar.gz` (**varios KB**; si pesa 111 bytes está vacío) y su `.sha256`.

También los ves en el portal: Storage → **Contenedores** → `backups`.

### 2.8 Después del primer viernes

El sábado, en la VM de Azure:

```bash
tail -20 ~/backups/healthradar/backup.log
ls -lh ~/backups/healthradar/
```

✅ El log termina en `[EXITO] Backup semanal completado.` con la fecha del viernes.

---

## 3. Restaurar los datos en la misma VM (la VM existe, pero los datos se dañaron)

> ⚠️ **Sobrescribe la base de producción** con la del backup y detiene el sistema unos minutos. Todo lo registrado después del backup se pierde.

En la **VM de Azure**:

1. Elige el backup:

   ```bash
   ls -lh ~/backups/healthradar/
   ```

2. Restaura. Elige **una** de las dos opciones:

   ```bash
   # a) Desde la copia local de la VM
   bash ~/HealthRadar/infrastructure/scripts-poc-arquitectura/restore_healthradar.sh --force ~/backups/healthradar/pg_2026-W45.dump.gz

   # b) Desde Azure (el más reciente del Storage), si las copias locales se perdieron
   BACKUP_STORAGE_ACCOUNT=<storage_account> bash ~/HealthRadar/infrastructure/scripts-poc-arquitectura/restore_healthradar.sh --force
   ```

**Qué hace el script:**
1. verifica el sha256;
2. detiene nginx, los microfrontends, Phoenix y n8n;
3. restaura PostgreSQL y verifica que quedó bien;
4. aplica las migraciones nuevas (`migrate.sh`);
5. levanta todo y prueba `http://127.0.0.1:3000/healthz`.

✅ Termina con `[EXITO] Restore completado`. `--force` es obligatorio porque la base ya tiene datos: sin él, el script se niega a sobrescribirlos.

---

## 4. Restaurar un solo flujo de n8n (sin tocar la base)

En la **VM de Azure**:

```bash
mkdir -p /tmp/n8n-restore
tar -xzf ~/backups/healthradar/n8n-workflows_2026-W45.tar.gz -C /tmp/n8n-restore
ls /tmp/n8n-restore            # un .json por flujo: deja solo los que quieres restaurar
docker exec healthradar-n8n mkdir -p /tmp/n8n-restore
docker cp /tmp/n8n-restore/. healthradar-n8n:/tmp/n8n-restore/
docker exec healthradar-n8n n8n import:workflow --separate --input=/tmp/n8n-restore/
docker exec healthradar-n8n sh -c 'rm -rf /tmp/n8n-restore'
rm -rf /tmp/n8n-restore
```

Después, activa el flujo desde la UI de n8n o por API (ver `.github/workflows/n8n-deploy-cd.yml`).

---

## 5. Levantar HealthRadar desde cero en un Ubuntu nuevo

Sirve para **demostrar el restore** en una VM de VMware Workstation en tu laptop, o para levantar el sistema en cualquier servidor si producción se pierde. Usa solo lo que está en Azure: el último backup del Storage y el `.env` del Key Vault. La VM de producción no se toca.

> En Azure, `terraform apply -var crear_vm=true` hace los pasos 5.6 y 5.7 automáticamente (ver `infrastructure/terraform/README.md`, sección 4).

### 5.1 Qué necesitas

- **Laptop:** Azure CLI con `az login` hecho (0.3), al menos 8 GB de RAM en total (ideal 16 GB) y unos **25 GB libres** en disco.
- **VMware Workstation Pro 17**, gratis para uso personal.
- **ISO de Ubuntu Server 24.04 LTS**, gratis.

### 5.2 Descargar la versión correcta de Ubuntu

Descarga desde **[releases.ubuntu.com/24.04](https://releases.ubuntu.com/24.04/)** el archivo `ubuntu-24.04.x-live-server-amd64.iso` (*Server install image*).

> ⚠️ **No uses la descarga principal de ubuntu.com**: hoy ofrece **26.04** (nombre en clave `resolute`). Producción y Terraform usan **24.04** (`noble`). La prueba solo vale si es el mismo sistema.

### 5.3 Crear la VM en VMware

1. **File → New Virtual Machine… → Typical → Next**.
2. **Installer disc image file (iso)** → la ISO de 24.04 → Next.
3. Nombre, por ejemplo `healthradar-prueba` → Next.
4. Disco: **40 GB** y **Store virtual disk as a single file** (más rápido que dividirlo) → Next.
5. **Customize Hardware…**:
   - **Memory: 4096 MB** (igual que la VM de Azure; con menos, la compilación puede fallar);
   - **Processors: 2**;
   - **Network Adapter: NAT**, con **Connected** y **Connect at power on** marcados.
6. Close → **Finish**.

El disco crece a medida que se usa: no ocupa 40 GB de entrada.

### 5.4 Instalar Ubuntu Server

| Pantalla | Qué elegir |
| --- | --- |
| GNU GRUB (primer arranque) | **Try or Install Ubuntu Server** (no la de "HWE kernel") |
| Actualización del instalador disponible | **Continuar sin actualizar** |
| Type of installation | **Ubuntu Server** (no "minimized") |
| Network configuration | Debe aparecer `ens33` con una IP **DHCPv4 `192.168.x.x`**. Si no hay IP, ver 6.1 |
| Proxy | **Vacío** → Hecho |
| Mirror | Debe decir *"This mirror location passed tests"* y líneas con **`noble`**. Si aparece *"Mirror check still running"* → **Cancelar** (solo cierra el aviso), espera y luego Hecho |
| Guided storage | *Use an entire disk* y **desmarca "Set up this disk as an LVM group"** (con LVM, Ubuntu usa solo la mitad del disco) |
| Storage configuration | Debe mostrar `/` de ~40G en `ext4` → Hecho → *Confirm destructive action* → **Continuar** (solo formatea el disco virtual) |
| Profile | Anota bien el campo **"Pick a username"**: ese es tu `<usuario>`. *"Your name"* y *"Your server's name"* **no sirven** para entrar. Contraseña de **solo letras minúsculas y números** (por ejemplo `prueba2026`), para evitar problemas de teclado |
| Ubuntu Pro | **Skip for now** |
| SSH configuration | **Marca "Install OpenSSH server"** |
| Featured server snaps | **No marques nada**, sobre todo **no** "docker" (choca con el Docker que instala el script) |
| Aviso de VMware *"New USB Device Detected"* | **Connect to the host** (es la cámara de tu laptop) |
| Installation complete! | **Reiniciar ahora** → si pide *"remove the installation medium"*, presiona Enter |

### 5.5 Primer inicio

1. En la ventana de VMware aparece `nombre-servidor login:`. **Espera 1–2 minutos** antes de escribir: en el primer arranque, Ubuntu termina de crear tu usuario después de mostrar el login. Si entras antes, dice *Login incorrect*.
2. Entra con `<usuario>` y tu contraseña. Mientras escribes la contraseña no se ve nada; es normal. Si sigue fallando, ver 6.2.
3. Obtén la IP:

   ```bash
   ip -4 addr show | grep inet
   ```

   Usa la que empieza con `192.168.`: esa es tu `<IP_UBUNTU>`. Ignora `127.0.0.1`.
4. **Desde la laptop**, prueba que entras por SSH. Desde aquí es más cómodo trabajar en la terminal de la laptop que en la ventana de VMware:

   ```powershell
   ssh <usuario>@<IP_UBUNTU>
   ```

   La primera vez escribe `yes` y luego tu contraseña.

> El mensaje `piix4_smbus ... SMBus Host Controller not enabled!` en la consola es un aviso inofensivo de VMware. Presiona Enter.

### 5.6 Llevar el backup y el `.env` al Ubuntu (desde la laptop)

En **PowerShell de la laptop**. Primero define tus valores:

```powershell
$SA = "<storage_account>"; $KV = "<key_vault>"; $U = "<usuario>"; $IP = "<IP_UBUNTU>"
```

Luego busca el backup más reciente, descárgalo y envíalo:

```powershell
Remove-Item "$env:TEMP\pg.dump.gz*", "$env:TEMP\hr.env" -ErrorAction SilentlyContinue

$ultimo = az storage blob list --account-name $SA -c backups --auth-mode login --query "sort_by([?ends_with(name,'.dump.gz')], &properties.lastModified)[-1].name" -o tsv
$ultimo   # muestra el nombre, p. ej. pg_2026-W45.dump.gz

az storage blob download --account-name $SA -c backups --auth-mode login -n $ultimo -f "$env:TEMP\pg.dump.gz" -o none
az storage blob download --account-name $SA -c backups --auth-mode login -n "$ultimo.sha256" -f "$env:TEMP\pg.dump.gz.sha256" -o none
az keyvault secret download --vault-name $KV -n healthradar-env -f "$env:TEMP\hr.env"

scp "$env:TEMP\pg.dump.gz" "$env:TEMP\pg.dump.gz.sha256" "$env:TEMP\hr.env" "${U}@${IP}:~/"

Remove-Item "$env:TEMP\pg.dump.gz*", "$env:TEMP\hr.env"
```

✅ `scp` muestra 3 líneas al `100%`. El último `Remove-Item` borra de tu laptop el `.env`, que tiene secretos de producción.

> `scp` se ejecuta **en la laptop**: los archivos están en `$env:TEMP`, una variable de Windows que no existe en Ubuntu.

### 5.7 Levantar el sistema (en el Ubuntu)

Entra por SSH (`ssh <usuario>@<IP_UBUNTU>`) y ejecuta:

**1. Comprobar los archivos:**

```bash
ls -lh ~/pg.dump.gz ~/pg.dump.gz.sha256 ~/hr.env
```

**2. Abrir `tmux`.** El proceso tarda; si se corta el SSH, tmux lo mantiene vivo:

```bash
tmux new -s hr
```

Aparece una **barra verde** abajo: ya estás dentro.

**3. Clonar el repo y ejecutar el bootstrap:**

```bash
git clone https://github.com/Equipo5-Aqp/HealthRadar.git ~/HealthRadar
sudo bash ~/HealthRadar/infrastructure/scripts-poc-arquitectura/bootstrap_vm.sh --env-file ~/hr.env --dump ~/pg.dump.gz
```

Clona **sin** `sudo`: el script usa como dueño del sistema al dueño de la carpeta del repo.

**Qué vas a ver, en orden:**

| Etapa | Qué hace | Tiempo aprox. |
| --- | --- | --- |
| `[1/6] Swap` | Crea 4 GB de memoria swap y pone la hora de Lima | segundos |
| `[2/6] Docker` | Instala Docker oficial | 2–5 min |
| `[3/6] Variables de entorno` | `.env copiado desde ...` | segundos |
| `[4/6] Compilando imagenes` | n8n, mf-dashboard, mf-consulta, mf-historicos, una por una | 5–40 min (lo más lento) |
| `[5/6] Datos` | Restore: `[1/5]` a `[5/5]` y `OK: N migraciones registradas, M workflows de n8n.` | 3–8 min |
| `[6/6] Cron de backups` | Programa el backup semanal | segundos |
| Final | **`[EXITO] HealthRadar levantado desde cero.`** y los 7 contenedores en `(healthy)` | — |

Durante `[4/6]` tu laptop irá **lenta**: la VM usa sus 2 CPU al 100 %. Es temporal. Cierra programas pesados y no suspendas la laptop.

**Atajos de tmux:**

| Quieres | Teclas |
| --- | --- |
| Salir dejando el proceso corriendo | **Ctrl+B**, suelta, **D** |
| Volver a la sesión | `tmux attach -t hr` |
| Subir para ver texto anterior | **Ctrl+B**, suelta, **[** → flechas o RePág. Sales con **q** |

Si falla, volver a ejecutar el mismo `sudo bash ...` es seguro: reutiliza lo ya hecho y no restaura dos veces.

### 5.8 Verificar que es igual a producción

1. **Navegador de la laptop:** `http://<IP_UBUNTU>:3000` → inicia sesión con un usuario de producción → revisa Panorama, Consulta (haz una pregunta) e Históricos.
2. **Conteos.** En el Ubuntu nuevo:

   ```bash
   sudo docker exec healthradar-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT count(*) AS migraciones FROM healthradar_schema_migrations;" -c "SELECT count(*) AS workflows FROM workflow_entity;" -c "SELECT count(*) AS usuarios FROM usuario;"'
   ```

   Lo mismo **en la VM de Azure**, sin `sudo`. Los números deben coincidir, salvo los cambios hechos en producción después del backup.
3. **Evidencia** (capturas): `[EXITO]` con los 7 contenedores `healthy`, el login y una consulta respondida, y los conteos de ambas VMs.

### 5.9 Apagar y limpiar

La copia usa las **API keys reales**: mientras esté encendida, n8n ejecuta los workflows programados (Fase B cada 30 min, clima, embeddings) y gasta cuota. Al terminar, en el Ubuntu nuevo:

```bash
shred -u ~/hr.env ~/pg.dump.gz ~/pg.dump.gz.sha256
sudo docker compose -f ~/HealthRadar/infrastructure/docker-compose.yml down
```

- Para volver a mostrarlo, sin repetir el bootstrap: `sudo docker compose -f ~/HealthRadar/infrastructure/docker-compose.yml up -d`.
- Para borrar la VM: en VMware, clic derecho → **Manage → Delete from Disk**.

---

## 6. Solución de problemas

### 6.1 Instalación de Ubuntu

| Síntoma | Solución |
| --- | --- |
| El mirror dice *"no network has been configured"* | La VM no tiene internet. **VM → Settings → Network Adapter**: marca *Connected* y *Connect at power on*, con **NAT**. Vuelve con **Atrás** a *Network configuration*: en `ens33` → *Edit IPv4* → **Automatic (DHCP)** |
| Sigue sin IP | En Windows: `Win+R` → `services.msc` → **VMware NAT Service** y **VMware DHCP Service** en *En ejecución*. Si no basta: VMware → **Edit → Virtual Network Editor → Change Settings → Restore Defaults** |
| Las líneas del mirror dicen `resolute` | Es Ubuntu 26.04. Apaga la VM → **VM → Settings → CD/DVD** → elige la ISO de 24.04 → reinicia |

### 6.2 No puedo entrar (*Login incorrect*)

En este orden:

1. **Espera 1–2 minutos** tras el primer arranque y reintenta (ver 5.5).
2. Usa el **username**, no *Your name* ni el nombre del servidor.
3. **Revisa el teclado:** escribe tu contraseña en el campo `login:`, donde **sí se ve**, sin presionar Enter. Si los símbolos salen distintos, es el teclado; bórralo y busca la tecla correcta. Revisa también Bloq Mayús, y Bloq Num si usas el teclado numérico.
4. **Cambiar la contraseña sin reinstalar:**
   1. **VM → Power → Reset**. Haz clic dentro de la ventana y toca **Esc** hasta ver *Boot Menu* → **Hard Drive** → Enter, e **inmediatamente mantén Shift** hasta ver **GNU GRUB**.
   2. Deja marcado **Ubuntu** y presiona **`e` una sola vez**.
   3. Baja a la línea que empieza con `linux` (ocupa dos renglones; la `\` indica que continúa) → tecla **Fin** → escribe un espacio y `init=/bin/bash`. Debe terminar en `... ro init=/bin/bash`.
   4. **Ctrl+X**. Si sale *"can't find command esetparams"*, se coló una `e` de más: presiona cualquier tecla y el arranque continúa.
   5. En el prompt `root@(none):/#`, uno por uno:

      ```bash
      mount -o remount,rw /
      ls /home
      passwd <usuario>
      sync
      reboot -f
      ```

      - `ls /home` muestra el nombre real de tu usuario.
      - `passwd` pide la contraseña nueva dos veces (no se ve). Usa solo letras y números.

   > En GRUB y en ese prompt, el teclado funciona **como uno en inglés (US)**. En un teclado latinoamericano o español:
   > - `=` → la **segunda** tecla a la derecha del 0;
   > - `-` → la **primera** tecla a la derecha del 0;
   > - `/` → la tecla `-` junto al Shift derecho.

### 6.3 Backups

| Síntoma | Causa / solución |
| --- | --- |
| `El contenedor ... no esta corriendo` | Stack detenido: `cd ~/HealthRadar/infrastructure && docker compose up -d` |
| `Espacio libre insuficiente` | Menos de 1 GB libre: libera disco antes de reintentar. El script no deja copias a medias |
| `Fallo la subida de ...` / `403` | Identidad desactivada (2.2) o permisos aún propagándose: reintenta en 10 min. La copia local sí quedó |
| `[AVISO] n8n no exporto ningun flujo` / tar.gz de ~111 bytes | Revisa el mensaje de n8n de arriba. El dump de PostgreSQL igual contiene los workflows |
| `az ...` dice *Forbidden* o pide login | `az login` otra vez. Si acabas de hacer `terraform apply`, espera 5–10 min a que se propaguen los permisos |
| El backup corre a otra hora | Zona horaria del sistema (2.3) |

### 6.4 Restore y Ubuntu nuevo

| Síntoma | Causa / solución |
| --- | --- |
| `sha256 no coincide` | Descarga incompleta: repite 5.6 |
| `La BD ya tiene N tablas` | El restore no pisa datos sin `--force` (sección 3). En un Ubuntu nuevo no debería pasar |
| `az keyvault secret download` dice *File already exists* | Ejecuta el primer `Remove-Item` de 5.6 |
| `scp` dice *No such file* | Lo ejecutaste en Ubuntu: se ejecuta **en la laptop** (5.6) |
| Se cortó el SSH durante el bootstrap | `ssh <usuario>@<IP_UBUNTU>` y luego `tmux attach -t hr` |
| `exit code: 137` al compilar | Falta de memoria: verifica 4096 MB en la VM y vuelve a ejecutar el bootstrap |
| `permission denied ... docker.sock` en el Ubuntu nuevo | Usa `sudo docker ...`, o sal y vuelve a entrar (el script te agregó al grupo docker) |
| n8n arranca pero sus credenciales fallan | El `.env` del Key Vault no tiene la `N8N_ENCRYPTION_KEY` original: vuelve a subirlo (`infrastructure/terraform/README.md`, 3.3) |

---

## 7. Advertencias

- **Conserva la `N8N_ENCRYPTION_KEY`.** Vive en el `.env` del Key Vault. Si cambias el `.env` de producción, vuelve a subirlo (`infrastructure/terraform/README.md`, 3.3).
- **No exportes credenciales de n8n en claro** (`n8n export:credentials`): dejaría secretos en disco.
- **No compartas ni captures** el valor del secreto `healthradar-env` ni el archivo `hr.env`.
- **Una copia restaurada usa las API keys reales**: apágala al terminar (5.9).
- **No dejes encendida una copia con cron** (Ubuntu nuevo o VM de simulacro) **un viernes a las 20:00** si tiene `BACKUP_STORAGE_ACCOUNT`: subiría su backup con el mismo nombre de semana que el de producción.
