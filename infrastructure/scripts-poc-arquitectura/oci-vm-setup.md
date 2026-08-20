# Guía de Aprovisionamiento: VM OCI Always Free — HealthRadar

> **Relacionado con:** [ADR-009](../ADRs/ADR-009-oci-always-free-hosting.md) · [ADR-008](../ADRs/ADR-008-docker-compose.md)  
> **Responsable:** Arquitecto (Bautista Anampa)  
> **Última revisión:** 2026-08-19

Esta guía documenta **cada decisión de configuración** al crear la instancia de cómputo en Oracle Cloud Infrastructure (OCI) que hospedará el stack Docker Compose de HealthRadar.

---

## Resumen del objetivo

Crear **una sola VM ARM64** en el tier Always Free de OCI con:
- **2 OCPU** y **12 GB de RAM** (límite actual del Always Free desde jun-2026)
- IP pública para acceso SSH y exposición del frontend
- Subred pública con reglas de firewall para los puertos del proyecto
- Clave SSH segura para administración remota

---

## Paso 1 — Elegir la región

**Qué hacer:** En la consola de OCI, selecciona la región más cercana a tu ubicación.  
Opciones latinoamericanas: `sa-santiago-1` (Chile) o `mx-queretaro-1` (México).

**Por qué importa:** La disponibilidad de instancias Ampere A1 varía por región. Si recibes el error *"Out of capacity"*, prueba otra región. Una vez creada la instancia, **no se puede cambiar de región sin recrearla**.

> ⚠️ **Riesgo conocido (ADR-009):** Las regiones con más demanda (us-ashburn-1, us-phoenix-1) reportan falta de capacidad frecuente para A1. Prefiere regiones latinoamericanas o europeas de menor carga.

---

## Paso 2 — Crear la instancia de cómputo

Navega a: **Compute → Instances → Create Instance**

### 2.1 Nombre de la instancia

```
healthradar-vm-prod
```

Usa un nombre descriptivo. OCI lo usa como hostname interno y aparece en los logs de la consola.

### 2.2 Shape series — Seleccionar Ampere

En la sección **Shape series**, selecciona **Ampere** (procesadores ARM).

**Opciones disponibles:**

| Shape | Costo | OCPU máx | RAM máx |
|---|---|---|---|
| `VM.Standard.A1.Flex` | **Always Free ✅** | 80 (límite free = 2) | 512 GB (límite free = 12 GB) |
| `VM.Standard.A2.Flex` | De pago 💰 | 78 | 946 GB |

**Selecciona `VM.Standard.A1.Flex`** — es la única opción dentro del Always Free tier.

### 2.3 Configurar OCPUs y RAM

Después de elegir `VM.Standard.A1.Flex`, ajusta los sliders:

| Parámetro | Valor | Motivo |
|---|---|---|
| **OCPU** | `2` | Límite actual del Always Free (jun-2026) |
| **Memory (GB)** | `12` | Límite actual del Always Free (jun-2026) |

> ⚠️ **Crítico:** No uses 4 OCPU / 24 GB aunque el slider lo permita. Oracle redujo el límite en junio 2026 y puede terminar instancias que lo excedan **sin previo aviso** (ver ADR-009, sección Riesgos).

### 2.4 Imagen del sistema operativo

Mantén la imagen por defecto: **Oracle Linux 9** (ARM64 / aarch64).

Alternativa válida: **Canonical Ubuntu 22.04** — selecciona la variante `aarch64` en la lista de imágenes.

---

## Paso 3 — Configuración de red (VNIC)

La VNIC (Virtual Network Interface Card) conecta la VM a la red de OCI y al internet. Es la configuración más importante para que el servidor sea accesible desde afuera.

### ¿Qué es una VCN?

Una **VCN (Virtual Cloud Network)** es la red privada virtual de tu proyecto en OCI — equivalente a una LAN privada en la nube. Dentro de ella se definen **subredes** (subnets):

- **Subred pública:** las VMs pueden recibir una IP pública y ser accesibles desde internet.
- **Subred privada:** solo accesibles desde otras VMs dentro de la misma VCN.

Para HealthRadar necesitamos una **subred pública** para acceso SSH y para exponer el frontend.

### 3.1 Crear la VCN

Selecciona **"Crear una nueva red virtual en la nube"**.

OCI creará automáticamente:
- VCN con CIDR `10.0.0.0/16`
- Subred pública con CIDR `10.0.0.0/24`
- Internet Gateway (la puerta de entrada a internet)
- Tabla de rutas con ruta por defecto al Internet Gateway

**Nombre sugerido para la VCN:** `healthradar-vcn`  
**Nombre sugerido para la subred:** `healthradar-subnet-public`

