# ADR-014: Autenticacion de Sesion con Nginx auth_request y Login Centralizado en mf-dashboard

**Estado:** Aceptado (2026-10-11)
**Relacionado con:** ADR-004, ADR-008, ADR-011, ADR-013
**Refina a:** ADR-004 (extiende la capa de seguridad BFF con proteccion perimetral de Nginx)

## Contexto

Con la adopcion de Microfrontends (ADR-013), el sistema quedo dividido en tres zonas autonomas (`mf-dashboard`, `mf-consulta`, `mf-historicos`). Esto introdujo el problema de donde y como proteger las rutas sin violar la gobernanza de aislamiento entre microfrontends (prohibido importar codigo entre zonas).

Se implemento un sistema de autenticacion completo (migracion `008_autenticacion_usuarios.sql`) con:
- Tablas `usuario`, `sesion` y `login_evento` en PostgreSQL.
- Tres webhooks de n8n: `auth-login`, `auth-sesion` y `auth-logout`.
- Funciones PL/pgSQL: `fn_usuario_autenticar`, `fn_sesion_crear`, `fn_sesion_validar`, `fn_sesion_revocar`, `fn_usuario_registrar_fallo`, `fn_usuario_registrar_exito`.
- Cookie de sesion `hr_sesion` (64 caracteres hex, almacenada como SHA-256 en PostgreSQL).

Quedaban pendientes las decisiones sobre:
1. Como proteger perimetralmente las rutas sin duplicar codigo de sesion en cada microfrontend.
2. TLS y el flag `Secure` de la cookie, dado que el despliegue actual sirve HTTP plano.
3. Deuda tecnica de infraestructura relacionada con CI de migraciones y politica de contrasenas.

## Decision

### 1. Proteccion Perimetral con nginx auth_request (Shell Router)

Se adopta el modulo `ngx_http_auth_request_module` (incluido en `nginx:1.27-alpine`) para centralizar la verificacion de sesion en el Shell Router (`healthradar-nginx-shell`), sin duplicar codigo en cada microfrontend:

- **Punto de verificacion global:** `auth_request /_auth;` a nivel de bloque `server` protege por defecto todo el sitio (`/`, `/consulta`, `/historicos`).
- **Subruta interna `/_auth`:** Delega a `http://mf_dashboard/api/auth/sesion` (GET) pasando la cookie `hr_sesion`. Responde `200` si la sesion es valida (permite el paso) o `401` si no lo es. Timeout de conexion a 3s y lectura a 10s.
- **Rutas publicas con `auth_request off;`**:
  - `/healthz` -- Endpoint de salud propio de Nginx (`return 200 "ok\n"`), utilizado por el healthcheck de Docker Compose.
  - `/login` y `/api/auth/` -- Pagina de login y endpoints de autenticacion de `mf-dashboard` (evita bucles de redireccion).
  - Rutas estaticas independientes por microfrontend: `/_next/static/` (`mf-dashboard`), `/consulta/_next/static/` (`mf-consulta`), `/historicos/_next/static/` (`mf-historicos`), y `/favicon.ico`.
- **Manejo diferenciado sin sesion (`@sin_sesion`):**
  - Peticiones a APIs (`if ($uri ~ "/api/")`): retornan `401` con payload JSON estructurado `{"error":true,"codigo":"SIN_SESION","mensaje":"Inicia sesion para continuar"}`.
  - Peticiones de navegacion (HTML): redirigen con `302 /login?next=$request_uri` preservando la ruta destino mediante `$request_uri` (previene inyeccion CRLF).
- **Cookie propagada por Nginx:** `proxy_set_header Cookie $http_cookie;` garantiza que el token `hr_sesion` llegue a `mf-dashboard` para que `fn_sesion_validar` lo procese.

### 2. TLS y Cookie Secure: Opcion B -- Riesgo Aceptado (HTTP con IP publica)

