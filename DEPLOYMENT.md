# Deployment

This app deploys as two Docker images (backend, frontend) behind a single
Caddy reverse proxy that handles TLS automatically, on one VPS, with
Postgres and a backup job alongside them. Push to `main` and
`.github/workflows/ci.yml` builds, tests, and — once you've done the
one-time setup below — deploys it, automatically.

Nothing here is tied to a specific cloud provider. Any Ubuntu 22.04/24.04
VPS with a public IP works: DigitalOcean, Hetzner, Linode, a spare EC2
instance, whatever. This guide assumes one.

## How it fits together

```
                    ┌─────────────────────────────────────┐
  DNS: your domain  │  VPS                                 │
  A record ────────▶│  ┌────────┐                          │
                     │  │ caddy  │  :80, :443 (only public  │
                     │  │        │  ports on this host)     │
                     │  └───┬────┘                          │
                     │      │ /            /api/*           │
                     │      ▼               ▼               │
                     │  ┌────────┐     ┌─────────┐          │
                     │  │frontend│     │ backend │          │
                     │  └────────┘     └────┬────┘          │
                     │                       ▼               │
                     │                 ┌──────────┐         │
                     │                 │ postgres │◀─backup │
                     │                 └──────────┘         │
                     └─────────────────────────────────────┘
```

One domain, one TLS certificate, same-origin cookies (no cross-site
cookie configuration needed) — see `Caddyfile`.

## One-time setup

### 1. Provision a server and point DNS at it

Any VPS with Ubuntu 22.04/24.04, at least 1GB RAM. Create an A record for
your domain (or subdomain) pointing at its IP. DNS needs to have
propagated before step 4 (Caddy requests a Let's Encrypt certificate on
first boot and needs it to already resolve).

### 2. Bootstrap the server

```sh
scp deploy/bootstrap.sh you@your-server-ip:/tmp/
ssh you@your-server-ip 'sudo sh /tmp/bootstrap.sh'
```

This installs Docker, creates a `deploy` user, opens ports 22/80/443, and
creates `/opt/entryva`. It prints the remaining manual steps at the end —
you still need to add an SSH key (next step) before it's usable by CI.

### 3. Create a deploy SSH keypair

```sh
ssh-keygen -t ed25519 -f entryva_deploy_key -N ""
```

Append `entryva_deploy_key.pub` to `/home/deploy/.ssh/authorized_keys` on
the server. Keep `entryva_deploy_key` (the private half) for step 5 — do
not commit it anywhere.

### 4. Generate secrets and write the env files

```sh
sh deploy/generate-secrets.sh
```

Paste its output into three files **on the server**, at
`/opt/entryva/backend.env`, `/opt/entryva/.env` — use
`deploy/backend.env.example` and `deploy/env.prod.example` as the
starting templates (copy them up via scp, then edit in place; don't put
real secrets in the repo). At minimum, also set in `backend.env`:

- `CORS_ORIGINS` / `FRONTEND_ORIGIN` — `https://yourdomain.example.com`
- `RESEND_API_KEY` / `EMAIL_FROM` — see backend/.env.example; without
  these, resident invite emails only get logged, never actually sent

And in the top-level `.env`: `DOMAIN=yourdomain.example.com`.

Also copy `docker-compose.prod.yml`, `Caddyfile`, and `db-backup/backup.sh`
into `/opt/entryva` (matching relative paths) for this first deploy —
the CD workflow copies these automatically on every deploy after this
one, but something has to be there for the very first `docker compose up`.

```sh
scp docker-compose.prod.yml Caddyfile you@your-server-ip:/opt/entryva/
scp db-backup/backup.sh you@your-server-ip:/opt/entryva/db-backup/
```

### 5. Configure GitHub

**Settings → Secrets and variables → Actions → Secrets** (sensitive):

| Name | Value |
|---|---|
| `DEPLOY_SSH_KEY` | contents of `entryva_deploy_key` (the private key from step 3) |

**Settings → Secrets and variables → Actions → Variables** (not
sensitive — hostnames, not passwords):

| Name | Value |
|---|---|
| `DEPLOY_HOST` | your server's IP or hostname |
| `DEPLOY_USER` | `deploy` (or whatever `bootstrap.sh` used, if overridden) |
| `DEPLOY_PATH` | `/opt/entryva` (or wherever you put it) |
| `PRODUCTION_API_BASE_URL` | `https://yourdomain.example.com/api` |

`DEPLOY_HOST` is the switch: the `deploy` job in `ci.yml` is skipped
entirely until it's set, so pushing to `main` before you've done this
setup builds and tests as normal but doesn't try to deploy anywhere.

