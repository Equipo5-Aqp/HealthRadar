# Manual de Backups y Restore — HU-303

Script: `infrastructure/scripts-poc-arquitectura/backup_healthradar.sh`
Frecuencia: **viernes 20:00 (America/Lima)** vía cron del host.
Retención: **2 copias** por tipo (`pg_*.dump.gz` + `n8n-workflows_*.tar.gz`); la 3.ª elimina la más antigua.
Destino: `/home/azureuser/backups/healthradar/` (fuera del repo: sobrevive al `git reset --hard` del deploy).
RAM adicional: **0 MB** (solo `docker exec` efímeros; sin contenedores ni puertos nuevos, ADR-008).

## 1. Instalación del cron (una vez, por SSH en la VM)

```bash
crontab -e
```

Agregar estas dos líneas:

```cron
TZ=America/Lima
0 20 * * 5 /home/azureuser/HealthRadar/infrastructure/scripts-poc-arquitectura/backup_healthradar.sh >> /home/azureuser/backups/healthradar/backup.log 2>&1
```

Verificar:

```bash
crontab -l
chmod +x /home/azureuser/HealthRadar/infrastructure/scripts-poc-arquitectura/backup_healthradar.sh
```

> El prefijo `TZ=America/Lima` es obligatorio: la VM está en `Central US` (ADR-011)
> y su reloj puede estar en UTC. Sin él, el backup caería en otro horario.

## 2. Corrida manual (primera vez / prueba)

```bash
/home/azureuser/HealthRadar/infrastructure/scripts-poc-arquitectura/backup_healthradar.sh
ls -lh /home/azureuser/backups/healthradar/
sha256sum -c /home/azureuser/backups/healthradar/pg_*.sha256
```

Probar la rotación: correr 3 veces en semanas distintas (o con `STAMP` distinto) y
comprobar que solo quedan 2 copias por tipo.

## 3. Restore de PostgreSQL (datos + n8n, misma BD)

```bash
# Copiar el dump al contenedor y restaurar (pg_restore --clean sobre la misma BD)
docker cp /home/azureuser/backups/healthradar/pg_2026-W42.dump.gz healthradar-postgres:/tmp/restore.dump.gz
docker exec healthradar-postgres sh -c 'gunzip -c /tmp/restore.dump.gz | pg_restore --clean -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker exec healthradar-postgres rm -f /tmp/restore.dump.gz
docker compose -f /home/azureuser/HealthRadar/infrastructure/docker-compose.yml restart n8n
```

## 4. Restore selectivo de un flujo n8n (sin tocar la BD)

```bash
tar -xzf /home/azureuser/backups/healthradar/n8n-workflows_2026-W42.tar.gz -C /tmp/n8n-restore
docker exec healthradar-n8n mkdir -p /tmp/n8n-restore
docker cp /tmp/n8n-restore/. healthradar-n8n:/tmp/n8n-restore/
docker exec healthradar-n8n n8n import:workflow --separate --input=/tmp/n8n-restore/
docker exec healthradar-n8n sh -c 'rm -rf /tmp/n8n-restore'
# Activar el flujo desde la UI de n8n o vía API (ver .github/workflows/n8n-deploy-cd.yml).
```

## 5. Advertencias

- **Conservar `N8N_ENCRYPTION_KEY` aparte** (fuera de la VM, p. ej. gestor de claves).
  Las credenciales de n8n viajan cifradas en el dump; sin la misma key son
  irrecuperables aunque el restore salga bien.
- No exportar credenciales n8n en claro (`n8n export:credentials`): prohibido,
  expondría secretos en disco.
- Si el `df` muestra < 1 GB libre, el script aborta sin dejar medias copias:
  liberar disco antes de reintentar.