### 3.2 Asignación de dirección IPv4 privada

La **IP privada** identifica a la VM dentro de la VCN (red interna de OCI). No es accesible desde internet — solo desde otras VMs de la misma VCN.

**Selecciona:** `Asignar automáticamente una dirección IPv4 privada`

OCI asignará la siguiente IP disponible en la subred (ej. `10.0.0.5`). No necesitas controlarla manualmente.

> 📌 Los contenedores Docker se comunican entre sí por la red interna del compose (`healthradar-net`), no por la IP privada de OCI.

### 3.3 Asignación de dirección IPv4 pública ⚠️ IMPORTANTE

La **IP pública** es la dirección con la que:
- Accederás a la VM por SSH desde tu computadora
- Los usuarios accederán al frontend del proyecto

**Selecciona:** `Asignar automáticamente una dirección IPv4 pública`

> ⚠️ **Requisito previo:** Debes tener seleccionada una **subred pública** (paso 3.1). Si tienes subred privada, esta opción estará deshabilitada y verás la advertencia *"Debe seleccionar una subred pública para asignar una dirección IPv4 pública"*.

> 📌 OCI asigna por defecto una **IP pública efímera** (puede cambiar si la VM se recrea). Para el alcance del proyecto esto es aceptable.

### 3.4 IPv6

**Deja sin marcar.** No es necesario. Si aparece la advertencia *"Debe seleccionar una subred habilitada para usar IPv6"*, es solo informativa — no es un error si no activas IPv6.

---

## Paso 4 — Claves SSH

SSH es el protocolo de acceso remoto seguro a la VM. Sin clave SSH, no podrás conectarte al servidor.

### ¿Qué es un par de claves SSH?

- **Clave privada** (archivo sin extensión o `.key`): se guarda en **tu máquina local**, **nunca se comparte**
- **Clave pública** (archivo `.pub`): OCI la instala automáticamente en la VM en `~/.ssh/authorized_keys`

Cuando te conectas, tu cliente SSH presenta la clave privada; el servidor verifica que coincida con la pública. Si coinciden → acceso concedido.

### 4.1 Opciones disponibles

| Opción | Cuándo usarla |
|---|---|
| **Genera un par de claves para mí** | Primera vez sin claves SSH previas |
| **Subir archivo de clave pública (.pub)** | Ya tienes un par SSH en tu máquina |
| **Pegar la clave pública** | Igual que la anterior, sin subir archivo |
| **Sin claves SSH** | ❌ Nunca usar — perderás acceso a la VM |

### 4.2 Opción recomendada — generar localmente y pegar la pública

Es mejor generar las claves **en tu máquina local** para tener control total:

```bash
# En Git Bash, WSL, o terminal de Mac/Linux:

# Generar par de claves Ed25519 (moderno y seguro)
ssh-keygen -t ed25519 -C "healthradar-oci" -f ~/.ssh/healthradar-oci

# Resultado:
#   ~/.ssh/healthradar-oci      <- clave PRIVADA (nunca compartir)
#   ~/.ssh/healthradar-oci.pub  <- clave PÚBLICA (esta va a OCI)

# Mostrar la clave pública para copiarla
cat ~/.ssh/healthradar-oci.pub
```

En OCI selecciona **"Pegar la clave pública"** y pega el contenido del `.pub`.

### 4.3 Si usas "Genera un par de claves para mí"

1. Haz clic en **"Descargar clave privada"** — guárdala inmediatamente
2. Haz clic en **"Descargar clave pública"** — guárdala también
3. Dale permisos correctos a la clave privada:

```bash
mv ~/Downloads/ssh-key-*.key ~/.ssh/healthradar-oci.key
chmod 600 ~/.ssh/healthradar-oci.key
```

> ⚠️ **Crítico:** La clave privada **solo se puede descargar en este momento**. Si cierras sin descargarla, perderás acceso SSH y deberás recrear la VM.

---

## Paso 5 — Crear la instancia

Haz clic en **"Create"**. La VM tardará 1–3 minutos en llegar a estado `RUNNING`.

**Anota la IP pública** — la necesitarás en todos los pasos siguientes.

### Conectarse por SSH

```bash
# Oracle Linux — usuario: opc
ssh -i ~/.ssh/healthradar-oci opc@<IP_PUBLICA>

# Ubuntu — usuario: ubuntu
ssh -i ~/.ssh/healthradar-oci ubuntu@<IP_PUBLICA>
```

---

## Paso 6 — Configurar reglas de firewall

Por defecto, OCI solo permite tráfico SSH (puerto 22). Hay **dos capas de firewall** que abrir.

### 6.1 Security List de OCI (firewall de red — capa 1)

