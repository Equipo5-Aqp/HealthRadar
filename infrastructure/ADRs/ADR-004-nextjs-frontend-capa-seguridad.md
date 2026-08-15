# ADR-004: Uso de Next.js como framework Frontend con rutas de API como capa de seguridad

## Contexto

HealthRadar requiere un Frontend que muestre dashboards con mapas de
calor, alertas de brotes y un campo de consulta en lenguaje natural.
La arquitectura base establece que el Frontend no puede interactuar
directamente con APIs de IA ni con PostgreSQL. Sin embargo, si el
Frontend llama directamente al webhook de n8n desde el navegador, la
URL del webhook queda expuesta en el cliente, lo que representa un
riesgo de seguridad. Se necesita una solución que mantenga las
credenciales fuera del navegador sin agregar un servicio backend
adicional.

## Decisión

Se utilizará Next.js como framework Frontend. Las consultas NLQ del
analista no van directamente al webhook de n8n desde el navegador.
En su lugar, el Frontend llama a una ruta de API interna de Next.js
que corre en el servidor, y esa ruta es la que llama al webhook de
n8n con las credenciales correspondientes. El navegador nunca ve la
URL ni el token del webhook de n8n.

El flujo de comunicación es:
Navegador → /api/query (Next.js server-side) → Webhook n8n

Adicionalmente, Next.js permite Server Side Rendering para los reportes
recientes y Static Generation para componentes estáticos como el mapa
base de distritos del Perú, optimizando el rendimiento sin configuración
adicional.

## Consecuencias

**Beneficios:**

- Las credenciales del webhook de n8n permanecen en el servidor y nunca
  se exponen al navegador, cumpliendo la regla crítica de seguridad
  del proyecto.
- Se elimina la necesidad de un servicio backend adicional solo para
  actuar como proxy seguro.
- SSR y Static Generation mejoran el rendimiento del dashboard sin
  trabajo extra.

**Riesgos:**

- Las rutas de API de Next.js deben tratarse con el mismo criterio de
  seguridad que un backend tradicional. Un error en su implementación
  puede exponer indirectamente las credenciales de n8n.

**Mitigación:**

- Las URLs y tokens de webhooks de n8n se almacenan exclusivamente en
  variables de entorno del servidor, nunca en variables con prefijo
  NEXT_PUBLIC, ya que estas últimas se exponen al navegador.
- El Arquitecto revisa las rutas de API en cada PR antes de aprobar
  la fusión a main.
