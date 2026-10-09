# Guía de Arquitectura y Gobernanza Técnica para Asistentes IA (AGENTS.md)

Este documento es el **punto de entrada obligatorio y contexto de verdad** para cualquier agente de Inteligencia Artificial (GitHub Copilot, Cursor, Windsurf, Claude Code, Antigravity, OpenCode, etc.) que asista en el desarrollo o modificación de este repositorio.

Cualquier cambio propuesto debe respetar las directrices aquí establecidas. **No inventar puertos, rutas, servicios ni tecnologías que contradigan este documento.**

---

## 1. Visión y Propósito del Sistema

**HealthRadar** es un sistema de vigilancia epidemiológica para el Perú (enfoque en Dengue, EDA e IRA) impulsado por IA, que procesa boletines epidemiológicos abiertos del MINSA/CDC y datos climáticos de Open-Meteo, exponiendo visualizaciones y consultas en lenguaje natural (NLQ).

---

## 2. Topología de Infraestructura (Host Único Azure B2als_v2 - 4 GiB RAM)

Toda la infraestructura está encapsulada en `infrastructure/docker-compose.yml` desplegada sobre una VM Ubuntu en Microsoft Azure ([ADR-011](infrastructure/ADRs/ADR-011-azure-vm-hosting.md)) con una red interna aislada `172.20.0.0/16` (`healthradar-net`).

### Presupuesto de Memoria Estricto (Techo Máximo: 3,456 MB / 4,096 MB)
El host dispone de solo 4 GiB de RAM. **Está terminantemente prohibido agregar contenedores o elevar los límites de memoria sin aprobación del Arquitecto.**

| Contenedor | Servicio Compose | IP Interna | Límite RAM | Puertos | Propósito | ADR |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `healthradar-nginx-shell` | `nginx-shell` | `172.20.0.2` | **64 MB** | **`3000:3000` (Público)** | Único punto de entrada perimetral (Shell Router). Enruta a los 3 microfrontends. | [ADR-013](infrastructure/ADRs/ADR-013-microfrontend-nextjs-multizones.md) |
| `healthradar-n8n` | `n8n` | `172.20.0.3` | **1536 MB** | `5678` (Interno) | Orquestador de eventos (EDA) con `@healthradar/core` embebido en su imagen Docker. | [ADR-001](infrastructure/ADRs/ADR-001-n8n-self-hosted-orquestacion.md), [ADR-012](infrastructure/ADRs/ADR-012-data-centric-arquitectura.md) |
| `healthradar-postgres` | `postgres` | `172.20.0.4` | **768 MB** | `5432` (Interno) | Base de datos relacional + extensión `pgvector` habilitada. | [ADR-002](infrastructure/ADRs/ADR-002-postgresql-pgvector-base-de-datos.md) |
| `healthradar-phoenix` | `phoenix` | `172.20.0.5` | **512 MB** | `6006`, `4317`, `4318` (Interno) | Arize Phoenix Self-Hosted para observabilidad de llamadas a LLM y trazas OTel. | [ADR-010](infrastructure/ADRs/ADR-010-arize-phoenix-observabilidad-llms.md) |
| `healthradar-mf-consulta` | `mf-consulta` | `172.20.0.6` | **192 MB** | `3000` (Interno) | Microfrontend de Asistencia NLQ conversacional bajo `/consulta`. | [ADR-004](infrastructure/ADRs/ADR-004-nextjs-frontend-capa-seguridad.md), [ADR-013](infrastructure/ADRs/ADR-013-microfrontend-nextjs-multizones.md) |
| `healthradar-mf-historicos`| `mf-historicos` | `172.20.0.7` | **192 MB** | `3000` (Interno) | Microfrontend de Análisis Tabular y Mapa de Calor bajo `/historicos`. | [ADR-013](infrastructure/ADRs/ADR-013-microfrontend-nextjs-multizones.md) |
| `healthradar-mf-dashboard` | `mf-dashboard` | `172.20.0.8` | **192 MB** | `3000` (Interno) | Microfrontend de Panorama General, Landing y KPIs bajo `/`. | [ADR-013](infrastructure/ADRs/ADR-013-microfrontend-nextjs-multizones.md) |

