#!/usr/bin/env bash
# One-shot local dev bootstrap.
#   ./dev-up.sh
#
# Starts Postgres (on port 5433, see docker-compose.yml), waits until it's
# actually ready to accept connections, then runs Prisma migrations.
# Backend and frontend are left for you to start in their own terminals
# (they need live reload, so they shouldn't be backgrounded here).
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Starting Postgres (host port 5433)..."
docker compose up -d postgres

echo "==> Waiting for Postgres to be healthy..."
until [ "$(docker compose ps -q postgres | xargs docker inspect -f '{{.State.Health.Status}}')" = "healthy" ]; do
  sleep 1
  printf '.'
done
echo " ready."

if [ ! -f backend/.env ]; then
  echo "==> backend/.env not found, copying from .env.example"
  cp backend/.env.example backend/.env
  echo "    NOTE: fill in AUTH_SECRET / AUTH_REFRESH_SECRET / offline signing keys before using this for real."
fi

echo "==> Running Prisma migrations..."
(cd backend && npm run prisma:migrate)

cat <<'EOF'

Postgres is up and migrated. Now in two separate terminals:

  cd backend  && npm run start:dev   # http://localhost:4000/api
  cd frontend && npm run dev         # http://localhost:3000

To stop Postgres later: docker compose down
To wipe the database and start clean: docker compose down -v
EOF
