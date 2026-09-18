# BACKUP.md — Strapi DB + Cloudinary inventory

## Por qué existe este sistema

El 2026-09-15 descubrimos que la DB de Strapi tenía las tablas `products` y `categories` vacías (115 watches y 4 categorías que estaban ahí se habían perdido tras un restart de Strapi). Las imágenes en Cloudinary estaban a salvo, pero el contenido en la DB no tenía backup. Este sistema te protege de que vuelva a pasar.

## Qué se respalda

| Componente | Qué incluye | Tamaño típico |
|---|---|---|
| `strapi-db-dump.sql` | pg_dump completo (schema + data) | ~667 KB |
| `{table}-rows.json` | JSON por tabla no-vacía (files, products, categories, order_status_histories, etc.) | ~600 KB total |
| `cloudinary-inventory.json` | 621 imágenes con `public_id`, `secure_url`, dimensiones, formato | ~383 KB |
| `SUMMARY.txt` | Conteos (products, categories, files) al momento del backup | ~150 B |

Total típico: **~1.5 MB por backup**.

## Dónde se guarda

```
backend/backups/
├── YYYY-MM-DD/             ← backups automáticos (cron/systemd)
│   ├── strapi-db-dump.sql
│   ├── {table}-rows.json (×N)
│   ├── cloudinary-inventory.json
│   └── SUMMARY.txt
├── manual-YYYY-MM-DD-HHMM/ ← backups manuales (los que vos corrés después de re-entrar productos)
└── 2026-09-15-pre-recovery/ ← el snapshot de emergencia del incidente
```

## Cómo usar

### Backup manual (lo que pediste)

Después de re-entrar productos en Strapi admin:

```bash
cd /home/adreidev/dev/personal-projects/e-commerce-relojes-bv-beni-api
./scripts/backup-db.sh --manual
```

Genera `backups/manual-2026-09-15-HHMM/` con todo el estado actual.

### Backup automático (safety net mientras re-entrás)

```bash
cd /home/adreidev/dev/personal-projects/e-commerce-relojes-bv-beni-api
./scripts/backup-db.sh
```

Genera `backups/YYYY-MM-DD/` (sobrescribe si ya existe para hoy). Útil para correrlo en cualquier momento.

### Verificar un backup

```bash
# Ver resumen
cat backups/manual-2026-09-15-1637/SUMMARY.txt

# Listar contenido
ls backups/manual-2026-09-15-1637/

# Contar registros de productos/categorías
grep -E '"product":|"category":' backups/manual-*/products-rows.json | wc -l
```

### Restaurar un backup (si algo sale mal)

**⚠️ Restaurar SOBREESCRIBE toda la DB actual.** Hacer backup antes de restaurar.

```bash
# 1. Backup de seguridad del estado actual
./scripts/backup-db.sh --manual

# 2. Restaurar el backup deseado
docker exec -i relojes-bv-beni-db \
  psql -U strapi -d relojes_bv_beni_db \
  < backups/manual-2026-09-15-1637/strapi-db-dump.sql

# 3. Verificar
docker exec relojes-bv-beni-db \
  psql -U strapi -d relojes_bv_beni_db \
  -c "SELECT COUNT(*) FROM products; SELECT COUNT(*) FROM files;"
```

## Automatización (opcional pero recomendado)

`crontab` no está disponible en este sistema (Arch usa systemd). Opciones:

### Opción A — Systemd-timer (recomendado, requiere sudo)

Copiar los archivos unit:

```bash
sudo cp scripts/strapi-backup.service /etc/systemd/system/
sudo cp scripts/strapi-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now strapi-backup.timer
```

Dispara todos los días a las 03:00. Verificar con:

```bash
systemctl list-timers strapi-backup*
journalctl -u strapi-backup.service --since today
```

### Opción B — Manual cada vez que quieras

Cuando termines de re-entrar productos:

```bash
./scripts/backup-db.sh --manual
```

Esto es lo que pediste, suficiente si no te importa el riesgo de "olvidar" un backup.

## Retención

El script aplica rotación automática:
- **Daily dirs** (`YYYY-MM-DD/`): mantiene últimos **7**
- **Manual dirs** (`manual-*`): mantiene últimos **4**

Más viejos se borran automáticamente en cada corrida.

Si necesitás un backup a largo plazo (ej. fin de mes), mové el directorio manualmente a otra ubicación fuera de `backups/`.

## Logs

Los logs del script se acumulan en `/home/adreidev/.cache/strapi-backup.log`. Cada corrida agrega timestamped lines. Útil si algo falla.

```bash
tail -f /home/adreidev/.cache/strapi-backup.log
```

## Restore de un día específico

Los directorios están nombrados por fecha. Si necesitás volver al estado del 2026-09-20 por ejemplo:

```bash
# Listar backups disponibles
ls backend/backups/

# Restaurar el de esa fecha
docker exec -i relojes-bv-beni-db \
  psql -U strapi -d relojes_bv_beni_db \
  < backend/backups/2026-09-20/strapi-db-dump.sql
```

## Cuando re-entrés los 115 productos

Después de re-crear cada producto en Strapi admin (recomiendo usar las imágenes que ya están organizadas en Media Library), corré:

```bash
./scripts/backup-db.sh --manual
```

Esto crea un snapshot con timestamp de tu estado. Repetí al final del día de trabajo o cuando completes categorías. Cada snapshot queda con su nombre timestamped y se retiene 4 manuales.

## Open Spec / SDD

Este sistema se documenta como una decisión operativa, no como un SDD change (no es código que toca el runtime de la app). El aprendizaje del incidente está guardado en engram topic `incident/strapi-data-loss-2026-09-15`.
