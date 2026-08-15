# ADR-008: Docker Compose como estrategia de despliegue self-hosted

Relacionado con: ADR-001 (orquestación n8n), ADR-004 (Next.js Frontend), ADR-005 (Langfuse)

## Contexto

HealthRadar está compuesto por cuatro contenedores internos: el Frontend
(Next.js), el orquestador de workflows (n8n), la base de datos
(PostgreSQL + pgvector) y la plataforma de observabilidad (Langfuse).
Los ADR-001 y ADR-005 ya mencionan que n8n y Langfuse se despliegan
"con Docker", pero ninguno de los ADRs existentes define formalmente
la estrategia de despliegue del sistema completo, ni resuelve dónde
vive el contenedor del Frontend ni cómo se comunican entre sí los
cuatro contenedores.

Dejar esta decisión implícita genera un riesgo real: si cada
contenedor se despliega por separado y con criterios distintos (por
ejemplo, el Frontend en un servicio gestionado como Vercel y el resto
autohospedado), se rompe la premisa de self-hosted establecida en
ADR-001, se multiplican los puntos de configuración de red y
credenciales, y se dificulta la reproducibilidad del entorno completo
para efectos de evaluación y auditoría técnica.

Se evaluaron tres alternativas de orquestación de despliegue:

- **Kubernetes:** provee orquestación multi-nodo, autoescalado y
  recuperación avanzada ante fallos, pero introduce una complejidad
  operacional (control plane, manifiestos YAML, gestión de clúster)
  desproporcionada para un sistema de cuatro contenedores en un solo
  host, sin necesidad real de escalado horizontal en el alcance actual
  del proyecto.
- **Servicios gestionados por separado** (Vercel para el Frontend,
  n8n Cloud, una base de datos como servicio, etc.): elimina el
  control sobre la infraestructura, contradice directamente la decisión
  de self-hosted de ADR-001, y obliga a exponer credenciales y URLs de
  integración entre proveedores distintos, aumentando la superficie de
  riesgo de seguridad que ADR-004 buscaba minimizar.
- **Docker Compose de un solo host:** orquesta los cuatro contenedores
  en una única máquina, con un solo archivo de definición versionable,
  sin necesidad de gestionar un clúster.

## Decisión

Se utilizará **Docker Compose** como única estrategia de despliegue de
HealthRadar, en un solo host. Los cuatro contenedores del sistema —
Frontend (Next.js), Orquestador (n8n), Base de Datos (PostgreSQL +
pgvector) y Observabilidad (Langfuse) — se definen en un mismo archivo
`docker-compose.yml` en la raíz del repositorio.

Reglas de la estrategia de despliegue:

- **Red interna:** los cuatro contenedores se comunican entre sí a
  través de la red interna de Docker Compose, usando el nombre del
  servicio como hostname (por ejemplo, n8n se conecta a PostgreSQL
  mediante el hostname `postgres`, no mediante una IP pública). Ningún
  contenedor expone puertos innecesarios al host.
- **Puertos expuestos al host:** únicamente el Frontend (Next.js)
  expone un puerto público, ya que es el único contenedor que debe ser
  accesible desde fuera de la red interna. n8n, PostgreSQL y Langfuse
  no exponen puertos públicos; solo son alcanzables entre sí dentro de
  la red interna de Docker Compose.
- **Variables de entorno y credenciales:** todas las credenciales
  (tokens de webhook de n8n, claves de conexión a PostgreSQL, tokens
  de Langfuse) se inyectan mediante un archivo `.env` en la raíz del
  repositorio, nunca escritas directamente en el `docker-compose.yml`
  ni en el código, conforme a la regla crítica de "cero credenciales
  expuestas" (`mi_rol_arquitecto.md`, sección 6).
- **Persistencia de datos:** PostgreSQL y Langfuse usan volúmenes
  nombrados de Docker para persistir datos entre reinicios de los
  contenedores. n8n usa un volumen para persistir los workflows y
  credenciales configuradas en su interfaz.
- **Política de reinicio:** todos los servicios usan
  `restart: unless-stopped`, de modo que ante una caída del host o de
  un contenedor individual, Docker los reinicia automáticamente sin
  intervención manual, en línea con la mitigación de riesgo de punto
  único de falla ya identificada en ADR-001.

## Consecuencias

**Beneficios:**

- Reproducibilidad total del entorno: cualquier persona del equipo (o
  el evaluador del proyecto) puede levantar el sistema completo con un
  solo comando (`docker compose up`), sin configuración manual
  dispersa entre proveedores.
- Consistencia con la decisión de self-hosted de ADR-001: ningún
  contenedor depende de un servicio gestionado externo para operar.
- Simplicidad operacional: no se requiere gestionar un clúster ni
  aprender una herramienta de orquestación adicional para un sistema
  de cuatro contenedores en un solo host.
- Superficie de ataque reducida: solo el Frontend expone un puerto
  público; n8n, PostgreSQL y Langfuse permanecen inaccesibles desde
  fuera de la red interna de Docker, incluso si sus credenciales se
  vieran comprometidas por otra vía.
- Un único archivo `docker-compose.yml` es versionable en el
  repositorio y auditable como parte del proceso de revisión de PRs.

**Riesgos:**

- **Single point of failure de infraestructura:** al estar todo en un
  solo host, si ese host cae, todo el sistema —incluyendo el
  Frontend— deja de estar disponible. Esto amplía el riesgo ya
  identificado en ADR-001 (antes limitado a n8n) a los cuatro
  contenedores.
- Docker Compose no ofrece autoescalado ni balanceo de carga. Si el
  volumen de consultas NLQ creciera significativamente, esta
  arquitectura de despliegue no soporta ese crecimiento sin
  rediseño.
- Un error en la configuración de red interna de Docker Compose podría
  exponer accidentalmente un puerto de PostgreSQL o n8n al host,
  rompiendo la regla de "cero accesos directos indebidos"
  (`mi_rol_arquitecto.md`, sección 7).

**Mitigación:**

- El Arquitecto valida en cada PR que modifique el `docker-compose.yml`
  que únicamente el servicio del Frontend declare un mapeo de puertos
  hacia el host.
- El archivo `.env` se excluye explícitamente del control de versiones
  mediante `.gitignore`, y se documenta un `.env.example` sin valores
  reales como referencia para el equipo.
- Si en una fase futura el volumen de uso lo justifica, este ADR queda
  documentado como punto de partida para evaluar una migración a
  Kubernetes u otra estrategia de orquestación multi-nodo, sin que eso
  invalide la decisión actual para el alcance presente del proyecto.
