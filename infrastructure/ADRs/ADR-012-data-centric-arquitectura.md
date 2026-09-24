# ADR-012: Arquitectura Centrada en Datos (Data-Centric) con capa de decisiones pura empaquetada en n8n

**Estado:** Propuesto (2026-09-23)  
**Relacionado con:** ADR-001 (Orquestación n8n), ADR-002 (PostgreSQL con pgvector), ADR-003 (División de LLMs), ADR-004 (Frontend como capa de seguridad), ADR-008 (Docker Compose), ADR-010 (Arize Phoenix), ADR-011 (Hosting Azure VM)  
**Refina a:** ADR-001 (precisa el límite de responsabilidad de n8n)

## Contexto

El sistema creció y la dispersión de la lógica de dominio se volvió el principal riesgo técnico:

- El workflow NLQ (`Conexion posgrest.json`) alcanzó **28 nodos** y concentra detección de periodo/departamento/enfermedad, ventanas por defecto, activación de predicción, tendencias, cálculo de nivel de riesgo y failover de 3 cuentas Gemini — todo en JSON, **sin cobertura de pruebas unitarias** (los pytest actuales son caja negra contra webhooks).
- La ingesta se dividió en Fases A/B con la tabla `boletin_descubierto` como cola (migración `006`), y reglas de dominio comenzaron a vivir en funciones SQL (`fn_insertar_dato_climatico`, `fn_semana_epi_dge`, vista `v_clima_actual` — migración `007`).
- La lógica de decisión está hoy dispersa en **tres runtime distintos**: nodos Code/JS de n8n, funciones SQL y componentes del frontend.

Se evaluó y **se descartó migrar a microservicios** (ADR-008/011: host único de 4 GiB RAM sin autoescalado; ADR-002: base de datos única compartida; la complejidad creciente es interna al código, no de despliegue). Al evaluar la opción **data-centric** se constató que Clean Architecture no prohíbe una base de datos "inteligente": prohíbe que el _núcleo de decisiones_ dependa de la BD y de frameworks. La distinción operativa es:

- **Reglas de integridad y operaciones atómicas** → correctas en la base de datos (único Write Path).
- **Reglas de decisión / casos de uso** → deben vivir en una capa pura y testeable, sin conocer la BD ni n8n.

Restricción de infraestructura adicional: el stack ya asigna **2560 MB** de los 4096 MB del host (postgres 768m + n8n 1024m + phoenix 512m + frontend 256m), por lo que la capa de decisiones **no puede consumir RAM adicional**.

## Decisión

Se adopta una **arquitectura centrada en datos (Data-Centric)**: PostgreSQL + pgvector (ADR-002) es el corazón del sistema (modelo, integridad, derivadas y single source of truth), complementada por una **capa de aplicación de decisiones** pura y unit-testeable, y con n8n y el frontend rebajados a adaptadores delgados.

### Capas y límites de responsabilidad

1. **Núcleo de datos — PostgreSQL + pgvector (ADR-002).**
   Contrato único de verdad del sistema. Aquí viven exclusivamente:
   - Constraints, FKs, checks y claves naturales.
   - Funciones de integridad/atomicidad de escritura única (`fn_insertar_dato_climatico`, `fn_semana_epi_dge`).
   - Vistas derivadas de lectura (`v_clima_actual`), índices e índice HNSW para pgvector.
   - Regla de gobernanza: **NO** se implementan stored procedures extensos de decisión; las funciones SQL se mantienen pequeñas, versionadas en migraciones numeradas e idempotentes.

2. **Capa de aplicación de decisiones — biblioteca `@healthradar/core` (Node.js puro, en `src/core/`).**
   Reglas de decisión puras y unit-testeables, sin acceso directo a PostgreSQL ni acoplamiento a n8n:
   - Detección de periodo/departamento/enfermedad en la pregunta del analista.
   - Selección de ventana por defecto y resolución de periodos.
   - Activación de predicción y armado de tendencias.
   - Cálculo de nivel de riesgo y normalización de salidas.
   - Lógica de failover entre modelos y construcción de consultas SQL.
   - Depende únicamente de **contratos** (esquemas JSON versionados).

3. **Capa de orquestación — n8n (ADR-001, con límite de responsabilidad reducido).**
   Orquestador delgado: recibe webhooks, invoca `@healthradar/core` desde nodos Code, ejecuta llamadas a LLM (ADR-003) y persiste exclusivamente vía las funciones SQL del núcleo. Los nodos Code/JS se reducen al mínimo; n8n deja de ser repositorio de dominio.

