# Testing pass — what was done

## Setup added (none of this existed before)
- `backend/jest.config.js` — there was no jest config anywhere (only the
  `"test": "jest"` script and jest as a dependency), so `npm test` had
  nothing telling it to use ts-jest or where to look for tests. Added a
  minimal config, using `isolatedModules: true` for now — see the comment
  in that file for why (this sandbox can't reach `binaries.prisma.sh` to
  run `prisma generate`, so full type-checked test runs need to happen in
  an environment with real network access; that's a sandbox limitation,
  not a code issue).
- 92 tests across 10 new `.spec.ts` files, all passing, actually run here
  (not just written) via `npm install` + `npx jest` — both `backend/` and
  `frontend/` lockfiles were also refreshed by a real `npm install`
  (registry access worked in this sandbox even though the Prisma engine
  binary host didn't).

## What's covered
- `common/crypto/token.util.ts` — token/code entropy, uniqueness, hashing
- `common/crypto/password.util.ts` — bcrypt hash/verify round trip
- `common/crypto/signing.util.ts` — canonicalization order-independence,
  sign/verify round trip, tamper detection, cross-key forgery rejection
- `common/guards/roles.guard.ts`, `resident-context.guard.ts`,
  `security-context.guard.ts` — the actual tenant-isolation attach points;
  tests specifically assert a client can't smuggle a different
  estateId/residentId/officerId through the request body
- `modules/verification/verification.service.ts` — every outcome branch
  (VALID/EXPIRED/NOT_YET_VALID/REVOKED/ALREADY_USED/NOT_FOUND), the
  cross-estate "report NOT_FOUND but audit WRONG_ESTATE" behavior, gate
  scoping
- `modules/entry-exit/entry-exit.service.ts` — the one-time-entry atomic
  compare-and-swap, including the actual race-loser path (`count === 0`
  → `ConflictException`, no Visit created)
- `modules/invitations/invitations.service.ts` — ownership scoping on
  revoke, that hashes/internal IDs never reach the public visitor lookup
- `modules/offline-sync/offline-sync.service.ts` — signed-manifest
  content, idempotent replay of a retried `clientEventId`, one failed
  event not blocking the rest of a batch

## Real bug found and fixed while writing these
`verifyOfflineManifestEntrySignature()` in `signing.util.ts` threw on a
malformed/corrupted signature instead of returning `false`. Since this
function's whole job is catching a tampered IndexedDB record on a gate
device, throwing here meant a corrupted local record could crash the
scan flow instead of just being rejected as invalid. Fixed with a
try/catch that returns `false`. The frontend equivalent
(`verifyManifestEntry` in `offline/crypto.ts`) already had this
try/catch — it was backend-only.

## Round 2 additions
- `modules/administration/administration.service.spec.ts` — the §6.3
  boundary: `resolveEstateId` pins `ESTATE_ADMIN` to their own estate
  even if a different one is requested, `SUPER_ADMIN` must specify one
  explicitly, and `getOverview` is proven to only ever call
  `prisma.invitation.count()` (never `findMany`/`findFirst`/`findUnique`
  — those methods are deliberately left unstubbed on the mock so a
  future call to them fails loudly instead of silently succeeding).
- `modules/administration/administration.controller.spec.ts` — a
  structural tripwire test: enumerates every method on
  `AdministrationController` and fails if any name matches
  `/invitation|visitor|entry.?exit|verif|history/i`, plus an exact
  route-list snapshot. This is meant to fail the moment a future PR (AI
  or human) adds an admin endpoint that even sounds like it exposes
  visitor data — the failure is the point; CLAUDE.md §6.3 says to stop
  and flag that, not implement it.
- `modules/health/health.controller.spec.ts` — liveness always returns
  ok without touching the DB; readiness returns ok/503 based on whether
  `SELECT 1` succeeds.
- Added `backend/src/modules/health/` (liveness + readiness endpoints,
  no auth, exempt from rate limiting) — there was no health endpoint at
  all before. Wired into `docker-compose.yml` healthchecks for
  `postgres` and `backend`, with `frontend`/`backend` now waiting on
  `condition: service_healthy` instead of just "started."
- Rewrote `README.md`'s "Current state of this scaffold" section, which
  was a stale session log describing a WebRTC calling module and Redis
  usage that had already been removed from the actual code. Replaced
  with a concise, accurate summary of what's actually implemented and
  what's actually still a gap.

Current total: 123 tests across 15 spec files, all passing (`npx jest`
run in-sandbox, not just written).

## Round 3 additions

- `modules/auth/auth.service.spec.ts` — login's constant-shape failure
  for "no such account" vs "wrong password" (both throw the same
  `UnauthorizedException` with the same message, so a client can't tell
  which one it was), non-ACTIVE account rejection, that a successful
  login stores a *hash* of the refresh token (not the raw token) and
  logs a `LOGIN` audit entry, refresh-token rotation on valid use, and —
  the important one — refresh-token **reuse detection**: presenting a
  refresh token whose hash doesn't match what's stored (e.g. a stolen,
  already-rotated token) invalidates the session (`refreshTokenHash` set
  to `null`) instead of silently issuing new tokens.
- `modules/auth/jwt.strategy.spec.ts` — this runs on every authenticated
  request and is what actually attaches `residentId`/`estateId`/
  `apartmentId`/`securityOfficerId` to the request context that every
  guard and service downstream trusts, so it get its own coverage:
  non-ACTIVE accounts rejected even with a structurally valid token,
  each role gets exactly the profile fields it should (and the lookup is
  scoped to `where: { userId: <the authenticated user> }`, never an
  arbitrary ID), `ESTATE_ADMIN`/`SUPER_ADMIN` don't trigger resident or
  officer profile lookups at all, and a `RESIDENT`/`SECURITY_OFFICER`
  role with a missing profile row is rejected rather than allowed
  through with partial data.
- Found and removed seven dead stub modules (`users`, `estates`,
  `buildings`, `apartments`, `residents`, `security-officers`,
  `visitors`) — registered in `AppModule`, zero routes, zero real logic,
  zero other callers anywhere in the codebase. See `V1-SCOPE-CHANGES.md`
  and `CLAUDE.md` §5 for the full rationale. This isn't a testing change
  but it directly affects "does every claimed feature actually exist":
  these modules looked like they might implement something CLAUDE.md
  §11 calls for, and didn't — the real implementations were already
  elsewhere (`administration`, `invitations`, `auth`).

## Round 5 additions (infra/completeness pass, not testing)

- **Structured logging wired in** (`nestjs-pino`/`pino`, pinned to
  `nestjs-pino@4.6.1` since the project is on NestJS 10 and
  `nestjs-pino@5` requires Nest 11+). CLAUDE.md §4/§11 both named this
  as required v1 infra; it wasn't there before — only the default
  plain-text `Logger`. Verified by actually booting `main.ts` via
  `ts-node`: it gets through Nest's module init and starts emitting
  structured pino output before failing at the pre-existing, unrelated
  Prisma-engine-binary limitation — confirming the logging wiring itself
  works and isn't what's broken.
- **Admin UI gap closed**: there was no frontend page for
  buildings/apartments at all, despite the backend having full, tested
  CRUD for both — an Estate Admin had no way to create the first
  building/apartment except by calling the API directly, which also
  meant the resident-onboarding form's apartment dropdown could never
  have anything in it through the UI alone. Added a `Buildings &
  Apartments` admin page + two create forms, wired into the nav.
- **`GET /admin/estate` added** — CLAUDE.md §6.3 lists "view estate
  settings and configuration" as an Estate Admin capability; there was
  no way to do that (only `SUPER_ADMIN` could see `Estate` rows via
  `estates/list`). Added a scoped, read-only endpoint + a settings
  panel on the admin estate page, plus tests and a deliberate update to
  the `AdministrationController` route-tripwire test's expected method
  list.
- **Service worker added** (`public/sw.js`) — a minimal runtime cache
  (cache every successful same-origin GET as fetched, serve from cache
  on network failure), registered from a small client component in the
  root layout. Closes a real gap: without it, a full page reload after
  the gate device lost connectivity would fail to load the app at all,
  defeating the point of the IndexedDB-based offline verification in
  `src/offline/*` for the exact scenario (§9.5) it exists to survive.
  Deliberately not build-time precaching via `next-pwa`/workbox — Next's
  per-build hashed chunk names make a hardcoded precache list go stale
  immediately, and the project's own stated preference is to avoid
  heavier infra than the actual need calls for.

Current total: **176 tests across 18 spec files**.

## Round 6 additions — timezone bug fix

CLAUDE.md §8 says visit validity windows must use the estate's own
timezone, never UTC or the server's local zone. `createInvitation` was
previously doing naive `new Date(\`${visitDate}T${startTime}:00\`)`
parsing, which JS interprets using the *server's* local timezone
setting — silently wrong the moment the server and the estate aren't in
the same zone (e.g. a Lagos, Nigeria estate on a server whose clock
defaults to UTC, which is the common case for most hosting providers).

Fixed:
- `src/common/time/visit-window.util.ts` (`resolveVisitWindow`) — uses
  `luxon` to interpret `visitDate` + `startTime`/`endTime` as wall-clock
  time in the estate's own IANA timezone, converting to the correct
  absolute instant regardless of what timezone the Node process itself
  runs in. Also now rejects `endTime <= startTime` instead of silently
  accepting a zero/negative-length window.
- `src/common/validators/is-iana-timezone.validator.ts`
  (`@IsIanaTimezone()`) — validates `Estate.timezone` is a real IANA
  zone name at estate-creation time, using the runtime's own ICU data
  via `Intl.DateTimeFormat` rather than a hardcoded list. Wired into
  `CreateEstateDto`. Catches a typo'd zone (e.g. "Africa/Lagoss") right
  where it was entered, instead of it surfacing later as a confusing
  invitation-creation failure.
- `invitations.service.ts`'s `createInvitation` now looks up the
  resident's own estate's `timezone` (scoped by `estateId`, same
  tenant-isolation pattern as everywhere else) and passes it through.

New tests: `visit-window.util.spec.ts` (Lagos vs UTC vs New York giving
different real instants for the same wall-clock time, a DST-transition
sanity check, rejecting inverted/zero-length windows, rejecting a
garbage zone name), `is-iana-timezone.validator.spec.ts`, and three new
cases added to `invitations.service.spec.ts` covering the actual
end-to-end conversion through `createInvitation` (including a concrete
assertion that 2:00–4:00 PM in Africa/Lagos stores as 13:00–15:00 UTC,
not 14:00–16:00 UTC as the old bug would have produced).

- `modules/administration/administration-crud.service.spec.ts` —
  the rest of `AdministrationService` beyond the §6.3 boundary tests:
  cross-estate rejection for apartment-in-wrong-building, resident
  onboarding in a foreign apartment, updating a resident/gate/officer
  that belongs to a different estate, and — the trickiest one —
  `assignOfficerToGate` requires *both* the gate and the officer to be
  independently confirmed as belonging to the resolved estate (an
  `ESTATE_ADMIN` could otherwise assign their own gate to another
  estate's officer, or vice versa, by guessing an ID). Also confirms a
  resident's temporary password is hashed before storage and never
  appears in plaintext anywhere in the write.

## Still not covered (next, if useful)
- e2e/supertest tests hitting real controllers+guards together, rather
  than unit tests against services directly
- Frontend has no test suite at all yet
- Correction to an earlier note in this file: `invitations.service.ts`'s
  `createInvitation` full validation path (cross-estate apartment
  rejection, hash-not-plaintext storage, resident-scoped data) turned
  out to already be covered in `invitations.service.spec.ts` — the
  previous version of this note was wrong about that being a gap.
