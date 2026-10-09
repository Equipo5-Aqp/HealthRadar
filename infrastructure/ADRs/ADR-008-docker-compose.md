# ADR-008: Adopción de Docker Compose como estrategia de despliegue self-hosted

**Estado:** Aceptado (2026-08-18)  
**Relacionado con:** ADR-001, ADR-004, ADR-010, ADR-011, ADR-013

## Contexto

HealthRadar requiere desplegar un conjunto heterogéneo de componentes que cooperan de forma coordinada: base de datos relacional y vectorial, orquestador de flujos, plataforma de observabilidad de LLMs, proxy inverso perimetral y múltiples zonas de microfrontend.

Dejar la estrategia de despliegue abierta o dispersa genera riesgos críticos:

- **Dispersión en servicios gestionados independientes (SaaS):** Desplegar el frontend en Vercel, la base en Supabase y n8n en n8n Cloud destruiría la premisa obligatoria de _Self-Hosted_ y soberanía de datos (ADR-001), multiplicaría la latencia de red y expondría webhooks internos a internet público, vulnerando la seguridad perimetral de ADR-004.
- **Sobrecarga de Kubernetes:** Introducir un clúster k8s (control plane, ingress controllers, almacenamiento distribuido) requeriría recursos de cómputo inalcanzables dentro del presupuesto de una máquina virtual de recursos acotados (4 GB de RAM en Azure, ADR-011).

Se requiere una solución de orquestación de contenedores unificada, ligera, versionable en Git y capaz de operar de forma determinista en un único host virtual.

## Decisión

Se adopta **Docker Compose** como la **única estrategia de despliegue self-hosted** para HealthRadar, gestionado mediante un archivo centralizado [`infrastructure/docker-compose.yml`]

### Topología de los 7 Servicios del Stack

El archivo orquesta exactamente **siete contenedores**, aislados en la red interna bridge **`healthradar-net`** (`172.20.0.0/16`) con asignación de IP estática:

| Servicio           | Contenedor                  | IP Fija      | `mem_limit`  | Exposición de Puertos      | Propósito                                                       |
| ------------------ | --------------------------- | ------------ | ------------ | -------------------------- | --------------------------------------------------------------- |
| **postgres**       | `healthradar-postgres`      | `172.20.0.4` | `768m`       | Interno (5432)             | BD relacional + pgvector (ADR-002)                              |
| **n8n**            | `healthradar-n8n`           | `172.20.0.3` | `1536m`      | Interno (5678)             | Orquestador con `@healthradar/core` embebido (ADR-001, ADR-012) |
| **phoenix**        | `healthradar-phoenix`       | `172.20.0.5` | `512m`       | Interno (6006, 4317, 4318) | Observabilidad LLM (ADR-010)                                    |
| **nginx-shell**    | `healthradar-nginx-shell`   | `172.20.0.2` | `64m`        | **`3000:3000` (Público)**  | Shell Router perimetral y reverse proxy (ADR-013)               |
| **mf-dashboard**   | `healthradar-mf-dashboard`  | `172.20.0.8` | `192m`       | Interno (3000)             | MF-1: Landing page y Panorama en `/` (ADR-013)                  |
| **mf-consulta**    | `healthradar-mf-consulta`   | `172.20.0.6` | `192m`       | Interno (3000)             | MF-2: Chat NLQ asistencial en `/consulta` (ADR-004, ADR-013)    |
| **mf-historicos**  | `healthradar-mf-historicos` | `172.20.0.7` | `192m`       | Interno (3000)             | MF-3: Tabla y Mapa de calor en `/historicos` (ADR-013)          |
| **Total Asignado** | —                           | —            | **3,456 MB** | —                          | **84.4 % de la RAM de la VM (4,096 MB)**                        |

### Reglas de Implementación y Seguridad

1. **Aislamiento perimetral estricto (ADR-004):** Únicamente `nginx-shell` mapea puertos hacia el host exterior (`3000:3000`). Los demás 6 contenedores permanecen inaccesibles desde internet y solo se comunican entre sí a través de la red privada `healthradar-net`.
2. **Inyección de credenciales seguras:** Ninguna contraseña, llave de API de LLM ni clave criptográfica se escribe en `docker-compose.yml`. Todas se inyectan en tiempo de ejecución desde `infrastructure/.env` (versionando únicamente `.env.example`).
3. **Persistencia de estado:** Se configuran tres volúmenes nombrados gestionados por Docker para sobrevivir a recreaciones de contenedores: `postgres_data`, `n8n_data` y `phoenix_data`.
4. **Resiliencia y arranque ordenado:** Todos los servicios configuran `restart: unless-stopped`. Se implementan `healthcheck` específicos en cada contenedor y directivas `depends_on: { condition: service_healthy }` para asegurar que n8n espere a Postgres, y Nginx espere a que los microfrontends estén saludables antes de admitir tráfico.
5. **Rotación obligatoria de logs en disco:** Cada servicio restringe su salida mediante el driver `json-file` con `max-size: "10m"` y `max-file: "3"`, acotando el crecimiento de logs a un máximo de 30 MB por servicio para proteger el almacenamiento del servidor.

## Consecuencias

**Beneficios:**

- **Reproducibilidad determinista:** El stack completo se inicializa y destruye con comandos estándar (`docker compose up -d`), permitiendo idéntico comportamiento en entornos locales y en la VM de Azure.
- **Cumplimiento estricto de memoria:** El techo de 3,456 MB asegura un margen libre de **640 MB (15.6%)** reservado para el kernel de Linux, SSH daemon y Docker runtime.
- **Seguridad perimetral simplificada:** Al cerrar los puertos de Postgres, n8n y Phoenix hacia el exterior, se reduce a cero la superficie de ataque sobre los motores de base de datos y orquestación.

**Riesgos:**

- **Host único como punto único de fallo (SPOF):** La caída de la máquina virtual anfitriona detiene la totalidad del ecosistema.
- **Sobrecarga de RAM durante compilaciones paralelas:** Si el proceso de despliegue compila múltiples microfrontends Next.js en paralelo (`docker compose up -d --build`), la demanda momentánea de RAM puede superar los 4 GB de la VM y disparar el OOM Killer.

**Mitigación:**

- **Compilación secuencial en CD (`deploy.yml`):** El pipeline de despliegue compila las imágenes de los microfrontends una a una (`docker compose build mf-consulta`, `build mf-historicos`, `build mf-dashboard`) antes de invocar `docker compose up -d`.
- **Configuración de memoria Swap en el host:** La máquina virtual dispone de un archivo swap de respaldo (2 a 4 GB) para absorber picos temporales del compilador y el daemon de Docker.
- **Monitoreo post-despliegue:** Se verifica la estabilidad del consumo de memoria en reposo mediante `docker stats --no-stream`.
