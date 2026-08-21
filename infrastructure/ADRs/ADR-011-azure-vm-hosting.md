# ADR-011: Adopción de Microsoft Azure Virtual Machines como proveedor de hosting para el host único de Docker Compose

**Estado:** Aceptado (2026-08-21)  
**Reemplaza a:** [ADR-009](ADR-009-oci-always-free-hosting.md)  
**Relacionado con:** ADR-001 (Orquestación n8n), ADR-002 (PostgreSQL con pgvector), ADR-004 (Next.js Frontend), ADR-008 (Docker Compose), ADR-010 (Observabilidad Arize Phoenix)

## Contexto

El ADR-009 seleccionó inicialmente Oracle Cloud Infrastructure (OCI) tier Always Free (instancia ARM Ampere A1 con 2 OCPU y 12 GB RAM) para alojar el `docker-compose.yml` definido en ADR-008.

Sin embargo, durante la fase de aprovisionamiento de infraestructura se materializó el riesgo crítico documentado en la sección de *Riesgos* del ADR-009:
> *"Capacidad regional limitada: el aprovisionamiento de instancias Ampere A1 puede fallar con error 'Out of capacity' según la región y el momento..."*

Tras más de 48 horas continuas de ejecución del script de solicitud automatizada (`lanzar_vm.ps1`), las regiones de OCI mantuvieron indisponibilidad total de capacidad para el shape `VM.Standard.A1.Flex`. Continuar a la espera de cupos aleatorios ponía en riesgo crítico la entrega de los hitos evaluados del curso y los tests de integración.

Adicionalmente, la documentación rectora del curso (`05-arquitectura.md`, sección *Capa de Orquestación y Lógica*) establece explícitamente como proveedores válidos y homologados:
> *"Cada grupo debe levantar n8n en su propia instancia Self-Hosted (usando Docker Compose en un VPS económico o AWS EC2/Azure VM)."*

Se evaluaron tres alternativas en Microsoft Azure bajo la suscripción académica **Azure for Students** ($100 USD de crédito con 365 días de vigencia, sin tarjeta de crédito):

1. **`Standard_B2s` (v1 Legacy - x86_64 Intel/AMD):** 2 vCPUs, 4 GiB RAM, 1,280 IOPS. Costo: ~$30.37/mes. Conducía al consumo del ~99% del crédito estudiantil sin margen ante imprevistos.
2. **`Standard_B2pls_v2` (v2 - ARM64 Ampere Altra):** 2 vCPUs, 4 GiB RAM, 3,750 IOPS. Costo: ~$24.53/mes. Requería mantener la restricción de builds multi-arquitectura ARM64.
3. **`Standard_B2als_v2` (v2 - AMD EPYC x86_64):** 2 vCPUs, 4 GiB RAM, 3,750 IOPS. Costo: ~$27.45/mes (o ~$16-20/mes con auto-shutdown). Ofrece silicona moderna AMD EPYC con arquitectura x86_64 nativa y alto rendimiento de I/O de disco.

## Decisión

Se adopta **Microsoft Azure Virtual Machines**, aprovisionando una instancia con el tamaño **`Standard_B2als_v2`** en la región **`Central US`**, como nuevo proveedor de hosting para el host único donde corre el `docker-compose.yml` de HealthRadar.

Reglas de implementación y operación:

- **Host y Sistema Operativo:** Instancia basada en **Ubuntu Server 24.04 LTS (x64)** con almacenamiento de 30 GiB en disco Standard SSD (`StandardSSD_LRS`).
- **Arquitectura de Software (ADR-008):** Todo el stack (PostgreSQL + pgvector, n8n, Arize Phoenix y Frontend Next.js) se despliega intacto mediante Docker Compose en la red interna `healthradar-net`.
- **Aislamiento de Seguridad (ADR-004 y ADR-008):** El Network Security Group (NSG) de Azure únicamente permite tráfico público de entrada hacia el puerto `3000` (Frontend) y puerto `22` (SSH administrativo mediante llave criptográfica `healthradar-vm_key.pem`).
- **IP Pública Estática:** Se asigna una dirección IP pública fija asociada a la NIC de la VM para garantizar persistencia de endpoints de prueba y webhooks sin variaciones tras reinicios.
- **Optimización Presupuestaria:** Se habilita la política de apagado programado (*Auto-shutdown*) a las 02:00 AM (UTC-5) para reducir el consumo mensual a ~$16 - $20 USD, asegurando que los $100 USD de crédito financien holgadamente el proyecto hasta el cierre académico (30 de noviembre de 2026).

## Consecuencias

**Beneficios:**

- **Disponibilidad Inmediata:** Despliegue en menos de 2 minutos sin bloqueos por falta de cupo regional (*Out of capacity*).
- **Compatibilidad Universal x86_64:** Al ser arquitectura AMD de 64 bits estándar, se elimina el riesgo de incompatibilidades en dependencias de Python, extensiones de `pgvector` o paquetes Node.js.
- **Alto Rendimiento de I/O (3,750 IOPS):** Triple de velocidad de disco respecto a la serie Bv1 (1,280 IOPS), acelerando la indexación vectorial HNSW y tiempos de respuesta de PostgreSQL.
- **Viabilidad Financiera Garantizada:** Costo 100% cubierto por el beneficio de $100 USD de Azure for Students, con un remanente proyectado de +$35 a +$45 USD al finalizar el semestre.
- **Cumplimiento de Cátedra:** Mantiene la condición de self-hosted y está plenamente respaldado por la guía de arquitectura del curso.

**Riesgos:**

- **Agotamiento de créditos si se opera 24/7 sin control:** Si la VM opera de manera continua sin apagado programado, el consumo mensual alcanza ~$31 USD, reduciendo el margen de seguridad para noviembre.
- **Políticas de región:** Azure for Students restringe la creación de recursos a regiones específicas (`centralus`, `eastus`, `brazilsouth`, `chilecentral`, `westus3`).

**Mitigación:**

- Activación del *Auto-shutdown* nocturno desde el portal de Azure para reducir las horas facturables en un ~40%.
- Aprovisionamiento en la región autorizada `Central US`, validada y admitida por la política de la suscripción.
- Plan de relevo documentado: En caso de requerir saldo adicional imprevisto, integrantes del equipo con cuenta institucional activa disponen de $100 USD de crédito independiente para clonar el repositorio y levantar el stack en minutos.
