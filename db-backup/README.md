# Database backups

`backup.sh` runs inside the `backup` service defined in `docker-compose.yml`.
It's a plain `pg_dump` loop — no external backup product, no new image
(reuses `postgres:16-alpine`, already pulled for the `postgres` service
itself). This exists because CLAUDE.md §11 documents "automated DB backups"
as in-scope V1 infrastructure; before this, the compose file only had
health-checked services and nothing was actually being backed up.

## What it does

Every `BACKUP_INTERVAL_SECONDS` (default: 24h), it runs `pg_dump` against
the `postgres` service, gzips the output, and writes it to the
`postgres_backups` volume as `estate_visitor_<UTC timestamp>.sql.gz`. Dumps
older than `BACKUP_RETENTION_DAYS` (default: 14) are pruned on every cycle.

## Restoring a backup

```sh
# 1. Find the backup you want inside the named volume:
docker compose run --rm backup sh -c 'ls -la /backups'

# 2. Restore it into a running postgres service (this OVERWRITES existing
#    data in the target database — take a fresh backup first if unsure):
docker compose exec -T postgres sh -c \
  'gunzip -c /backups/estate_visitor_<TIMESTAMP>.sql.gz | psql -U postgres -d estate_visitor'
```

For anything beyond a single-estate deployment (§2) — point-in-time
recovery, off-site/replicated backups, multi-instance coordination — that's
a deliberate infrastructure decision to make later, not something to bolt
on speculatively now (same reasoning CLAUDE.md already applies to Redis).
