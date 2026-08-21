# Documentación de Infraestructura: Redes en OCI (VCN y Subred)

> **Ubicación:** Oracle Cloud Infrastructure (OCI)
> **Proyecto:** HealthRadar
> **Relacionado con:** Aprovisionamiento de Instancia Compute

## Contexto
Para desplegar la máquina virtual (VM) en OCI con acceso a internet, es requisito fundamental configurar previamente la arquitectura de red. OCI requiere que la VM se conecte a una Tarjeta de Interfaz de Red Virtual (VNIC), la cual debe pertenecer a una Subred dentro de una Red Virtual en la Nube (VCN).

## 1. Red Virtual en la Nube (VCN)
La VCN actúa como el centro de datos virtual del proyecto.
- **Nombre:** `healthradar-vcn`
- **Bloque CIDR IPv4:** `10.0.0.0/16` (Permite hasta 65,536 IPs privadas)
- **Resolución DNS:** Activada (`Use DNS hostnames in this VCN`)
- **DNS Label:** `healthradar` (Dominio generado: `healthradar.oraclevcn.com`)
- **IPv6:** Desactivado.

## 2. Subred Pública
Se creó una subred específica para alojar la VM y permitirle tener una IP Pública.
- **Nombre:** `healthradar-subnet-public`
- **Tipo:** Regional
- **Bloque CIDR IPv4:** `10.0.0.0/24` (Permite 254 IPs privadas)
- **Acceso:** `Public Subnet` (Crítico para que la instancia pueda salir a Internet y ser accesible desde fuera)
- **Tabla de Rutas:** `Default Route Table for healthradar-vcn`
- **Opciones DHCP:** `Default DHCP Options for healthradar-vcn`
- **Lista de Seguridad:** `Default Security List for healthradar-vcn`

## 3. Reglas de Firewall (Security List)
Para que los servicios alojados en la VM sean accesibles desde el exterior, se abrieron los siguientes puertos en la Lista de Seguridad por defecto de la VCN (Ingress Rules):

| Puerto | Protocolo | Origen (CIDR) | Propósito |
|---|---|---|---|
| `22` | TCP | `0.0.0.0/0` | Acceso remoto vía SSH (por defecto) |
| `3000` | TCP | `0.0.0.0/0` | Frontend Next.js |
| `5678` | TCP | `0.0.0.0/0` | Orquestador n8n |
| `6006` | TCP | `0.0.0.0/0` | Observabilidad LLM (Arize Phoenix) |

*Nota de Seguridad:* `0.0.0.0/0` permite el acceso desde cualquier IP del mundo. Para un entorno de producción estricto, los puertos de administración (22, 5678, 6006) deberían restringirse a la IP estática del administrador o equipo de desarrollo.