> **Regla de Red Perimetral:** Ningún contenedor expone puertos al host exterior salvo `nginx-shell` (puerto `3000`). PostgreSQL, n8n y Phoenix **NUNCA** deben tener la cláusula `ports:` pública en Compose.

---

## 3. Arquitectura del Frontend: Microservicios Frontend (Microfrontends)

HealthRadar implementa **Microfrontends con Next.js Multi-Zones** ([ADR-013](infrastructure/ADRs/ADR-013-microfrontend-nextjs-multizones.md)):

1. **Estructura en `src/`:**
   - `src/mf-dashboard/`: Next.js 14 standalone, atiende la raíz `/` (`basePath: ''`).
   - `src/mf-consulta/`: Next.js 14 standalone, atiende `/consulta` (`basePath: '/consulta'`).
   - `src/mf-historicos/`: Next.js 14 standalone, atiende `/historicos` (`basePath: '/historicos'`).
2. **Enrutamiento Nginx (`infrastructure/nginx/nginx.conf`):**
   - Proxy inverso que mapea las rutas al respectivo contenedor upstream.
3. **Reglas de Desarrollo Frontend:**
   - **Navegación Cross-Zone:** Siempre usar `<a href="/consulta">` o `<a href="/historicos">` nativos para cambiar de microfrontend. **NO** usar `<Link>` de `next/link` entre zonas distintas para evitar conflictos de `basePath`.
   - **Capa BFF / Seguridad ([ADR-004](infrastructure/ADRs/ADR-004-nextjs-frontend-capa-seguridad.md)):** El frontend **JAMÁS** llama a PostgreSQL, ni a n8n por el navegador, ni a proveedores de IA directamente. El cliente llama a sus Server-Side Routes (`/api/*`), las cuales actúan de Backend-For-Frontend (BFF) contactando a `http://n8n:5678` a través de la variable `N8N_INTERNAL_URL`.
   - **Renderizado del Mapa:** La carga del GeoJSON del mapa nacional se delega al navegador del cliente (`fetch` en cliente) para no consumir la memoria RAM del servidor.

---

## 4. Arquitectura del Backend: Basada en Eventos (EDA) y Núcleo Puro

El backend sigue una **Arquitectura Basada en Eventos (EDA)** ([ADR-012](infrastructure/ADRs/ADR-012-data-centric-arquitectura.md)):

1. **n8n como Event-Driven Orchestrator ([ADR-001](infrastructure/ADRs/ADR-001-n8n-self-hosted-orquestacion.md)):**
   - Reacciona a eventos del usuario mediante **Webhook Triggers**:
     - `POST /webhook/consulta` (Evento `QueryRequested` para NLQ).
     - `POST /webhook/tendencia` (Evento `TrendRequested` para proyección).
     - `POST /webhook/historicos` (Evento `HistoricalFiltered`).
   - Reacciona a eventos temporales mediante **Cron Triggers**:
     - Ingesta Fase A: Recolección semanal de boletines del CDC y Open-Meteo ([ADR-006](infrastructure/ADRs/ADR-006-minsa-cdc-fuente-datos-epidemiologicos.md), [ADR-007](infrastructure/ADRs/ADR-007-open-meteo-fuente-datos-climaticos.md)).
     - Ingesta Fase B: Procesamiento y extracción con IA.
2. **Desacoplamiento con `@healthradar/core` (`src/core/`):**
   - n8n **NO** contiene reglas de negocio complejas en código suelto.
   - La lógica de resolución de periodos epidemiológicos, ventanas por defecto, umbrales de alerta y failover vive en la biblioteca Node.js pura `src/core/` con tests unitarios automatizados.
   - n8n invoca la biblioteca en sus nodos Code mediante `require('@healthradar/core')`.

