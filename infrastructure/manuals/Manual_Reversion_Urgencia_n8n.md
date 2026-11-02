# Manual de reversión de workflows de n8n (normal y de urgencia)

**Historia:** S4-HU-08 · **Responsable:** Líder MLOps/DevSecOps · **Última prueba:** 2026-11-02

Este manual explica cómo devolver los workflows de n8n de producción a una versión anterior. Hay dos vías: la **de urgencia**, para restablecer el servicio en minutos, y la **normal**, que deja `main` corregido. En una emergencia se hacen las dos, en ese orden.

## 1. Cuándo usar cada vía

| | Reversión de urgencia | Reversión normal |
|---|---|---|
| Objetivo | Restablecer producción ya | Corregir `main` para que el problema no vuelva |
| Cómo | Volver a ejecutar n8n Deploy CD sobre un **tag anterior** que funcionaba | PR con `git revert`, aprobación del code owner, merge y **tag nuevo** |
| Necesita code owner | No (solo la aprobación del entorno `production`) | Sí (o su revisor suplente) |
| Tiempo medido | Job de 36 s a 1 min 12 s, más la espera de la aprobación | Varios minutos, más la espera de la revisión |
| Deja `main` corregido | **No** | Sí |

## 2. Requisitos y límites

- Solo funciona con tags **`v1.3.4` o posteriores**. Desde esa versión el CD despliega el commit exacto del tag y desactiva los workflows que no están en esa versión. Los tags anteriores tienen la versión vieja del CD, que desplegaba `origin/main`.
- Quien ejecuta debe poder aprobar el entorno `production`.
- **No revierte la base de datos.** Si el cambio incluyó una migración, la reversión de workflows no la deshace.
- Los workflows del tag anterior quedan activos y los que no existían en ese tag quedan **desactivados** (no borrados).
- Mientras `main` no se corrija, el siguiente tag volverá a desplegar el cambio defectuoso.

## 3. Reversión de urgencia

1. Identificar el último tag que funcionaba: en GitHub, **Releases**, o con `git tag --sort=-v:refname`.
2. En **Actions**, entrar a **n8n Deploy CD** y elegir una de estas opciones:
   - **Re-run (más rápido):** abrir el run de ese tag y pulsar **Re-run all jobs**. GitHub permite volver a ejecutar un run durante 30 días desde que se creó.
   - **Run workflow:** pulsar **Run workflow**, en **Use workflow from** cambiar a la pestaña **Tags** y elegir el tag.
3. Pulsar **Review deployments**, marcar `production` y **Approve and deploy**.
4. Revisar el paso **Publicar y activar workflows vía API de n8n**: cada workflow con `✅ Publicado`, los retirados con `⏸️ Desactivado`, y `✅ Todos los flujos procesados`.
5. Verificar en la VM:
   ```bash
   docker ps --format "table {{.Names}}\t{{.Status}}"
   docker exec -i healthradar-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
   select name, active, "updatedAt" from workflow_entity order by name;
   SQL
   ```
   Los siete contenedores deben estar `healthy` y el estado de los workflows debe coincidir con el tag desplegado. (Al pegar, la línea final `SQL` debe quedar sin espacios al inicio.)
6. Avisar al equipo y continuar con la reversión normal.

## 4. Reversión normal

1. Crear una rama desde `main` y revertir el commit de fusión del PR defectuoso:
   ```powershell
   git fetch origin
   git switch -c revert-<tema> origin/main
   git revert -m 1 --no-commit <commit-de-fusión>
   git diff --cached --stat
   ```
   (`-m 1` solo si el PR se fusionó con merge commit.)
2. Confirmar, subir y abrir el PR. Lo aprueba el code owner del área o, si no está disponible, su **revisor suplente** (sección 5).
3. Tras el merge, crear un **tag nuevo** (nunca reutilizar uno existente) sobre `main` y aprobar el despliegue.

## 5. Revisor suplente

Según `.github/CODEOWNERS`, el dueño de `/src/n8n-workflows/` es `@Andy-2214`. Revisor suplente acordado: **[Completar tras acordarlo con el Arquitecto]**.

## 6. Prueba realizada (2026-11-02)

| Paso | Run | Resultado |
|---|---|---|
| Revertir a `v1.3.4` (Re-run del run #34) | job 36 s | 9 workflows publicados; `S4Hu03PruebaRtro` vuelve a `active = t` |
| Volver a `v1.3.5` (Re-run del run #35) | job 1 min 12 s | `⏸️ Desactivado (retirado del repositorio): S4Hu03PruebaRtro`; `active = f` |