### 6. First deploy

```sh
ssh deploy@your-server-ip
cd /opt/entryva
docker compose -f docker-compose.prod.yml run --rm backend npx prisma migrate deploy
docker compose -f docker-compose.prod.yml up -d --wait --wait-timeout 120
```

This first one is manual because nothing's been pushed to `main` with
images built yet. `--wait` makes the command itself fail if a container
doesn't reach healthy within 2 minutes, instead of returning immediately
and leaving you to guess. Then visit your domain.

## Ongoing deploys

Push to `main`. That's it. Every push runs the same four-stage pipeline:

1. **CI** — lint, tests, typecheck for both backend and frontend.
2. **Build & push** — both images built and pushed to GHCR tagged with
   the commit SHA (and `:latest`).
3. **Deploy** — SSHes into the server, migrates using the *new* image
   (before swapping any running container, so nothing serves requests
   against a schema it doesn't expect), then `up -d --wait` — the whole
   job fails if a container doesn't come up healthy.
4. **Smoke test** — from GitHub's own runner, over the public internet,
   hits `https://yourdomain.example.com/api/health` and confirms the
   response actually reports the commit that was just deployed. This is
   the check that catches "the container looks fine internally but
   something's actually broken from the outside" — DNS, TLS, Caddy
   misrouting, all of it.

Watch it in the Actions tab. A red run means the deploy did not
complete — the failure is caught by the pipeline, not discovered by you
(or a resident) later.

Worth being precise about what this does and doesn't guarantee: `docker
compose up -d` recreates a changed service in place — there are a few
seconds where the old container is already gone and the new one is
still starting, so this is not true zero-downtime blue-green deployment.
For a single-estate app, a few seconds of interruption during a deploy
you control the timing of is a reasonable trade-off against the added
complexity of running redundant containers behind a load balancer. What
`--wait` and the smoke test actually buy you: if the new container
*fails* to become healthy, you find out from a red CI run within
seconds, rather than from a resident telling you the site is down
sometime later with no idea which of your last several pushes broke it.

To check what's actually live at any time, from anywhere: `curl
https://yourdomain.example.com/api/health` returns `{"status":"ok",
"version":"<git sha>"}`. Compare that SHA to your commit history to
confirm a specific push actually shipped.

## Calling (optional)

Officer-to-officer calling works on STUN alone for most cases. If two
officers on cellular data need to call each other, add a TURN relay:

```sh
docker compose -f docker-compose.prod.yml --profile calling up -d coturn
```

See `coturn/README.md` for the config (`TURN_SERVER_HOST`/`TURN_SECRET`
in `backend.env` must match `coturn/turnserver.conf`) — this needs its
own DNS record and an open UDP port range, so it's opt-in, not default.

## Rolling back

```sh
ssh deploy@your-server-ip
cd /opt/entryva
export BACKEND_IMAGE=ghcr.io/OWNER/REPO-backend:<previous-sha>
export FRONTEND_IMAGE=ghcr.io/OWNER/REPO-frontend:<previous-sha>
export GIT_SHA=<previous-sha>
docker compose -f docker-compose.prod.yml up -d --wait --wait-timeout 120
```

Find `<previous-sha>` from the commit history, the Actions run log for a
previous successful deploy, or by hitting `/api/health` on a working
mirror if you have one. Every image is tagged with the full commit SHA
it was built from, not just `:latest`, specifically so this is possible.

**This does not undo a database migration.** If the commit you're
rolling back past added a schema change the older code doesn't know
about, rolling back the containers alone isn't enough — you'd need to
also restore the database backup from before that migration ran (see
below). This is exactly why migrations should be additive whenever
possible (new nullable column, not a rename) — ask before writing one
that isn't, since it's the difference between "roll back in 30 seconds"
and "restore from backup."

## Restoring a database backup

See `db-backup/README.md`.

## What this doesn't cover

- **Multi-server / high availability.** This is a single-VPS deploy —
  matches CLAUDE.md §11's actual V1 scope. Don't reach for more than
  this until you have a concrete reason to.
- **A staging environment.** Nothing stops you from repeating this whole
  guide on a second, smaller server with its own subdomain if you want
  one — just don't point it at the same `DEPLOY_HOST`/`DOMAIN`.
- **Monitoring/alerting.** The backend logs structured JSON (pino) to
  stdout and exposes `GET /health/ready` — wire both into whatever
  stack you use (`docker compose logs`, or ship stdout to a log
  aggregator; hit `/health/ready` from an uptime checker).