---

## 5. Estrategia de Modelos de Inteligencia Artificial (LLMs)

Implementada según [ADR-003](infrastructure/ADRs/ADR-003-division-llms-por-momento-operacion.md):

- **Momento Ingesta (Batch / Extracción de Boletines PDF):**
  - Modelo: **Google Gemini 2.5 Flash** (ventana de contexto masiva y capacidad multimodal).
  - Resiliencia: Rotación secuencial de **3 API Keys** (`GEMINI_API_KEY`, `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3`) para mitigar límites de cuota (Rate Limits 429) en el plan gratuito.
- **Momento Consulta (Online / NLQ interactivo para el analista):**
  - Modelo Principal: **NVIDIA API Catalog** (modelos de alto razonamiento como Kimi k1.5 / Moonshot o GLM-4) vía `NVIDIA_API_KEY`.
  - Contingencia / Fallback: Conmutación automática hacia **OpenRouter** ante errores 429 o caídas de latencia.
- **Observabilidad ([ADR-010](infrastructure/ADRs/ADR-010-arize-phoenix-observabilidad-llms.md)):**
  - Cada llamada a un LLM en n8n debe emitir su traza OTel correspondiente al contenedor `healthradar-phoenix` (`http://phoenix:4318/v1/traces`).

---

## 6. Mapa Rápido de Decisiones de Arquitectura (ADRs)

| ADR | Decisión Central | Estado |
| :--- | :--- | :--- |
| **ADR-001** | n8n Self-Hosted como orquestador puro sin reglas de dominio hardcodeadas | Vigente |
| **ADR-002** | PostgreSQL 16 con extensión `pgvector` para datos relacionales y embeddings | Vigente |
| **ADR-003** | División de LLMs: Gemini (3 llaves) para Ingesta y NVIDIA (Kimi/GLM) para Consulta | Vigente |
| **ADR-004** | Next.js API Routes como capa de seguridad BFF (aislamiento de red) | Vigente |
| **ADR-005** | Langfuse (Superado y reemplazado por ADR-010) | Obsoleto |
| **ADR-006** | MINSA / CDC Perú como fuente oficial de datos epidemiológicos | Vigente |
| **ADR-007** | Open-Meteo como API para series de temperatura y precipitación | Vigente |
| **ADR-008** | Docker Compose para despliegue de 7 contenedores con límite de 3,456 MB de RAM | Vigente |
| **ADR-009** | OCI Always Free (Superado y reemplazado por ADR-011) | Obsoleto |
| **ADR-010** | Arize Phoenix Self-Hosted como plataforma de observabilidad LLM | Vigente |
| **ADR-011** | Hosting en Microsoft Azure Virtual Machines (instancia B2als_v2 con 4 GiB) | Vigente |
| **ADR-012** | Arquitectura Basada en Eventos (EDA) en n8n con `@healthradar/core` desacoplado | Vigente |
| **ADR-013** | Microservicios Frontend (3 Microfrontends) con Next.js Multi-Zones y Shell Nginx | Vigente |

---

## 7. Instrucciones para Generación de Código y Optimización de Carga