Navega a:  
**Networking → Virtual Cloud Networks → healthradar-vcn → Security Lists → Default Security List → Add Ingress Rules**

| Puerto | Protocolo | Origen CIDR | Propósito |
|---|---|---|---|
| `22` | TCP | `0.0.0.0/0` | SSH — ya existe por defecto |
| `3000` | TCP | `0.0.0.0/0` | Frontend Next.js |
| `6006` | TCP | `0.0.0.0/0` | Arize Phoenix UI |
| `5678` | TCP | `0.0.0.0/0` | n8n UI (opcional) |

> 🔒 En producción, restringe los puertos 6006 y 5678 a tu IP personal: `tu.ip/32`

### 6.2 Firewall del SO — firewalld (capa 2, dentro de la VM)

Oracle Linux tiene `firewalld` activo. Aunque la Security List de OCI permita el tráfico, el SO lo bloqueará si no se abre también aquí.

```bash
# Conectado a la VM:
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --permanent --add-port=6006/tcp
sudo firewall-cmd --permanent --add-port=5678/tcp
sudo firewall-cmd --reload

# Verificar
sudo firewall-cmd --list-ports
```

---

## Paso 7 — Instalar Docker y Docker Compose

```bash
# Actualizar el sistema
sudo dnf update -y

# Instalar Docker Engine
sudo dnf install -y docker

# Habilitar inicio automático e iniciar Docker
sudo systemctl enable --now docker

# Agregar usuario 'opc' al grupo docker (evita sudo en cada comando docker)
sudo usermod -aG docker opc

# Cerrar sesión y volver a conectarse para aplicar el grupo
exit
```

Reconectado:

```bash
# Verificar Docker
docker run --rm hello-world

# Verificar Docker Compose v2
docker compose version
# Si no está disponible:
sudo dnf install -y docker-compose-plugin
```

---

## Paso 8 — Desplegar el stack de HealthRadar

```bash
# Clonar el repositorio en la VM
git clone https://github.com/<org>/Celula5_HealthRadar.git
cd Celula5_HealthRadar/infrastructure

# Configurar variables de entorno para producción
cp .env.example .env
nano .env
# Cambiar:
#   POSTGRES_PASSWORD  → contraseña fuerte y única
#   N8N_ENCRYPTION_KEY → string aleatorio largo (mínimo 32 caracteres)
#   PHOENIX_SECRET     → string aleatorio largo
#   PHOENIX_ENABLE_AUTH=true

# Levantar todos los contenedores en segundo plano
docker compose up -d

# Verificar estado de los contenedores
docker compose ps

# Ver logs en tiempo real (Ctrl+C para salir)
docker compose logs -f
```

---

## Checklist de verificación post-despliegue

- [ ] VM en estado `RUNNING` en consola OCI
- [ ] Acceso SSH exitoso
- [ ] `docker compose ps` → todos los servicios `Up`
- [ ] Frontend: `http://<IP>:3000` responde
- [ ] Phoenix UI: `http://<IP>:6006` responde
- [ ] n8n: `http://<IP>:5678` responde
- [ ] Postgres healthy: `docker compose exec postgres pg_isready`
- [ ] Ambas capas de firewall abiertas (Security List OCI + firewalld)

---

## Diagrama de red

```
Internet
   │
   │  TCP:22 (SSH)  TCP:3000 (frontend)  TCP:6006 (phoenix)  TCP:5678 (n8n)
   ▼
[OCI Security List]  ← Capa 1 de firewall (reglas de red OCI)
   │
   ▼
[Oracle Linux firewalld]  ← Capa 2 de firewall (SO de la VM)
   │
   ▼
[VM: healthradar-vm-prod]  IP pública: <asignada por OCI>
   │
   └─ [Red Docker: healthradar-net]  Red interna de contenedores
         ├─ postgres:5432   (solo red interna)
         ├─ n8n:5678        (solo red interna, opcional exponer)
         ├─ phoenix:6006    (solo red interna, opcional exponer)
         └─ frontend:3000   ← Puerto expuesto al host → internet
```

---

## Referencias

- [OCI — Crear instancias de cómputo](https://docs.cloud.oracle.com/iaas/Content/Compute/Tasks/launchinginstance.htm)
- [OCI — Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [OCI — Gestión de VCNs](https://docs.cloud.oracle.com/iaas/Content/Network/Tasks/managingVCNs.htm)
- [OCI — Security Lists](https://docs.cloud.oracle.com/iaas/Content/Network/Concepts/securitylists.htm)
- [ADR-009 — Decisión de hosting OCI](../ADRs/ADR-009-oci-always-free-hosting.md)
- [ADR-008 — Estrategia Docker Compose](../ADRs/ADR-008-docker-compose.md)