4. **Capa de presentación — Next.js (ADR-004).**
   Presentación pura: las rutas `/api/*` permanecen como BFF/capa de seguridad. **No contiene lógica de decisión** (medidor/colores de riesgo, etiquetas de modelo, mapeo de errores de proveedor → se migran a `@healthradar/core`). Centraliza el cliente HTTP a n8n usando `N8N_INTERNAL_URL`.

5. **Actores externos — LLMs (ADR-003) y Arize Phoenix (ADR-010).**
   Invocados desde n8n según contrato; nunca desde el navegador.

### Restricción de recursos (RAM) y mecanismo de despliegue

- La capa de decisiones se ejecuta **dentro del proceso Node.js del contenedor n8n existente**: `@healthradar/core` es una **biblioteca pura, sin framework web** (no se levanta ningún servidor HTTP), instalada en la imagen de n8n mediante **Dockerfile propio**:

  ```dockerfile
  FROM n8nio/n8n:2.35.7
  COPY src/core/ /opt/healthradar-core/
  RUN cd /opt/healthradar-core && npm ci
  ENV NODE_FUNCTION_ALLOW_EXTERNAL=@healthradar/core
  ```

  La variable `NODE_FUNCTION_ALLOW_EXTERNAL=@healthradar/core` habilita el `require('@healthradar/core')` desde los nodos Code con lista blanca controlada.

- **No se añaden procesos ni contenedores** al stack Docker Compose (ADR-008): Δ RAM = 0 (solo ~10–15 MB en disco de imagen).
- El `mem_limit` de n8n se ajusta de `1024m` a **1536m (1.5 GiB)** como techo planificado de la nueva etapa. Presupuesto resultante del stack: **3072 MB** (postgres 768m + n8n 1536m + phoenix 512m + frontend 256m) sobre 4096 MB del host Azure (ADR-011), con margen libre.
- El CI/CD de n8n (`n8n-deploy-cd.yml`) se extiende para reconstruir esta imagen y versionar la biblioteca junto con los workflows.
- Alternativas rechazadas por esta restricción:
  - _(a)_ **Contenedor `core` aparte** → proceso y RAM adicionales en una VM de 4 GiB ya comprometida.
  - _(b)_ **Lógica de decisión en Next.js** → viola ADR-004 (frontend = capa de presentación/seguridad, no de dominio).
  - _(c)_ **Microservicios** → rechazados (ADR-008/011: host único; ADR-002: BD única compartida).

### Contratos entre capas

Esquemas JSON versionados como Anti-Corruption Layer: contrato de webhooks (NLQ/tendencia/históricos), contrato de funciones SQL y contrato de respuestas al frontend. Ninguna capa consume otra sin pasar por su contrato.

### Regla de dependencia

Núcleo de datos → no depende de nada. `@healthradar/core` → depende solo de contratos. n8n y frontend → dependen de `@healthradar/core`. Las decisiones **nunca** se duplican en SQL extenso, nodos JS de negocio o componentes de UI.

## Consecuencias

**Beneficios:**

- Lógica gobernada y testeable: decisiones con pruebas unitarias en CI; integridad en un único Write Path SQL.
- Single source of truth preservado (ADR-002): el modelo de datos sigue siendo el contrato central.
- n8n deja de concentrar dominio (desactiva el riesgo del "responsable único" de 28 nodos) y se vuelve orquestador delgado.
- Sin incremento de infraestructura: siguen siendo 4 contenedores y un solo host; Δ RAM = 0 por la nueva capa.

**Riesgos:**

- Extraer lógica de n8n puede romper workflows activos si no se definen primero los contratos JSON.
- Sin gobernanza, la capa SQL podría crecer hacia "stored procedures enterprise" (nueva deuda).
- El versionado conjunto biblioteca + workflow requiere disciplina (el `package.json` de `@healthradar/core` y los JSON de n8n deben desplegarse juntos).
- El techo elevado de n8n (1536m) acelera el OOM del host si Phoenix o Postgres crecen sin vigilancia.

**Mitigación:**

- Los contratos JSON se definen y versionan **antes** de cada migración de lógica.
- Migración incremental por workflow, con puerta de calidad en cada paso: los pytest actuales de caja negra pasan a ser pruebas de integración contra la capa de decisiones.
- Se documentan límites de tamaño para funciones SQL (integridad/atomicidad/derivadas únicamente) y se revisan en PR (plantilla `_PR_TEMPLATE`).
- Phoenix (ADR-010) continúa monitoreando trazas; se añade alerta de memoria del host al checklist operativo de Azure (ADR-011).

**Impacto en ADRs vigentes:**

- ADR-001: refinado — n8n conserva la orquestación, pierde la titularidad de las reglas de decisión.
- ADR-002, ADR-003, ADR-004, ADR-008, ADR-010, ADR-011: sin cambios.
- Microservicios: rechazados formalmente (este ADR documenta la elección data-centric vs microservicios).
