#!/bin/sh
# Generates every random secret this app needs for one environment:
# AUTH_SECRET, AUTH_REFRESH_SECRET, the offline-sync ECDSA P-256 keypair,
# and a Postgres password. Previously these were five separate manual
# steps scattered across README.md and backend/.env.example comments —
# this is the same commands, just run for you and printed ready to
# paste. Doesn't touch any existing .env file; only prints values.
#
# Usage: sh deploy/generate-secrets.sh

set -eu

command -v openssl >/dev/null 2>&1 || {
  echo "openssl is required but not found. On Debian/Ubuntu: apt-get install -y openssl" >&2
  exit 1
}

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

openssl ecparam -name prime256v1 -genkey -noout -out "$tmp_dir/offline_private.pem"
openssl ec -in "$tmp_dir/offline_private.pem" -pubout -out "$tmp_dir/offline_public.pem" 2>/dev/null

AUTH_SECRET="$(openssl rand -hex 32)"
AUTH_REFRESH_SECRET="$(openssl rand -hex 32)"
POSTGRES_PASSWORD="$(openssl rand -hex 24)"
OFFLINE_SIGNING_PRIVATE_KEY_B64="$(base64 -w0 "$tmp_dir/offline_private.pem" 2>/dev/null || base64 "$tmp_dir/offline_private.pem")"
OFFLINE_SIGNING_PUBLIC_KEY_B64="$(base64 -w0 "$tmp_dir/offline_public.pem" 2>/dev/null || base64 "$tmp_dir/offline_public.pem")"

cat <<EOF
# Paste these into backend.env (production) or backend/.env (local dev).
# Each value is freshly generated and used nowhere else — do not reuse
# across environments, and do not commit this output anywhere.

AUTH_SECRET=${AUTH_SECRET}
AUTH_REFRESH_SECRET=${AUTH_REFRESH_SECRET}
OFFLINE_SIGNING_PRIVATE_KEY_B64=${OFFLINE_SIGNING_PRIVATE_KEY_B64}
OFFLINE_SIGNING_PUBLIC_KEY_B64=${OFFLINE_SIGNING_PUBLIC_KEY_B64}

# Paste this into the .env file next to docker-compose.prod.yml (it's
# read by the postgres/backend/backup services there, not by backend.env):
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
EOF
