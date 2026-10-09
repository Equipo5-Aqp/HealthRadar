# ADR-004: Uso de Next.js como framework Frontend con rutas de API como capa de seguridad

**Estado:** Aceptado (2026-08-14)  
**Relacionado con:** ADR-001, ADR-008, ADR-013  

## Contexto

HealthRadar requiere una aplicación frontend para analistas de salud pública que integre dashboards epidemiológicos, visualización de tendencias y un campo de consulta asistida en lenguaje natural (NLQ).

La arquitectura base establece dos restricciones mandatorias:
1. El cliente web no puede interactuar directamente con la base de datos PostgreSQL ni con APIs externas de inteligencia artificial.
2. Si el navegador realizara peticiones directas a los endpoints o webhooks de n8n, las URLs internas, parámetros de red y tokens de autenticación quedarían expuestos en la consola del cliente y en el tráfico de red, representando una vulnerabilidad crítica de seguridad.

Se requiere una solución tecnológica que mantenga los secretos de infraestructura fuera del alcance del navegador, sin obligar al equipo a desplegar un microservicio backend intermedio dedicado únicamente a actuar como proxy perimetral.

## Decisión

Se adopta **Next.js** como framework de frontend, estableciendo una clara división de responsabilidades tecnológicas dentro del stack de presentación:

### Trinidad tecnológica del Frontend
- **React (Lo que ve el analista):**  
  Biblioteca declarativa encargada de la interfaz de usuario en el cliente: renderiza los componentes interactivos de la aplicación (caja de chat NLQ, tarjetas de KPIs, indicadores de riesgo y gráficos SVG).
- **Next.js (El que organiza y oculta los secretos):**  
  Framework integral que estructura el enrutamiento de vistas y provee el patrón **BFF (Backend-For-Frontend)** mediante sus **rutas de API de servidor** (`/api/...`). Las peticiones del usuario no viajan a n8n; viajan a una ruta interna de Next.js (`/api/consulta`, `/api/historicos`), la cual se ejecuta en el servidor, inyecta las credenciales privadas y llama de forma segura a n8n. El cliente jamás conoce la URL ni las llaves del orquestador.
- **Node.js (El motor del servidor):**  
  Entorno de ejecución (runtime V8) en el servidor que corre el proceso de Next.js en modo `standalone`, resolviendo las peticiones HTTP y ejecutando el código server-side.

### Flujo de comunicación seguro
$$\text{Navegador (React)} \xrightarrow{\text{Petición local}} \text{Next.js API Route (Node.js Server)} \xrightarrow{\text{Red privada}} \text{Webhook n8n (http://n8n:5678/...)}$$

Las credenciales, hostnames y variables de entorno (`N8N_INTERNAL_URL`) se custodian en el servidor Node.js y nunca se compilan con el prefijo `NEXT_PUBLIC_*`.

## Consecuencias

**Beneficios:**

- **Blindaje de credenciales (Zero Exposure):** Las URLs de webhooks y tokens de servicios internos permanecen exclusivamente en el servidor, cumpliendo la política de seguridad perimetral de la arquitectura.
- **Eliminación de backends adicionales:** Next.js asume el rol de API Gateway ligero y proxy sin requerir un servidor Express/FastAPI separado para intermediar peticiones.
- **Experiencia de usuario fluida:** React gestiona la reactividad en el cliente mientras Next.js resuelve la entrega de datos y activos estáticos de manera optimizada.

**Riesgos:**

- **Responsabilidad de seguridad en API Routes:** Las rutas de API de Next.js deben programarse con el mismo rigor de validación y control de errores que un backend convencional; una fuga de excepciones en un endpoint podría filtrar detalles de la infraestructura interna.
- **Sobrecarga de computación server-side:** Lógica pesada de transformación de datos indebidamente colocada en las rutas de API de Next.js podría competir por los recursos de Node.js.

**Mitigación:**

- Las rutas de API se mantienen estrictamente como adaptadores delegados delgados: validan la entrada básica, ejecutan el reenvío a n8n y retornan la respuesta normalizada.
- Las variables de entorno de infraestructura se validan en tiempo de construcción y se prohíbe el uso de prefijos públicos para datos sensibles.
- El Arquitecto inspecciona las rutas de API en cada PR para asegurar que no se expongan stacktraces ni variables de entorno en las respuestas HTTP de error.
