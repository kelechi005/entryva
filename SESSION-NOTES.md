# Frontend testing + auth reliability pass — what was done

This continues directly from TESTING-NOTES.md's backend pass. That left the
frontend at zero tests, flagged as the highest-value gap, plus two open
questions: whether `docker-compose.yml`'s backup story was real, and
whether `apiFetch` transparently refreshes an expired access token. All
three are now resolved.

## Frontend test infrastructure added (none of this existed before)

- `frontend/jest.config.js`, `jest.polyfills.js`, `jest.setup.ts` — no jest
  config, no jsdom environment, no `@types/jest` existed; `npm test` had
  nothing to run against. Added ts-jest + jest-environment-jsdom, with
  `fake-indexeddb` for the offline store and Node's native `webcrypto`
  polyfilled into the test global so the crypto tests exercise **real**
  ECDSA P-256 verification — not a mocked `subtle.verify` that would only
  prove the mock was called.
- `frontend/src/test-utils/offline-signing.ts` — a test-only mirror of
  `backend/src/common/crypto/signing.util.ts` (same canonicalization, same
  IEEE P1363 signature encoding), so tests can generate genuinely-signed
  manifest fixtures the same way the server does.
- 45 tests across 6 new `.test.ts` files, all actually run here via
  `npm install` + `npx jest` (not just written) — plus a full
  `npx tsc --noEmit` pass with zero errors.

## What's covered

- `offline/crypto.ts` — hash parity with Node's own `createHash`,
  canonicalization order-independence, signature verify/tamper/wrong-key
  rejection, corrupted-signature handling
- `offline/db.ts` — manifest replace-not-merge semantics (a
  revoked/deleted invitation actually disappears on next sync), sync-queue
  idempotency (`put` semantics), `hasQueuedAllow` scoping
- `offline/verify-offline.ts` — every outcome branch (VALID / EXPIRED /
  NOT_YET_VALID / REVOKED / ALREADY_USED via both server-marked-USED and
  offline-queued-ALLOWED / NOT_FOUND), MULTI_ENTRY vs ONE_TIME behavior,
  and two deliberate attack simulations: a manifest entry edited directly
  in IndexedDB (devtools-style tampering), and an entry signed with the
  wrong key
- `offline/manifest.ts` — entries that fail signature verification are
  dropped before ever reaching IndexedDB, not cached-then-rejected later
- `offline/sync-queue.ts` — batch flush, FAILED events still purged
  locally (retrying a permanently-rejected event would only fail again),
  idempotency key generation
- `lib/api-client.ts` — the new 401-refresh-retry logic (below)

## Bug found and fixed: signature verification could throw instead of failing closed

`offline/crypto.ts`'s `verifyManifestEntry()` decoded the base64 signature
*before* entering its try/catch. `atob()` throws on invalid characters, so
a corrupted or hand-edited signature (exactly the input this function
exists to catch — the whole file's premise is "IndexedDB is writable by
anyone with device access") would crash instead of safely resolving to
`false`. This directly contradicted the documented intent (see the
backend's parallel comment: "throwing here would make tamper detection
itself crash the gate-scanner UI"). Fixed by moving the decode inside the
try block. Caught by `crypto.test.ts`'s "rejects garbage/corrupted
signature bytes without throwing" case.

## Gap found and fixed: no transparent token refresh, and no logout anywhere

Investigating the "does apiFetch refresh an expired token" question
surfaced a bigger issue: `lib/auth.ts` stored access/refresh tokens in
`localStorage` and `api-client.ts` attached them as `Authorization: Bearer`
— but **nothing ever called `saveTokens()`**. The backend
(`auth.controller.ts`, `jwt.strategy.ts`) is actually 100% httpOnly-cookie
based; the Bearer-header path is a fallback the frontend never used. So the
whole localStorage/token-header code path was dead and, worse, misleading
about how auth actually works — and there was no logout button anywhere in
the UI at all, despite `POST /auth/logout` existing on the backend.

Fixed:
- `lib/api-client.ts` rewritten: purely cookie-based (`credentials:
  'include'`, no client-held token), with transparent 401→`/auth/refresh`→
  retry-once logic. Concurrent requests that 401 at the same time share one
  in-flight refresh call rather than each triggering their own. Only if
  the refresh itself fails does the caller see a `SessionExpiredError`.
  This is the real fix for the gate-reliability question: previously, an
  officer's session going idle past the 15-minute access-token lifetime
  would silently start failing every scan/allow/deny with a raw 401 and no
  recovery path.
- `lib/auth.ts` rewritten from a token-storage module into a minimal
  `logout()` helper (calls `/auth/logout`, then redirects).
- New `components/ui/LogoutButton.tsx`, wired into all three role layouts
  (resident, security, admin) — previously there was no way to sign out of
  the app.
- `lib/__tests__/api-client.test.ts` — 7 tests covering the normal path,
  the refresh-and-retry path, the refresh-also-fails path, the no-retry-
  on-/auth/login-itself case, the shared-in-flight-refresh case, and the
  no-infinite-retry case.

## Gap found and fixed: no automated DB backups despite CLAUDE.md §11

`docker-compose.yml` only ever had health-checked services — no backup job
existed, despite §11 listing "automated DB backups" as in-scope V1
infrastructure. Added `db-backup/backup.sh` (a plain `pg_dump` loop with
gzip + retention cleanup, reusing the same `postgres:16-alpine` image
already pulled for the `postgres` service — no new dependency) and a
`backup` service in `docker-compose.yml` writing to a new
`postgres_backups` volume. See `db-backup/README.md` for restore steps.

## What's still left (unchanged from before, still real gaps)

- e2e/supertest tests through real controllers + guards — still needs a
  real or dockerized Postgres this sandbox can't provide.
- Frontend component tests for the gate scan UI flow itself
  (`app/(security)/gate/page.tsx`) — the offline *logic* underneath it is
  now fully tested, but the 489-line page component (camera scanner,
  manual entry, allow/deny, sync banner) has no rendering tests yet. This
  would need `@testing-library/react` (now installed) plus mocking
  `html5-qrcode`'s camera access.
