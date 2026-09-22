#!/bin/sh
# Nightly logical backup of the estate Postgres database.
#
# CLAUDE.md §11 lists "automated DB backups" as in-scope V1 infrastructure,
# but docker-compose.yml only ever had health-checked services — no backup
# job actually existed. This is deliberately the simplest thing that
# actually satisfies that requirement for a single-estate deployment:
# no new image dependency (reuses the same postgres:16-alpine image already
# pulled for the `postgres` service), no external backup service/SaaS, just
# pg_dump on a loop with retention cleanup. If/when this becomes a genuine
# multi-instance or off-site-backup requirement, that's a real infra
# decision to make deliberately later — not a reason to reach for more
# than this today (same reasoning CLAUDE.md already applies to Redis, §4).
#
# Runs forever inside its own container: dump, sleep for BACKUP_INTERVAL_
# SECONDS, repeat. Also prunes dumps older than BACKUP_RETENTION_DAYS on
# every cycle so the mounted volume doesn't grow unbounded.

set -eu

: "${PGHOST:=postgres}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=estate_visitor}"
: "${BACKUP_DIR:=/backups}"
: "${BACKUP_INTERVAL_SECONDS:=86400}"   # default: once every 24h
: "${BACKUP_RETENTION_DAYS:=14}"

mkdir -p "$BACKUP_DIR"

echo "[db-backup] starting. interval=${BACKUP_INTERVAL_SECONDS}s retention=${BACKUP_RETENTION_DAYS}d dir=${BACKUP_DIR}"

while true; do
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  dest="${BACKUP_DIR}/${PGDATABASE}_${timestamp}.sql.gz"
  tmp="${dest}.tmp"

  echo "[db-backup] $(date -u +%FT%TZ) dumping ${PGDATABASE} -> ${dest}"
  if pg_dump --format=plain --no-owner --no-privileges | gzip > "$tmp"; then
    mv "$tmp" "$dest"
    echo "[db-backup] wrote $(du -h "$dest" | cut -f1) to ${dest}"
  else
    echo "[db-backup] pg_dump FAILED — leaving previous backups untouched" >&2
    rm -f "$tmp"
  fi

  # Prune anything older than the retention window. Never lets pruning
  # remove the backup we just took, even if retention is set to 0.
  find "$BACKUP_DIR" -name "${PGDATABASE}_*.sql.gz" -mtime +"$BACKUP_RETENTION_DAYS" -not -name "$(basename "$dest")" -delete

  sleep "$BACKUP_INTERVAL_SECONDS"
done
