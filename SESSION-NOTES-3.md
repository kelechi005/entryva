# Session Notes 3 — Docker setup fixes

Fixes applied to get `docker compose up --build -d` working end-to-end on a
fresh machine, based on real errors hit while testing locally:

1. **`frontend/Dockerfile` was missing entirely.** Created it (Node 20-alpine,
   multi-stage: deps -> build -> runtime, `npm start` as CMD). This was a
   plain gap — nothing in the repo ever created it.

2. **Backend build output didn't match the Dockerfile's `CMD`.**
   `backend/prisma/` contains real NestJS source (`prisma.service.ts`,
   `prisma.module.ts`), not just `schema.prisma`/`seed.ts`, and it lives
   *outside* `src/`. Because there was no `nest-cli.json`, `nest build`
   inferred the common root of `src/` + `prisma/` and emitted to
   `dist/src/main.js` + `dist/prisma/...`, not the `dist/main.js` the
   Dockerfile's `CMD` and `package.json`'s `start`/`start:prod` expected.
   Fixed by:
   - Adding `backend/nest-cli.json` (`sourceRoot: "src"`).
   - Pointing `backend/Dockerfile`'s `CMD` and `package.json`'s
     `start`/`start:prod` at `dist/src/main.js` instead of `dist/main.js`.
   - (Explicitly did NOT set `rootDir: "./src"` in tsconfig — that breaks
     the build outright, since it excludes `prisma/prisma.service.ts` and
     `prisma/prisma.module.ts`, which are genuinely imported by `src/`.)

3. **`backend/.env`'s `DATABASE_URL` pointed at `localhost`.** Inside the
   `backend` container that resolves to the container itself, not the
   `postgres` service, so the backend could never reach the database once
   both were running under Compose. Changed the host to `postgres` (the
   Compose service name, resolvable on the internal Docker network). Note:
   if you ever run Prisma commands (`prisma migrate`, `prisma seed`)
   directly from your host machine rather than inside a container, override
   `DATABASE_URL` inline to use `localhost` instead, since your host isn't
   on that internal network — e.g.:
   `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/estate_visitor?schema=public" npm run prisma:migrate`

4. **`npm ci` and `npx prisma generate` were failing under flaky/slow
   networks** (`ETIMEDOUT`, `ECONNRESET` mid-download of the Prisma engine
   binary). Wrapped both in a 3-attempt retry loop with a 10s backoff in
   both Dockerfiles, and set generous `npm` fetch timeout/retry config
   ahead of `npm ci`. This can't fix a genuinely broken connection, but it
   absorbs the transient drops that were happening.

5. Dropped the obsolete top-level `version: "3.9"` key from
   `docker-compose.yml` (Compose V2 ignores it and warns on every command).

None of this touches application logic — only Docker/build plumbing. The
gate-removal work from SESSION-NOTES-2.md is unaffected.

Still true, unchanged from before: this has still never been fully
exercised end-to-end against a live Postgres by an automated test run in
a sandboxed environment (only manually, by the user, over the course of
this debugging session) — run the test suites for real confidence:
`cd backend && npm test`, `cd frontend && npx jest && npx tsc --noEmit`.
