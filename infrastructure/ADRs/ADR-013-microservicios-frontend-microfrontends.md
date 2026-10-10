# ADR-013: Migración a Arquitectura de Microservicios Frontend (Microfrontends) con Next.js Multi-Zones y Shell Router Nginx

**Estado:** Aceptado (2026-10-06)  
**Relacionado con:** ADR-004, ADR-008, ADR-011, ADR-012  
**Refina a:** ADR-004 (desacopla el frontend monolítico en microservicios visuales autónomos)

## Contexto

El frontend original de HealthRadar consistía en una única aplicación monolítica en Next.js (`src/frontend/`), agrupando en una sola base de código la vista de bienvenida, el chat analítico NLQ y el explorador de datasets históricos.

Esta estructura presentaba limitaciones directas para el trabajo en equipo y el ciclo de vida del software:
- Un cambio en la interfaz del chat exigía reconstruir y redesplegar todo el frontend.
- Fallos o sobrecargas de procesamiento en una funcionalidad afectaban la disponibilidad general del portal.
- Se contraponía al lineamiento de arquitectura establecido por la cátedra, el cual requiere una **Arquitectura de Microservicios en el Frontend (Microfrontends)** donde cada módulo de la interfaz opere como un servicio autónomo e independiente conectado a su respectivo flujo de eventos en el backend.

Se evaluaron alternativas como Module Federation en Webpack/Rspack (descartado por excesiva complejidad y sobrecarga de memoria RAM) y despliegues serverless externos como Vercel (descartado porque expondría los webhooks internos a la red pública, violando el aislamiento estricto de ADR-004 y ADR-008).

## Decisión

Se adopta la arquitectura de **Microservicios Frontend (Microfrontends)** implementada bajo el patrón **Next.js Multi-Zones** y coordinada por un **Shell Router Nginx** en el perímetro:

### 1. Desacoplamiento en Tres Microfrontends Autónomos (Microservicios UI)
Cada dominio funcional se convierte en un microfrontend aislado con su propio contenedor Docker, dependencias, variables de entorno y pipeline de CI/CD:
- **`mf-dashboard` (Microfrontend 1 - Panorama General):**
  - Maneja la ruta raíz `/` (Landing page, KPIs epidemiológicos de Dengue/EDA/IRA, semáforo de riesgo y accesos rápidos).
  - Escucha internamente en `PORT=3000` con `basePath: ''`.
  - Contenedor: `healthradar-mf-dashboard` (192 MB RAM, IP `172.20.0.8`).
- **`mf-consulta` (Microfrontend 2 - Asistente NLQ):**
  - Maneja la subruta `/consulta` (Interfaz conversacional de lenguaje natural, proyección de tendencias y recomendaciones sanitarias).
  - Escucha internamente en `PORT=3000` con `basePath: '/consulta'`.
  - Contenedor: `healthradar-mf-consulta` (192 MB RAM, IP `172.20.0.6`).
- **`mf-historicos` (Microfrontend 3 - Datos Históricos):**
  - Maneja la subruta `/historicos` (Tabla exploratoria tabular, filtros por departamento/semana y mapa epidemiológico del Perú).
  - Escucha internamente en `PORT=3000` con `basePath: '/historicos'`.
  - Contenedor: `healthradar-mf-historicos` (192 MB RAM, IP `172.20.0.7`).

### 2. Shell Router Perimetral (Nginx)
Un contenedor ligero `nginx:1.27-alpine` (`healthradar-nginx-shell`, 64 MB RAM, IP `172.20.0.2`) opera como el único punto de entrada público expuesto al host en `3000:3000`:
- Enruta el tráfico HTTP según la ruta solicitada:
  - `location /` y activos de dashboard ➔ upstream `mf_dashboard`.
  - `location /consulta` y activos de consulta ➔ upstream `mf_consulta`.
  - `location /historicos` y activos de históricos ➔ upstream `mf_historicos`.
- Mantiene los 3 microfrontends y el resto del stack confinados de manera segura en la red interna privada `healthradar-net`.

### 3. Emisión de Eventos hacia el Backend (Conexión 1 a 1 con EDA)
Cada microfrontend contiene su propia capa BFF (`/api/*`) que transforma las interacciones del usuario en eventos y los despacha hacia los webhooks de n8n (ADR-012) usando `N8N_INTERNAL_URL`:
- `mf-consulta` emite eventos hacia `/webhook/consulta` y `/webhook/tendencia`.
- `mf-historicos` emite eventos hacia `/webhook/historicos`.
- `mf-dashboard` consulta vistas consolidadas.

### 4. Reglas de Gobernanza
- **Aislamiento absoluto:** Prohibido compartir estado en memoria o importar código fuente directo entre microfrontends.
- **Navegación Cross-Zone:** La transición entre zonas (`/`, `/consulta`, `/historicos`) se realiza mediante etiquetas HTML `<a>` nativas, evitando que el enrutador cliente de Next.js colisione con el `basePath` de otra zona.
- **Límites de Recursos:** Cada microfrontend tiene un techo innegociable de 192 MB de RAM (`mem_limit` en Compose), totalizando 576 MB entre los 3 servicios.

## Consecuencias

**Beneficios:**
- **Independencia de Desarrollo y Despliegue:** Cada microfrontend puede compilarse, probarse y desplegarse de manera 100% aislada sin riesgo de caída transversal del portal.
- **Alineación con la Arquitectura de Microservicios:** Cumple a cabalidad con la segregación modular del frontend requerida por la cátedra.
- **Aislamiento de Fallos:** Si el servicio de consulta NLQ experimenta alta demanda o falla temporalmente, el dashboard y el visor histórico continúan operando normalmente.

**Riesgos:**
- Sobrecarga de memoria de 3 runtimes Node.js independientes (+576 MB en total).
- Duplicación de dependencias básicas (React/Next.js) en cada imagen Docker.

**Mitigación:**
- Uso estricto del modo `output: 'standalone'` en `next.config.js` e imágenes base `alpine` optimizadas.
- Presupuesto global de memoria controlado en 3,456 MB de los 4,096 MB de la VM de Azure (ADR-008, ADR-011).
