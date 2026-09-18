#!/usr/bin/env bash
# =============================================================================
# backup-db.sh — Strapi DB + Cloudinary inventory snapshot
# =============================================================================
# Runs pg_dump against the Docker postgres container + JSON exports of the
# critical content tables + Cloudinary Admin API inventory.
#
# Usage:
#   ./scripts/backup-db.sh                 # auto-named timestamped dir under backups/
#   ./scripts/backup-db.sh --manual       # same, but uses YYYY-MM-DD-HHMM (for after-edits)
#   ./scripts/backup-db.sh --target DIR   # explicit output dir
#
# Retention (applied on each run): keep last 7 daily, last 4 weekly.
# Restore example:
#   docker exec -i relojes-bv-beni-db psql -U strapi -d relojes_bv_beni_db < backups/2026-09-15/strapi-db-dump.sql
#
# Cron (see BACKUP.md):
#   0 3 * * * /home/adreidev/dev/personal-projects/e-commerce-relojes-bv-beni-api/scripts/backup-db.sh >> /home/adreidev/.cache/strapi-backup.log 2>&1
#
# Requires:
#   - docker container `relojes-bv-beni-db` running
#   - CLOUDINARY credentials in /home/adreidev/dev/personal-projects/e-commerce-relojes-bv-beni-api/.env
#   - python3, curl, jq (optional for verification)
# =============================================================================

set -euo pipefail

# ---------- config ----------
DB_CONTAINER="${DB_CONTAINER:-relojes-bv-beni-db}"
DB_USER="${DB_USER:-strapi}"
DB_NAME="${DB_NAME:-relojes_bv_beni_db}"
BACKEND_DIR="${BACKEND_DIR:-/home/adreidev/dev/personal-projects/e-commerce-relojes-bv-beni-api}"
BACKUP_ROOT="${BACKUP_ROOT:-${BACKEND_DIR}/backups}"
CLOUDINARY_ENV="${CLOUDINARY_ENV:-${BACKEND_DIR}/.env}"
KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_WEEKLY="${KEEP_WEEKLY:-4}"
LOG="${LOG:-/home/adreidev/.cache/strapi-backup.log}"

# ---------- arg parsing ----------
MANUAL=false
TARGET_DIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --manual)    MANUAL=true; shift ;;
    --target)    TARGET_DIR="$2"; shift 2 ;;
    --help|-h)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

# ---------- helpers ----------
log() {
  local msg="[$(date -Iseconds)] $*"
  echo "$msg" >&2
  echo "$msg" >> "$LOG" 2>/dev/null || true
}

die() {
  log "ERROR: $*"
  exit 1
}

# ---------- name ----------
if [[ -n "$TARGET_DIR" ]]; then
  OUT="$TARGET_DIR"
elif $MANUAL; then
  OUT="${BACKUP_ROOT}/manual-$(date +%Y-%m-%d-%H%M)"
else
  OUT="${BACKUP_ROOT}/$(date +%Y-%m-%d)"
fi

mkdir -p "$OUT"
log "Backup starting → $OUT"

# ---------- preconditions ----------
command -v docker >/dev/null || die "docker not in PATH"
docker inspect "$DB_CONTAINER" >/dev/null 2>&1 || die "container $DB_CONTAINER not running"
[[ -f "$CLOUDINARY_ENV" ]] || die "Cloudinary env not found at $CLOUDINARY_ENV"

# ---------- 1. pg_dump (full schema + data) ----------
log "  [1/3] pg_dump..."
docker exec "$DB_CONTAINER" \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner > "$OUT/strapi-db-dump.sql" 2>>"$LOG" \
  || die "pg_dump failed"
DUMP_SIZE=$(stat -c%s "$OUT/strapi-db-dump.sql")
log "    → strapi-db-dump.sql ($((DUMP_SIZE / 1024)) KB)"

# ---------- 2. JSON per-table (only non-empty) ----------
log "  [2/3] JSON per-table exports..."
TABLES=(files products categories products_category_lnk files_related_mph
        up_users admin_users orders order_status_histories shipments
        admin_permissions up_permissions up_roles upload_folders strapi_migrations)
JSON_COUNT=0
for tbl in "${TABLES[@]}"; do
  COUNT=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -A \
    -c "SELECT COUNT(*) FROM $tbl;" 2>/dev/null || echo "0")
  if [[ "$COUNT" -gt 0 ]] 2>/dev/null; then
    docker exec "$DB_CONTAINER" \
      psql -U "$DB_USER" -d "$DB_NAME" -c "\\COPY (SELECT row_to_json(t) FROM $tbl t) TO '/tmp/$tbl.json'" \
      >/dev/null 2>&1
    docker cp "$DB_CONTAINER:/tmp/$tbl.json" "$OUT/${tbl}-rows.json" >/dev/null 2>&1
    log "    → ${tbl}-rows.json ($COUNT rows)"
    JSON_COUNT=$((JSON_COUNT + 1))
  fi
