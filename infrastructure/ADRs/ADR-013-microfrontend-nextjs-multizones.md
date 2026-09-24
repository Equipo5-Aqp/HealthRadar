# ADR-013: Migración a Microfrontend Architecture con Next.js Multi-Zones y Shell Router Nginx

## Estado

Aceptado

## Contexto

El frontend original de HealthRadar consistía en una única aplicación monolítica en Next.js alojada en un único contenedor (`src/frontend/`), compuesta por dos páginas principales:
- `src/frontend/src/app/page.js`: Consulta epidemiológica en lenguaje natural (NLQ) y visualización de tendencias (~405 líneas).
- `src/frontend/src/app/historicos/page.js`: Exploración y filtrado de datasets históricos de Dengue, EDA e IRA (~277 líneas).

Aunque ambas funcionalidades compartían la identidad visual de la aplicación, su evolución, dependencias y ciclo de despliegue debían ser desacoplados para permitir desarrollo y despliegues independientes sin riesgo de afectar el servicio completo ante fallos de una zona particular.

## Decisión

Se adopta el patrón oficial **Next.js Multi-Zone** soportado por un contenedor **nginx-shell** como Shell Router en el puerto público 3000:

1. **Desacoplamiento en dos Microfrontends (MFs):**
   - **`mf-consulta`**: Maneja la ruta raíz `/` (Chat NLQ y tendencias). Escucha internamente en `PORT=3000` con `basePath: ''`.
   - **`mf-historicos`**: Maneja el subdominio de rutas `/historicos` (exploración tabular y filtros). Escucha internamente en `PORT=3000` con `basePath: '/historicos'`.

2. **Shell Router (Nginx):**
   - Imagen ligera `nginx:1.27-alpine` (~64 MB RAM) expuesta al host en `3000:3000`.
   - Mapea `location /historicos` hacia `http://mf-historicos:3000` y `location /` hacia `http://mf-consulta:3000`.

3. **Resolución de API y BasePath en Cliente:**
   - En `mf-historicos`, las rutas API de Next.js se sirven bajo `/historicos/api/historicos`.
   - En el cliente (`n8nHistoricosAdapter.js`), la llamada usa una constante literal `const BASE = '/historicos'`. No se utiliza `NEXT_PUBLIC_*` en variables de entorno de runtime porque Next.js inlinea dichas variables en tiempo de compilación (`next build`), lo que provocaría discrepancias o fallos 404 al servirse tras el proxy.

4. **Reglas de Gobernanza de Arquitectura:**
   - **Regla 1 (Aislamiento de dependencias):** Prohibido importar código entre microfrontends o directamente hacia `@healthradar/core`. Cada MF es autónomo y desacoplado.
   - **Regla 2 (Shared puro):** La carpeta interna `modules/shared/constants/` solo contiene constantes puras (datos planos), sin estado, hooks, fetch ni dependencias de React.
   - **Regla 3 (Estilos autocontenidos):** Cada componente define sus propios estilos `const styles = { ... }`. Los ensambladores gestionan el layout estructural y `globals.css` solo provee reset y tokens tipográficos.
   - **Regla 4 (Navegación cross-zone):** La navegación entre diferentes zonas (`/` y `/historicos`) se realiza estrictamente con etiquetas `<a href="...">` nativas, nunca con `<Link>` de `next/link`, para evitar que el `basePath` interfiera en el enrutamiento inter-zona.

## Alternativas Descartadas

- **Module Federation (Webpack/Rspack):** Descartado debido a la complejidad de configuración y la sobrecarga innecesaria de memoria RAM sobre el presupuesto de 4 GiB de la VM.
- **Despliegue mixto en Vercel:** Descartado porque Vercel requeriría exponer los webhooks internos de n8n a internet público, violando la regla crítica de seguridad y aislamiento de red privada de ADR-004 y ADR-008.
- **Frontend modular intra-proceso (Ruta única Next.js en un solo contenedor):** Descartado porque no constituye una arquitectura de microfrontends real: carece de builds, pipelines de CI/CD y despliegues independientes en contenedores aislados.

## Consecuencias

### Beneficios

- **Despliegues 100% independientes:** Es posible actualizar o reiniciar `mf-consulta` (`docker compose up -d --build mf-consulta`) sin interrumpir la operación de `mf-historicos` ni del Shell Router.
- **CI/CD optimizado:** Pipelines independientes en GitHub Actions activados por detección de cambios en carpetas (`paths-filter`).
- **Aislamiento de fallos:** Un error crítico de runtime en una zona no colapsa el servidor de la otra zona.

### Costos y Riesgos

- **Consumo de memoria (+192 MB):** Se añade un contenedor Next.js standalone adicional (192 MB) y nginx (64 MB). El presupuesto total estimado es:
  `PostgreSQL (768 MB) + n8n (1536 MB) + Phoenix (512 MB) + Nginx (64 MB) + mf-consulta (192 MB) + mf-historicos (192 MB) = 3264 MB`, dejando un margen (~832 MB) para el sistema operativo en la VM de 4 GiB (ADR-011).
- **Sobrecarga de dos procesos V8:** Se debe vigilar el consumo de CPU y memoria periódicamente mediante métricas y `docker stats`.