1. **Variables de Entorno:** Nunca crear archivos `.env` en los commits. Usar siempre `infrastructure/.env.example` como plantilla. Nunca usar prefijos `NEXT_PUBLIC_` para credenciales o URLs internas de Docker.
2. **Microfrontends:** No importar archivos de un microfrontend dentro de otro. El código debe mantenerse estrictamente desacoplado en `src/mf-dashboard/`, `src/mf-consulta/` y `src/mf-historicos/`.
3. **Control de Memoria del Servidor:** Mantener las configuraciones de `output: 'standalone'` en los proyectos Next.js y no introducir dependencias pesadas de servidor en Node.js.
4. **Delegación de Cómputo al Navegador (Client-Side Offloading):** Para preservar el presupuesto crítico de CPU/RAM de la VM Azure B2als_v2 (4 GiB), **se debe delegar el procesamiento intensivo al navegador del cliente siempre que no viole la seguridad ni los ADRs**.
   - *Ejemplos obligatorios:* Carga, parseo y renderizado de capas GeoJSON del mapa nacional en el cliente (`fetch` desde el navegador); filtrado/ordenamiento de tablas históricas en memoria del navegador; renderizado de gráficos (Chart.js / SVG) en el cliente.
   - *Límite de seguridad:* El cliente **nunca** debe consultar la base de datos ni modelos de IA directamente; el offloading aplica al cómputo y renderizado visual, no al bypass del BFF ([ADR-004](infrastructure/ADRs/ADR-004-nextjs-frontend-capa-seguridad.md)).

---

## 8. Reglas Operativas para Agentes IA (No Negociables)

1. **Planificar antes de actuar:** Antes de cualquier edición, explica brevemente el plan y los archivos a tocar. No saltes directo a modificar.
2. **Leer antes de editar:** Obligatorio leer el archivo con herramientas de lectura (`view_file` o equivalente) al menos una vez antes de editar o sobrescribir. Nunca asumir contenido.
3. **Investigar antes de asumir:** Si dudas sobre una librería, patrón o convención: busca en el código (`grep_search` / `list_dir`) o consulta los ADRs. **Nunca asumas que existe una dependencia** que no esté en `package.json`.
4. **Citar fuentes para navegación:** Al referenciar funciones, componentes o lógica, incluir ruta y contexto (ej. `src/core/periodos.js:42`). Esto obliga a basarse en código real y verificable.
5. **Preguntar ante ambigüedad:** Si hay dos o más interpretaciones posibles o riesgos para la arquitectura, **pregunta al usuario** antes de decidir. No asumas la vía más conveniente.
6. **Un solo objetivo en progreso:** Mantener exactamente una tarea o ítem en foco a la vez para evitar cambios dispersos o descontrolados.
7. **Verificación obligatoria:** Al completar una tarea de código, ejecutar validaciones pertinentes (linter, validación de sintaxis, docker compose config o tests si existen). Si no se conocen los comandos de prueba, consultarlos.
8. **No adivinar URLs, puertos, rutas o variables:** Usar únicamente lo documentado en `AGENTS.md`, ADRs, `docker-compose.yml` y `nginx.conf`. Prohibido inventar endpoints o servicios auxiliares.
9. **Preservar estilo existente:** Imitar el estilo de código, importaciones, patrones y convenciones del archivo. No reformatear archivos completos sin justificación.
10. **Comunicación clara y directa:** Toda explicación debe ser concisa, en texto estructurado y sin rodeos. Evitar adulación o complacencia (anti-sycophancy).

---

## 9. Guardrails Anti-Alucinaciones

1. **Fuente única de verdad:** Las decisiones arquitectónicas prevalecen en los **ADRs** (`infrastructure/ADRs/`). Si hay conflicto entre una suposición y un ADR, **siempre prevalece el ADR**.
2. **Evidencia antes de conclusión:** Toda afirmación sobre el código o estado del sistema debe sustentarse con lectura previa o búsqueda en el repositorio. No declarar hechos sin evidencia verificable.
3. **Validar contratos:** Cualquier cambio que afecte webhooks de n8n, contratos de eventos JSON o esquema de PostgreSQL debe contrastarse con `src/core/`, flujos de n8n y migraciones (`src/database/migrations/`).
4. **Prohibido extrapolar libremente:** No inventar ni generalizar patrones de diseño o arquitecturas que no hayan sido aprobadas y documentadas en este repositorio.
5. **Fail-safe por ambigüedad:** Ante una duda técnica o contradicción irresoluble: **preguntar de inmediato al desarrollador/arquitecto en vez de inventar una solución.**
