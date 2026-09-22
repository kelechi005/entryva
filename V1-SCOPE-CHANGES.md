# V1 Scope Changes — Single-Estate Deployment

This documents what was removed from the original plan/codebase to get to a
production-ready v1 for **one estate**, and what to revisit later if you do
turn this into a multi-estate product.

## Removed entirely

- **Calling module (WebRTC/signaling)** — backend `calling` module (controller,
  service, WebSocket gateway, DTOs), the `CallSession` Prisma model and
  `CallStatus` enum, and the frontend's `useCall` hook, `CallOverlay`
  component, `lib/socket.ts`, and `types/calling.ts`.
  - **Replacement:** the gate screen's "Call Resident" button now opens the
    officer's own phone dialer via a `tel:` link to the resident's phone
    number (`residentPhone`, now returned by both the online verification
    endpoint and the offline manifest). Zero infra, works with or without
    the gate device having internet, and covers the actual need ("security
    can reach the resident") without a signaling server or TURN/STUN.
  - If you want in-app calling later, it's a clean addition — nothing else
    depends on it having existed.

- **Redis** — was declared as a dependency (`ioredis`, `REDIS_URL`, the
  `redis` service in `docker-compose.yml`) but nothing in the codebase
  actually used it; rate limiting already runs in-memory via
  `@nestjs/throttler`. Removed to cut one more moving part to operate and
  monitor. Add it back if you outgrow in-memory rate limiting or need
  distributed state across multiple backend instances.

- **TURN/STUN env vars** — `TURN_URL`/`TURN_USERNAME`/`TURN_CREDENTIAL` and
  their `NEXT_PUBLIC_*` counterparts, only needed for WebRTC calling.

## Kept as-is (already lean, worth keeping)

- **Offline verification at the gate** (signed manifest + IndexedDB cache +
  sync queue). This isn't scope creep — a real gate can lose connectivity,
  and the existing implementation already does the security-critical parts
  correctly (opaque tokens hashed, never plaintext; ECDSA-signed manifest
  entries the client re-verifies on every scan; idempotent sync so a
  decision made offline can't double-record on reconnect). Ripping it out
  would mean rewriting the gate screen for a feature that already works.
- **Notifications module** — already in-app/poll-based only, no push
  provider wired up. No change needed for v1.
- **Estate/Building/Apartment/Gate model + SUPER_ADMIN role** — this only
  adds two endpoints (`POST/GET /admin/estates`) gated to `SUPER_ADMIN`;
  everything else is scoped to `ESTATE_ADMIN`. Since the schema already
  carries `estateId` on every table, keeping this costs nothing today and
  avoids a painful migration if you add a second estate later. You simply
  won't use the `SUPER_ADMIN` endpoints until then.
- **Audit logs** — cheap, already built, and genuinely useful for a security
  product residents/admins will want to trust.

## Follow-up housekeeping

- `backend/package-lock.json` and `frontend/package-lock.json` were **not**
  regenerated (no reliable registry access in this environment). Run
  `npm install` (not `npm ci`) once in each of `backend/` and `frontend/`
  to bring the lockfiles back in sync with the trimmed `package.json`
  files, then commit the updated lockfiles.
- Run `npx prisma migrate dev` (or generate a new migration) after pulling
  this in, since `schema.prisma` dropped the `CallSession` model and
  `CallStatus` enum.

## Current v1 module list (backend)

```
auth, invitations, verification, entry-exit, notifications,
audit-logs, offline-sync, administration, health
```

(`calling` removed — see above. `users`, `estates`, `buildings`,
`apartments`, `residents`, `security-officers`, and `visitors` also
removed in this round, see below. Everything remaining is what the core
workflow — resident creates invite → QR/code/link → visitor shows it →
security verifies → allow/deny → entry/exit record — actually needs.)

## Removed: seven dead stub modules (this round)

`users`, `estates`, `buildings`, `apartments`, `residents`,
`security-officers`, and `visitors` were registered in `AppModule` but
every one of their controllers and services was an empty TODO
placeholder from an earlier scaffolding pass — no routes, no logic, and
(confirmed by grep) no other file in the codebase imported or called any
of them. Meanwhile the functionality they were named for already exists
for real:

- Estate/building/apartment/gate management and resident/security-officer
  *onboarding* → `administration` module (Estate Admin surface, §6.3).
- Visitor creation → happens inline in `invitations.service.ts` when a
  resident creates an invitation; there's no separate visitor-onboarding
  step in this product (§3), so a standalone `visitors` module was
  never going to have anything to do.
- A user's own identity/role/profile fields → resolved in
  `JwtStrategy.validate()`, exposed via `GET /auth/me`.

Deleted rather than filled in, because filling them in would have meant
building a second, redundant CRUD surface next to `administration` for
things `administration` already does correctly (with tenant scoping and
audit logging already tested). Kept `UsersService`'s two lookup helpers'
logic in mind, but confirmed nothing used them either — `AuthService`
queries `prisma.user` directly. If real per-role self-service profile
editing is ever wanted, that's a new, deliberate feature — not a reason
to undo this cut. See CLAUDE.md §5 for the fuller rationale.
