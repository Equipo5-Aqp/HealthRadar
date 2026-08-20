# ADR-009: Oracle Cloud Infrastructure (OCI) Always Free como proveedor de hosting para el host único de Docker Compose

Relacionado con: ADR-001 (orquestación n8n), ADR-010 (observabilidad Arize Phoenix), ADR-008 (Docker Compose)

## Contexto

El ADR-008 define que HealthRadar se despliega mediante Docker Compose en
un solo host, pero no especifica dónde vive ese host físico. La
documentación del curso (`05-arquitectura.md`, sección "Capa de
Orquestación y Lógica") exige explícitamente que n8n corra en una
instancia self-hosted propia del equipo, dando como ejemplos válidos "un
VPS económico o AWS EC2/Azure VM". Queda descartado el uso de n8n Cloud
u otro servicio gestionado equivalente, porque contradice la premisa de
self-hosted de ADR-001.

El dimensionamiento del host requiere atención. Langfuse v3+ requería
seis contenedores (Web, Worker, ClickHouse, Redis, MinIO, PostgreSQL)
con 4-8 GB de RAM solo para observabilidad, lo cual motivó la adopción
de Arize Phoenix en ADR-010 (un único contenedor sobre el PostgreSQL ya
existente). Con Arize Phoenix, n8n (ADR-001), PostgreSQL/pgvector (ADR-002)
y el Frontend Next.js (ADR-004), el host opera de manera holgada dentro
del margen de memoria disponible.

Se evaluaron tres alternativas dentro de las permitidas por la
documentación del curso:

- **AWS EC2 (free tier):** desde el 15 de julio de 2025 ya no ofrece
  horas gratis permanentes para cuentas nuevas; da en su lugar hasta
  $200 USD en créditos válidos solo 6 meses. La instancia elegible para
  free tier (t3.micro) tiene 1 GB de RAM, insuficiente para correr los
  seis contenedores de Langfuse junto al resto del stack sin caídas por
  falta de memoria (OOM). Igualar la RAM de OCI en AWS requiere una
  instancia no elegible para free tier (~8 GB), con costo aproximado de
  $60-70/mes que agotaría el crédito antes de terminar el curso.
- **Azure VM:** mencionada como alternativa válida en la documentación
  del curso, pero no fue evaluada en profundidad dado que OCI ofrece más
  RAM gratuita de forma permanente para el mismo caso de uso.
- **Oracle Cloud Infrastructure (OCI) Always Free — Ampere A1:** ofrece
  cómputo ARM gratuito de forma permanente (no limitado a un período de
  prueba), con memoria suficiente para el stack completo del proyecto.

## Decisión

Se utilizará **Oracle Cloud Infrastructure (OCI), tier Always Free**,
como proveedor de hosting para el host único donde corre el
`docker-compose.yml` definido en ADR-008. La instancia se aprovisiona
con el shape `VM.Standard.A1.Flex`, configurado en **2 OCPU y 12 GB de
RAM** (límite vigente del Always Free tier desde junio de 2026; no se
asume la especificación anterior de 4 OCPU/24 GB, ya retirada por
Oracle).

Reglas específicas de esta decisión:

- El equipo administra el sistema operativo, Docker y Docker Compose
  directamente sobre la VM, sin usar ningún servicio gestionado de
  Oracle (como n8n a través de un marketplace o similar), preservando
  la condición de self-hosted exigida por la documentación del curso.
- Se documenta explícitamente que este es un recurso Always Free
  gratuito, no un free trial con expiración, a diferencia de la opción
  de AWS EC2 evaluada.
- El equipo debe monitorear activamente tres condiciones específicas de
  OCI que pueden afectar la disponibilidad del sistema (ver Riesgos).

## Consecuencias

**Beneficios:**

- 12 GB de RAM disponibles de forma permanente y sin costo, frente a 1
  GB del free tier de AWS EC2, lo cual garantiza que el stack completo
  (PostgreSQL, n8n, Next.js y Arize Phoenix) corra holgado y sin riesgo
  de caídas por falta de memoria (OOM).
- Al ser Always Free (no un trial de 6 o 12 meses), no hay riesgo de
  quedarse sin infraestructura a mitad del proyecto por agotamiento de
  créditos, como sí ocurre con AWS EC2 tras julio de 2025.
- Cumple la exigencia de self-hosted de la documentación del curso: el
  equipo controla el sistema operativo y Docker directamente, igual que
  si usaran un VPS pagado.
- 200 GB de almacenamiento en bloque y 10 TB de transferencia saliente
  mensual, suficientes para el volumen del proyecto.

**Riesgos:**

- **Reducción de límites sin aviso previo:** Oracle redujo el Always
  Free de Ampere A1 de 4 OCPU/24 GB a 2 OCPU/12 GB el 15 de junio de
  2026, sin anuncio oficial. Instancias que excedan el nuevo límite
  están sujetas a terminación. No hay garantía de que Oracle no reduzca
  de nuevo el límite durante el desarrollo del proyecto.
- **Capacidad regional limitada:** el aprovisionamiento de instancias
  Ampere A1 puede fallar con error "Out of capacity" según la región y
  el momento, un problema reportado de forma recurrente por la
  comunidad de usuarios de OCI.
- **Reclamación por inactividad:** Oracle puede apagar una instancia
  Always Free si, durante 7 días consecutivos, el percentil 95 de uso
  de CPU es menor a 20% y el uso de red y memoria es menor a 10% cada
  uno. Una instancia reclamada no se reinicia automáticamente y depende
  de capacidad disponible en la región al momento de reactivarla.
- Arquitectura ARM64 (no x86_64): la mayoría de imágenes Docker
  usadas en el proyecto (n8n, PostgreSQL, Langfuse, Node.js) soportan
  multi-arquitectura, pero cualquier imagen de terceros sin build ARM64
  podría no funcionar y debe validarse antes de asumirse compatible.

**Mitigación:**

- El Arquitecto valida al aprovisionar la instancia que el shape
  configurado sea `VM.Standard.A1.Flex` con 2 OCPU/12 GB, no el límite
  anterior de 4/24, para evitar terminación forzada.
- El equipo mantiene actividad continua del sistema (n8n con Schedule
  Trigger semanal, Langfuse recibiendo trazas) como parte del uso normal
  del proyecto, lo cual reduce el riesgo de reclamación por inactividad,
  pero se agrega monitoreo manual del estado de la instancia antes de
  cada Sprint Review y antes de la defensa del Sprint 4.
- Se documenta como plan de contingencia la migración a un VPS pagado
  económico (Hetzner o DigitalOcean, ambos permitidos por la
  documentación del curso bajo "VPS económico") en caso de que la
  instancia de OCI sea reclamada, reducida de límites nuevamente, o no
  se pueda reaprovisionar por falta de capacidad regional antes de una
  entrega evaluada.
- Antes de dar por cerrada la migración a producción, se valida que
  todas las imágenes Docker del `docker-compose.yml` tengan soporte
  ARM64 nativo, evitando así incompatibilidades de arquitectura al
  desplegar en Ampere A1.
