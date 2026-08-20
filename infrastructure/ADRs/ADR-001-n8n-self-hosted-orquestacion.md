# ADR-001: Uso de n8n Self-Hosted como capa de orquestación

## Contexto

HealthRadar requiere automatizar la descarga semanal de reportes epidemiológicos desde fuentes externas como MINSA y Open-Meteo, coordinar el procesamiento de esos datos con modelos de IA, y responder consultas en lenguaje natural de analistas de salud pública. Todo esto implica múltiples integraciones con APIs externas, lógica de flujo condicional, y ejecución programada sin intervención humana. Construir esta orquestación manualmente en código aumentaría la complejidad de mantenimiento y dificultaría la trazabilidad de los flujos de datos.

## Decisión

Se utilizará n8n Self-Hosted como única capa de orquestación del sistema. Todos los flujos de datos pasan obligatoriamente por n8n, incluyendo la ingesta de datos externos, la comunicación con los modelos de IA, las consultas a PostgreSQL, y la entrega de resultados al Frontend. Ningún componente del sistema interactúa directamente con otro sin pasar por esta capa. Se definen dos workflows principales y separados:

- **Workflow de ingesta:** ejecución semanal automática mediante Schedule
  Trigger. Descarga reportes, invoca a Gemini para la extracción y escribe en PostgreSQL.
- **Workflow de consulta NLQ:** activado por webhook desde Next.js.
  Consulta PostgreSQL, invoca a Claude y devuelve el reporte al Frontend.

## Consecuencias

**Beneficios:**

- Centralización de toda la lógica de integración en un único punto auditable y modificable sin tocar código de aplicación.
- Los workflows son exportables como JSON, lo que facilita el control de versiones y la revisión arquitectónica.
- Reducción del acoplamiento entre componentes: cambiar un proveedor de IA implica modificar un nodo en n8n, no refactorizar código.

**Riesgos:**

- Si n8n cae, todo el sistema deja de funcionar. Es el único punto de falla crítico de la arquitectura.
- Los workflows en JSON deben seguir la nomenclatura del proyecto para ser auditables.

**Mitigación:**

- Desplegar n8n con Docker para facilitar recuperación ante fallos.
- Versionar todos los JSONs de workflows en el repositorio.
- Monitorear disponibilidad de n8n con Phoenix.
