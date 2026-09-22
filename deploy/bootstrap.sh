#!/bin/sh
# Run ONCE on a fresh Ubuntu 22.04/24.04 VPS, as root (or via sudo), to
# prepare it to receive automated deploys from .github/workflows/ci.yml.
# Idempotent — safe to re-run if a step fails partway through.
#
# Usage: curl -fsSL <raw-github-url-to-this-file> | sh
#    or: scp this file over and run it directly.
#
# What it does NOT do: generate secrets (see generate-secrets.sh), open a
# domain's DNS record at your registrar, or do the first `docker compose
# up` (see DEPLOYMENT.md step 5 — that needs backend.env/frontend.env/.env
# filled in first, which is a manual, one-time judgment call this script
# shouldn't make for you).

set -eu

DEPLOY_USER="${DEPLOY_USER:-deploy}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/entryva}"

echo "==> Installing Docker Engine + Compose plugin"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
else
  echo "    already installed, skipping"
fi

echo "==> Creating deploy user '${DEPLOY_USER}' (if it doesn't exist)"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"

echo "==> Setting up SSH access for GitHub Actions"
mkdir -p "/home/${DEPLOY_USER}/.ssh"
touch "/home/${DEPLOY_USER}/.ssh/authorized_keys"
chmod 700 "/home/${DEPLOY_USER}/.ssh"
chmod 600 "/home/${DEPLOY_USER}/.ssh/authorized_keys"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"
echo "    Append the PUBLIC half of your deploy keypair to:"
echo "    /home/${DEPLOY_USER}/.ssh/authorized_keys"
echo "    (the PRIVATE half goes into the DEPLOY_SSH_KEY GitHub secret — see DEPLOYMENT.md)"

echo "==> Creating deploy directory ${DEPLOY_PATH}"
mkdir -p "${DEPLOY_PATH}/db-backup"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${DEPLOY_PATH}"

echo "==> Opening the firewall (SSH, HTTP, HTTPS only)"
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
else
  echo "    ufw not found — configure your firewall manually: allow 22, 80, 443"
fi

cat <<EOF

==> Done. Remaining steps (see DEPLOYMENT.md):
1. Add your deploy public key to /home/${DEPLOY_USER}/.ssh/authorized_keys
2. Point your domain's DNS A record at this server's IP
3. Run deploy/generate-secrets.sh (on your own machine, not this server)
   and use its output to write ${DEPLOY_PATH}/backend.env,
   ${DEPLOY_PATH}/frontend.env, and ${DEPLOY_PATH}/.env
4. Copy docker-compose.prod.yml, Caddyfile, and db-backup/backup.sh into
   ${DEPLOY_PATH} (the CD workflow does this automatically on every
   deploy after the first; scp/rsync it yourself once now to bootstrap)
5. Set the GitHub repo variables/secrets listed in DEPLOYMENT.md, then
   push to main — CI/CD takes it from there.
EOF
