# Entryva

A production-ready web application for gated residential estates: residents
pre-register visitors, visitors receive a secure QR/code link, and security
officers verify visitors at the gate in seconds.

See `CLAUDE.md` for the full product/architecture spec that this scaffold
was generated from — it is the source of truth for scope, security rules,
and the non-negotiable visitor workflow.

## Structure

```text
backend/    NestJS modular monolith (REST), Prisma + PostgreSQL
frontend/   Next.js (App Router) PWA, Tailwind CSS
docker-compose.yml   Local Postgres + both apps
```

No Redis and no WebSocket/real-time layer — see CLAUDE.md §4 for why
(in-memory rate limiting is enough at this scale; there is no in-app
calling to need a live socket for).

## Getting started (local dev)

```bash
# 1. Infra
docker compose up -d postgres

# 2. Backend
cd backend
cp .env.example .env      # fill in real values

# Generate the offline-sync signing keypair (see .env.example for what
# each variable is for) and paste the base64 output into .env:
openssl ecparam -name prime256v1 -genkey -noout -out /tmp/offline_private.pem
openssl ec -in /tmp/offline_private.pem -pubout -out /tmp/offline_public.pem
base64 -w0 /tmp/offline_private.pem   # -> OFFLINE_SIGNING_PRIVATE_KEY_B64
base64 -w0 /tmp/offline_public.pem    # -> OFFLINE_SIGNING_PUBLIC_KEY_B64

npm install
npm run prisma:generate
npm run prisma:migrate
npm run start:dev         # http://localhost:4000/api

# 3. Frontend
cd ../frontend
cp .env.example .env
npm install
npm run dev                # http://localhost:3000
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for going to production: one VPS,
Docker Compose, Caddy for automatic HTTPS, and a GitHub Actions pipeline
that builds, tests, and deploys on every push to `main` once you've done
the (documented, one-time) server setup.

## Current state of this scaffold

This section describes what's actually in the codebase today. (An earlier
version of this README was a long running session log — including a
detailed writeup of a WebRTC calling module and Redis usage that were
later deliberately removed; see CLAUDE.md §7 for why. That log is gone
rather than left to contradict the code.)

### Implemented

- **Auth** — login (`POST /auth/login`), refresh-with-rotation
  (`POST /auth/refresh`), logout, `GET /auth/me`. Bcrypt password
  hashing, httpOnly cookies (not `localStorage`), `JwtAuthGuard` +
  `RolesGuard` + `@Roles()` + `@CurrentUser()`. Global rate limiting via
  `ThrottlerGuard`, with stricter per-route limits on login and the
  public invitation lookup.
- **Administration** — `SUPER_ADMIN` creates estates. `ESTATE_ADMIN`/
  `SUPER_ADMIN` manage buildings, apartments, residents, and security
  officers, all scoped server-side
  to the resolved estate (an `ESTATE_ADMIN` can never override this via
  a query param). `GET /admin/overview` returns aggregate counts only —
  see CLAUDE.md §6.3 for the hard boundary this respects (no visitor
  identity, invitation contents, or entry/exit history reachable from
  any admin endpoint). This boundary now has regression tests — see
  `backend/src/modules/administration/*.spec.ts`.
- **Invitations** — create, public token lookup, revoke, list, resident
  dashboard overview. Secure token + display code generation and
  hashing (CLAUDE.md §9); the public lookup never returns hashes or
  internal IDs.
- **Verification** — `POST /verification/qr` and `POST /verification/code`
  resolve a scan/manual code to an invitation, enforcing estate scope,
  expiry window, and revocation server-side. Every attempt is written to
  `VerificationEvent`. A cross-estate match is reported to the officer as
  `NOT_FOUND` (never confirmed to exist) but logged internally as
  `WRONG_ESTATE`. Verification never mutates the invitation.
- **Entry/Exit** — `POST /entry-exit/entry`, `/exit`, `/deny`,
  `GET /entry-exit/current`, `GET /entry-exit/history`. Allowing entry is
  the one place a `ONE_TIME` invitation is consumed, via an atomic
  `updateMany` compare-and-swap inside a transaction, so two concurrent requests
  racing on the same invitation can't both succeed.
- **Offline sync** — `GET /offline-sync/manifest` hands a gate device a
  signed (ECDSA P-256), hash-only cache of active invitations; every
  entry's signature is re-verified client-side on every scan, not just
  once at cache time. `POST /offline-sync` replays queued decisions
  through the same `EntryExitService` the online path uses, keyed by a
  client-generated `clientEventId` so a retried submission never
  double-records.
- **Notifications** — an internal, provider-agnostic abstraction.
  `dispatch()` always persists an in-app `Notification` row; there's no
  push/SMS/email provider wired up, which is in-scope for v1 (CLAUDE.md
  §11). Frontend polls `GET /notifications` every 30s — no WebSocket.
- **Audit logs** — append-only, estate-scoped, written from
  Verification, Entry/Exit, Auth, Invitations, and Administration.
  Admin-visible entries carry operational metadata only (invitation ID,
  outcome, reason) — never visitor name or phone.
- **Invitation visit windows are now timezone-correct.**
  `src/common/time/visit-window.util.ts` (`resolveVisitWindow`, via
  `luxon`) converts a resident's wall-clock date/time into the correct
  absolute instant using the *estate's own* stored timezone — not the
  server's local timezone, which is what a naive `new Date(...)` used
  to do. Concretely: a Lagos estate resident picking "2:00 PM" now
  actually gets 2:00 PM WAT (13:00 UTC), regardless of what timezone the
  Node process itself is running in. Also now rejects an `endTime` that
  isn't strictly after `startTime` (previously would have silently
  created a zero/negative-length window). `Estate.timezone` is validated
  as a real IANA zone name at estate-creation time
  (`IsIanaTimezone`, `src/common/validators/`) using the runtime's own
  ICU data via `Intl.DateTimeFormat`, so a typo'd zone fails loudly at
  the point it was entered rather than surfacing later as a confusing
  invitation-creation bug.
- **Structured logging** — `nestjs-pino`/`pino` wired in (`src/logger.config.ts`,
  `app.useLogger(app.get(Logger))` in `main.ts`). Every existing
  `new Logger(SomeService.name)` call already in the codebase (auth,
  audit logs, etc.) now emits through it automatically — nothing else
  had to change at each call site. One JSON object per log line in
  production (what CLAUDE.md §4/§11 actually ask for and what a log
  aggregator wants); pretty-printed to the terminal in development via
  `pino-pretty` (dev-only dependency, never loaded in production).
  Auth cookies/tokens are redacted from any logged request/response.
  Health check polling (`/health`, `/health/ready`) is excluded from
  request logging so it doesn't drown out real traffic. Verified this
  boots correctly and logs structured output before hitting the known
  Prisma-engine limitation below — the failure point is exactly where
  it was before this change, confirming the logging wiring itself
  isn't what's broken.
- **Health** — `GET /health` (liveness) and `GET /health/ready`
  (readiness — actually checks the DB is reachable, returns 503 if not).
  No auth, exempt from rate limiting, used by `docker-compose.yml`'s
  healthchecks.
- **Tests** — `backend/src/**/*.spec.ts` covers the security-critical
  path: token/signature crypto, the tenant-isolation guards, every
  `VerificationService` outcome branch (including the cross-estate case),
  the one-time-entry compare-and-swap race, offline-sync idempotency,
  login/refresh/logout (including refresh-token reuse detection and the
  constant-shape failure for bad credentials), `JwtStrategy`'s
  per-role context attachment, the full `AdministrationService` CRUD
  surface (cross-estate rejection on every write, not just reads), and
  the admin data-access boundary from CLAUDE.md §6.3 (including a
  structural test that fails if a future admin endpoint's name even
  looks like it might expose visitor data). 18 spec files (exact test
  count not restated here — it changed with the gate-concept removal
  below and this sandbox has no network access to run `npm test` and
  recount it; run it yourself after pulling this). Run with `npm test`
  from `backend/`.
- **Frontend** — login, admin pages (buildings/apartments/residents/
  security-officers, all form+list), the resident dashboard and
  create-visitor flow, the public visitor link page, and the security
  gate screen (scanner, manual code entry, verification result card,
  allow/deny/exit, currently-inside list, offline mode with a visible
  online/offline indicator).
- **Service worker** (`public/sw.js`, registered from
  `ServiceWorkerRegistration.tsx` in the root layout) — a minimal
  runtime cache: every successful same-origin GET is cached as it's
  fetched, and served back from cache if the network fails. This isn't
  build-time asset precaching (Next's per-build hashed chunk names make
  that fragile without a webpack plugin like `next-pwa`'s
  `injectManifest`) — it's simpler than that: as long as the gate
  screen was opened once while online, reloading it after losing
  connectivity still works, because everything it needed was already
  cached from that first load. This closes a real gap: without it, the
  IndexedDB-based offline verification in `src/offline/*` only helped if
  the tab happened to stay open through a connectivity drop — a reload
  at the wrong moment would have failed to load the page at all, in
  exactly the scenario (§9.5) it's meant to survive.

### Known gaps

- **Seven dead stub modules were removed** (`users`, `estates`,
  `buildings`, `apartments`, `residents`, `security-officers`,
  `visitors`) — they were registered in `AppModule` with empty,
  TODO-only controllers/services and no other code called them; the
  functionality they were named for already lives in `administration`
  and `invitations`. See CLAUDE.md §5 and `V1-SCOPE-CHANGES.md` for the
  full explanation. Mentioned here so it isn't mistaken for a missing
  feature — nothing that previously worked was removed, since nothing in
  those modules ever worked.
- **PWA icons are now real** — `public/manifest.json` has `any` and
  `maskable` icons at 192x192/512x512 (`public/icons/`), generated from
  the provided logo (padded to square on its own black background for
  the `any` variant; the `maskable` variant adds extra safe-zone margin
  so the light-streak flourish doesn't get clipped when an OS crops it
  to a circle/rounded-square). Favicon and Apple touch icon wired up via
  Next's `Metadata`/`Viewport` exports in `app/layout.tsx`. This closes
  the "empty icons array" gap noted previously.
- **`prisma generate` may not run in every sandbox.** It needs to reach
  `binaries.prisma.sh` to download the query-engine binary; if that host
  isn't reachable, `@prisma/client` has no generated model types and a
  full, type-checked `tsc`/`npm test` run isn't possible until it can run
  somewhere with real network access. The current test suite runs against
  `isolatedModules: true` (transpile-only) for this reason — see the
  comment in `backend/jest.config.js`. Confirmed directly: a real
  `ts-node` boot of `main.ts` gets all the way through Nest's module
  init and the new pino logger (which is already emitting structured
  output at that point) before failing at
  `new PrismaClient()` with "did not initialize yet" — i.e. this really
  is only the missing engine binary, not a code problem.
- **Migrations and a real database are confirmed working** — this was
  run end-to-end against real Postgres outside this sandbox over the
  course of building it out: login, resident/building/apartment CRUD,
  visitor invitations, resident invites, and real Resend email delivery
  have all been exercised for real, not just unit-tested. What hasn't
  been proven yet specifically is a deploy *through the CD pipeline* in
  `.github/workflows/ci.yml` against a fresh production server — see
  DEPLOYMENT.md step 6 ("First deploy") for that.

Before your first production deploy, see CLAUDE.md §14 (Definition of
Done) and DEPLOYMENT.md. The gaps below are about the *sandbox this was
built in*, not about whether the app itself works — it's been run for
real; what's untested is specifically the automated GHCR-image build and
the CD pipeline's SSH deploy step, since neither can execute here.
- **Frontend has a Jest suite** (`frontend/jest.config.js`) covering
  the offline-sync crypto/queue/manifest logic and the gate page's
  offline-entry flow, but nothing for the admin pages yet
  (`frontend/src/app/(admin)/`) — the highest-value gap if you're
  extending them.
- **`ResidentContextGuard`** (`common/guards/resident-context.guard.ts`)
  is unused — resident routes derive their scope from
  `AuthenticatedUser` via `@CurrentUser()` instead (already resolved by
  `JwtStrategy`), which is equivalent for a resident. It's a single
  self-documenting file, not a parallel subsystem, so it's been left in
  place rather than removed without a reason to.
- ~~Admin apartment changes aren't audit-logged~~ — **fixed.** Building
  and apartment creation now audit-log (`ADMIN_CHANGED_BUILDING` /
  `ADMIN_CHANGED_APARTMENT` with `metadata.change: 'created'`), matching
  the update/remove logging that already existed. Covered by new specs
  in `administration-crud.service.spec.ts`.

### Production-readiness pass (this session)

- **Fixed a silent email-delivery failure found from a real run's logs**
  (Resend returning 403, e.g. from an unverified sending domain): the
  "resend invite" and "create invite" endpoints returned `201 Created`
  even when the email genuinely failed to send, with no way for the
  admin to know or recover — the resident's invite link only ever
  existed as a hash server-side, so a failed send was previously a dead
  end. Both endpoints now return `{ inviteUrl, emailSent }`; the
  frontend shows a "copy this link" fallback whenever `emailSent` is
  false. `resendInvite` had zero test coverage before this — added a
  full suite for it, including the exact failure scenario.
- **CI/CD**: `.github/workflows/ci.yml` now builds and pushes both
  Docker images to GHCR on every push to `main`, then (once you've done
  the one-time server setup) deploys automatically via SSH — see
  [DEPLOYMENT.md](./DEPLOYMENT.md). Fixed a real bug in the process:
  the backend Dockerfile's runtime stage copied `node_modules` from
  *before* `prisma generate` ran, which would have silently shipped a
  container with no generated Prisma client at all. Also switched the
  frontend to Next.js `standalone` output (smaller image, no
  `node_modules` needed at runtime) and added non-root users to both
  images.

Verified and fixed with a real `npm test`/`npm run lint`/`npm audit` run
(this sandbox still can't reach `binaries.prisma.sh`, so Prisma Client
itself is untested here — everything below is independent of that):

- **Two stale test failures fixed, not silenced.** The CLAUDE.md §6.3
  controller "route-surface tripwire" test still had 2023-era method
  names — it was failing because the edit/delete endpoints added since
  (`updateBuilding`, `removeResident`, etc.) were never added to its
  allowlist, *not* because any of them actually violate the boundary
  (each one still passes the per-method `forbiddenNamePatterns` check
  individually). Similarly, two `AdministrationService` overview tests
  still asserted the pre-`UserStatus.REMOVED` query shape after the
  service was correctly updated to exclude removed residents/officers
  from the dashboard counts. All three were verified against the actual
  service code before being updated, not just made to pass. **191/191
  backend tests pass, lint clean.**
- **`bcrypt` bumped `^5.1.1` → `^6.0.0`** — the old version's
  `@mapbox/node-pre-gyp` → `tar` chain had a critical-severity path-
  traversal advisory. Same `hash`/`compare` API, no code changes needed;
  full test suite re-verified green after the bump. This was the only
  vulnerability in the backend's production dependency tree
  (`npm audit --omit=dev`) with an available non-breaking fix.
- **Known, monitored (not fixed here — no safe fix currently exists):**
  - Backend: `qs` (via `express`/`body-parser`, itself via
    `@nestjs/platform-express`) has open moderate/high DoS advisories
    with no patched version yet. Not attacker-reachable in an unusual
    way beyond normal query-string parsing; re-run `npm audit` after
    bumping `@nestjs/platform-express` in the future.
  - Frontend: `@ducanh2912/next-pwa` → `workbox-build` →
    `serialize-javascript` has an RCE advisory, but only exercised at
    **build time** (service-worker generation via Rollup/Terser) against
    your own source, not at runtime against user input — low real risk,
    but worth an upgrade once `next-pwa` ships a workbox bump.
- **Fixed a stale test after a copy change**: `gate/__tests__/page.test.tsx`
  still matched the old em-dash offline-banner text after this
  session's dash cleanup rewrote it — caught by actually running
  `npm test` in `frontend/`, not just assuming the file wasn't wired
  up (an earlier version of this README incorrectly said it wasn't;
  `npm test` in `frontend/` runs 56 tests today, all passing).
- **Admin pages still have no test coverage** — the Jest suite covers
  offline-sync and the gate page; `frontend/src/app/(admin)/` and
  `frontend/src/components/admin/` have none. Biggest remaining gap
  if you're extending those.
- **Confirmed working against a real Postgres outside this sandbox** —
  migrations, login, and every CRUD flow above have been run for real;
  see the note earlier in this section. `prisma generate` specifically
  can't fetch its query-engine binary in *this* sandbox
  (`binaries.prisma.sh` is network-restricted here), which is why a
  full `tsc`/`npm run build` fails here even though `npm test` passes
  (tests run transpile-only) — this is a property of this environment,
  confirmed by inspecting the schema directly, not a code defect. It
  already succeeds in `.github/workflows/ci.yml`'s `backend` job, which
  runs on a GitHub-hosted runner with normal internet access.

**Before going live, you still need to:**
1. Follow [DEPLOYMENT.md](./DEPLOYMENT.md) for the one-time server
   setup (fresh secrets, DNS, TLS via Caddy) — after that, every push to
   `main` builds, tests, and deploys automatically, ending in a real
   smoke test against the live site.
2. Decide on `multer`/`qs`'s open DoS advisories (`npm audit
   --omit=dev` in `backend/`) — no non-breaking fix exists yet; the fix
   is a NestJS 10→12 major-version upgrade, which is too large a change
   to bundle into a pre-launch pass unasked. Both are moderate/high
   *denial-of-service* advisories (not data exposure), and the app
   already rate-limits globally via `ThrottlerModule`, which meaningfully
   narrows the exposure. Worth scheduling deliberately, not urgently.
3. Wire up log/metric shipping for the structured pino output and the
   `/health/ready` check to your monitoring stack.
4. Extend frontend test coverage to the admin pages (`app/(admin)/`) —
   they currently have none, unlike offline-sync and the gate page.

### Getting a first login, end to end


`backend/prisma/seed.ts` now seeds a full working set: one estate, one
apartment, a resident, an `ESTATE_ADMIN`, a `SUPER_ADMIN`, and a
security officer, so the full flow (login → create invitation → public
visitor link → verify → allow entry → record exit) can be exercised
locally without going through the Administration endpoints first:

```
npm run prisma:seed   # from backend/, against a running Postgres

Resident login:    kelechi@example.com / ResidentPass123!
Estate admin:      admin@example.com / AdminPass123!
Super admin:       superadmin@example.com / SuperAdminPass123!
Security officer:  samuel@example.com / SecurityPass123!
```