done
log "    exported $JSON_COUNT non-empty tables"

# ---------- 3. Cloudinary inventory ----------
log "  [3/3] Cloudinary inventory..."
# Source credentials
CLOUD_NAME=$(grep -E '^CLOUDINARY_NAME=' "$CLOUDINARY_ENV" | cut -d= -f2 | tr -d '\r')
CLOUD_KEY=$(grep -E '^CLOUDINARY_KEY=' "$CLOUDINARY_ENV" | cut -d= -f2 | tr -d '\r')
CLOUD_SECRET=$(grep -E '^CLOUDINARY_SECRET=' "$CLOUDINARY_ENV" | cut -d= -f2 | tr -d '\r')

if [[ -n "$CLOUD_NAME" && -n "$CLOUD_KEY" && -n "$CLOUD_SECRET" ]]; then
  python3 << EOF
import subprocess, json, os, sys
auth = "$CLOUD_KEY:$CLOUD_SECRET"
cloud = "$CLOUD_NAME"
all_resources, cursor, pages = [], "", 0
while True:
    pages += 1
    url = f"https://api.cloudinary.com/v1_1/{cloud}/resources/image?max_results=500"
    if cursor: url += f"&next_cursor={cursor}"
    r = subprocess.run(["curl","-s","-u",auth,url], capture_output=True, text=True, timeout=60)
    try: data = json.loads(r.stdout)
    except: break
    all_resources.extend(data.get("resources", []))
    cursor = data.get("next_cursor", "")
    if not cursor or pages > 30: break
out = "$OUT/cloudinary-inventory.json"
with open(out, "w") as f:
    json.dump({"total": len(all_resources), "pages": pages, "cloud": cloud,
              "snapshot_at": __import__("datetime").datetime.now().isoformat(),
              "resources": all_resources}, f, indent=2)
print(f"Cloudinary: {len(all_resources)} resources across {pages} pages → {out}", file=sys.stderr)
EOF
  if [[ -f "$OUT/cloudinary-inventory.json" ]]; then
    CL_SIZE=$(stat -c%s "$OUT/cloudinary-inventory.json")
    log "    → cloudinary-inventory.json ($((CL_SIZE / 1024)) KB)"
  fi
else
  log "    → skipped (cloudinary creds missing)"
fi

# ---------- 4. summary ----------
PRODUCTS=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -A \
  -c "SELECT COUNT(*) FROM products;" 2>/dev/null || echo "ERR")
CATEGORIES=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -A \
  -c "SELECT COUNT(*) FROM categories;" 2>/dev/null || echo "ERR")
FILES=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -A \
  -c "SELECT COUNT(*) FROM files;" 2>/dev/null || echo "ERR")

cat > "$OUT/SUMMARY.txt" << EOF
Backup created: $(date -Iseconds)
Strapi DB: $DB_NAME on container $DB_CONTAINER
products:   $PRODUCTS
categories: $CATEGORIES
files:       $FILES
EOF

log "Backup DONE → $OUT (products=$PRODUCTS categories=$CATEGORIES files=$FILES)"

# ---------- 5. retention ----------
log "  retention: keep last $KEEP_DAILY daily + $KEEP_WEEKLY weekly"
# Daily dirs: YYYY-MM-DD format
DAILY_DIRS=$(find "$BACKUP_ROOT" -maxdepth 1 -type d -name '????-??-??' | sort -r)
COUNT=0
for d in $DAILY_DIRS; do
  COUNT=$((COUNT + 1))
  if [[ $COUNT -gt $KEEP_DAILY ]]; then
    rm -rf "$d"
    log "    removed (daily): $d"
  fi
done
# Manual dirs: manual-YYYY-MM-DD-HHMM
MANUAL_DIRS=$(find "$BACKUP_ROOT" -maxdepth 1 -type d -name 'manual-*' | sort -r)
COUNT=0
for d in $MANUAL_DIRS; do
  COUNT=$((COUNT + 1))
  if [[ $COUNT -gt $KEEP_WEEKLY ]]; then
    rm -rf "$d"
    log "    removed (manual): $d"
  fi
done

log "Backup script complete."
echo "$OUT"  # final output: the path to this backup