Se adopta la **Opcion B**:
- La cookie `hr_sesion` **no lleva el atributo `Secure`** (`AUTH_COOKIE_SECURE=false` por defecto).
- La razon es tecnica: el despliegue actual publica la aplicacion por HTTP plano (nginx escucha en `:3000`, `docker-compose` publica `3000:3000`). Un navegador descarta silenciosamente las cookies `Secure` cuando la pagina llega por HTTP, lo que haria el login completamente inoperativo.
- **Riesgo documentado:** Con HTTP, la cookie de sesion viaja en claro por la red. Este riesgo es aceptable unicamente para el contexto actual de la VM de Azure con IP publica sin dominio propio, como proyecto academico/demo.
- **Mitigacion presente:** La cookie tiene `HttpOnly` y `SameSite=Lax`, lo que previene accesos desde JavaScript y peticiones cross-site no intencionadas.
- **Condicion de actualizacion:** Cuando el equipo provisione un dominio propio y un certificado SSL (Let's Encrypt o similar), debera establecer `AUTH_COOKIE_SECURE=true` en el `.env` de Azure y habilitar `listen 443 ssl;` en nginx. En ese momento este ADR se actualiza a Opcion A.

### 3. Deuda Tecnica Registrada (Sprint 4 / Backlog de Seguridad)

| ID | Item | Estado |
|----|------|--------|
| M4 | CI de migraciones idempotentes: ejecutar `001-008` dos veces contra un PostgreSQL efimero en cada PR para validar que ninguna migracion rompa en re-aplicacion. | Pendiente |
| M5 | Rotacion / cambio de contrasena: la columna `debe_cambiar_password` existe en la BD pero no hay flujo ni politica de caducidad que la utilice. | Pendiente |
| M6 | Roles segregados en PostgreSQL: actualmente n8n y Phoenix comparten el `POSTGRES_USER` que tiene acceso al `password_hash`. Crear roles con permisos minimos es una migracion separada. | Pendiente |

## Implementacion

### nginx.conf (Shell Router — ADR-014)

El Shell Router (`infrastructure/nginx/nginx.conf`) implementa:
- `auth_request /_auth;` global en el bloque `server`.
- `location = /_auth` proxy a `http://mf_dashboard/api/auth/sesion`.
- `location @sin_sesion` discrimina entre endpoints `/api/` (retorna 401 JSON) y vistas navegables (redireccion 302 a `/login?next=$request_uri`).
- Rutas publicas (`auth_request off;`): `/healthz`, `/login`, `/api/auth/`, `/_next/static/`, `/consulta/_next/static/`, `/historicos/_next/static/`, `/favicon.ico`.
- Rutas protegidas: `/`, `/consulta`, `/historicos`.

### docker-compose.yml (Healthcheck — ADR-014)

- El healthcheck de `nginx-shell` prueba `http://127.0.0.1:3000/healthz` en lugar de la raiz `/` para evitar fallos por redireccion 302.

### Variables de entorno relevantes (ADR-014)

| Variable | Scope | Descripcion |
|----------|-------|-------------|
| `AUTH_COOKIE_SECURE` | `mf-dashboard` | `false` (Opcion B activa) o `true` cuando haya TLS |
| `AUTH_WEBHOOK_SECRET` | `n8n`, `mf-dashboard` | Secreto compartido para los webhooks de autenticacion |
| `AUTH_MAX_INTENTOS` | `n8n` | Maximo de intentos antes de bloqueo (defecto: 5) |
| `AUTH_BLOQUEO_MINUTOS` | `n8n` | Duracion del bloqueo en minutos (defecto: 15) |
| `AUTH_SESION_MINUTOS` | `n8n` | TTL de la sesion (defecto: 480 = 8 horas) |

## Consecuencias

**Beneficios:**
- **Sin duplicacion:** La verificacion de sesion vive exclusivamente en Nginx y en `mf-dashboard/api/auth/sesion`. Los microfrontends `mf-consulta` y `mf-historicos` nunca implementan logica de autenticacion propia.
- **Falla cerrado:** Si `mf-dashboard` no esta disponible, `/_auth` responde error y Nginx bloquea el acceso (comportamiento seguro por defecto).
- **Sin RAM extra:** El modulo `ngx_http_auth_request_module` esta incluido en `nginx:1.27-alpine`; no se agrega ningun contenedor nuevo al presupuesto de 3,456 MB (ADR-008, ADR-011).
- **Aislamiento preservado:** Los microfrontends se comunican con `mf-dashboard` a traves de HTTP sobre la red interna `healthradar-net`, no mediante imports directos de codigo (regla de gobernanza ADR-013).

**Riesgos:**
- Sin TLS, la cookie `hr_sesion` viaja en claro (Opcion B aceptada explicitamente en este ADR).
- `mf-dashboard` se convierte en un punto critico: si cae, toda la autenticacion falla (mitigado por `restart: unless-stopped` en Compose).

**Mitigacion activa:**
- Cookie con `HttpOnly` y `SameSite=Lax` como protecciones minimas en HTTP.
- `restart: unless-stopped` en todos los contenedores garantiza recuperacion automatica.
- Deuda M4-M6 registrada formalmente en este ADR para priorizacion en Sprint 4.
