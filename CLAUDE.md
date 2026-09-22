# CLAUDE.md — Estate Visitor Verification Platform

This file is the single source of truth for this project. If you are an AI
agent (or a human) picking this up later, read this whole file before
writing code. Decisions recorded here were made deliberately, several of
them after walking back an earlier, more complicated version of this same
document — don't reintroduce what was cut without a real reason and a note
here explaining why.

## 1. Project Identity

**Purpose:** A production-ready web application for a gated residential
estate that lets residents pre-register visitors, send visitors a secure
invitation link with a QR code and a manual code, and lets security
officers verify visitors at the gate.

> A resident tells the system who is coming, sends that visitor a link,
> and security verifies the visitor in seconds without calling the
> resident every time.

This is **not** a generic property-management or real-estate app. It is a
**visitor access control and verification tool**, currently being built for
**one specific estate**. It is not multi-tenant SaaS yet — see §2.

---

## 2. Deployment Target: Single Estate (for now)

This build targets **one estate**. Multi-tenancy support is not being
built out as a product surface right now (no cross-estate admin UI, no
billing, no estate self-signup).

That said, `estateId` is kept on every estate-owned table (residents,
apartments, invitations, audit logs, etc.) because it costs nothing today
and avoids a painful data migration if a second estate is ever added.
`SUPER_ADMIN` exists in the role model for the same reason but has no UI
built around it beyond the two endpoints needed to create an estate.

**Do not build out a platform-level admin dashboard, estate self-signup
flow, billing, or cross-estate reporting.** If/when this becomes a real
multi-tenant product, that's a deliberate, separate project phase — flag
it and discuss before starting it.

---

## 3. Non-Negotiable Product Workflow

```text
RESIDENT creates a visitor invitation (name, optional phone, date, time window)
   -> SYSTEM generates an opaque secure token, a QR code, a manual code, and a shareable link
   -> RESIDENT sends the link to the visitor
   -> VISITOR opens the link, sees their own invitation, shows the QR/code
   -> SECURITY scans the QR or enters the code
   -> SYSTEM verifies (estate match, expiry, revocation, entry policy) and returns
      only what the gate needs: visitor name, resident name, apartment, validity
   -> SECURITY calls the resident if needed (plain tel: link, see §8), then allows or denies entry
   -> ENTRY/EXIT is recorded
```

Do not add steps to this flow without a clear reason.

---

## 4. Technology Stack

**Frontend:** Next.js, TypeScript, React, Tailwind CSS, PWA-capable,
mobile-first.

**Backend:** NestJS, TypeScript, REST API. No WebSocket/real-time
transport in v1 — see §8 on why calling was cut.

**Database:** PostgreSQL via Prisma.

**Infra:** Docker for deployment, HTTPS everywhere, structured logging,
automated DB backups. **No Redis** — nothing in this codebase needs
distributed state yet; rate limiting runs in-memory via
`@nestjs/throttler`. Add Redis back only when there's an actual multi-instance
or distributed-rate-limiting need, not preemptively.

**Client-side offline:** IndexedDB + a signed manifest + a sync queue for
verification when the gate device has no connectivity (see §10). This
is the one piece of "offline-first" infrastructure kept in v1, because a
device losing connectivity at the gate is a real, likely failure mode —
unlike in-app calling infra, which isn't.

Do not replace PostgreSQL with MongoDB. Do not add Redis, a message
queue, or a WebSocket layer speculatively.

---

## 5. Architecture: Modular Monolith

Build the backend as a modular monolith, not microservices. Current
modules:

```text
auth, invitations, verification, entry-exit, notifications,
audit-logs, offline-sync, administration, health
```

There is deliberately **no `calling` module**. It was removed — see §8.

There are also deliberately no standalone `users`, `estates`, `buildings`,
`apartments`, `residents`, `security-officers`, or `visitors` modules.
An earlier scaffolding pass generated all seven with empty
TODO-only controllers and services, wired into `AppModule` but never
implemented and never called from anywhere else in the codebase — the
real functionality they were meant to hold already exists elsewhere:
- Estate/building/apartment CRUD, and resident and security-officer
  *onboarding* (creating the account/profile), live in `administration`
  (§6.3's Estate Admin surface).
- Visitor creation happens inline inside `invitations.service.ts` when a
  resident creates an invitation — there's no separate visitor
  onboarding step in this product's workflow (§3), so a standalone
  `visitors` module has nothing to do.
- A resident's or security officer's own identity/profile fields
  (`residentId`, `apartmentId`, `securityOfficerId`, display name) are
  resolved once in `JwtStrategy.validate()` and returned by `GET
  /auth/me` — there's no separate self-service profile endpoint in v1
  scope (§12 doesn't call for one).

They were deleted (not left in place "just in case") because a
registered NestJS module with a route-less controller is worse than no
module at all: it matches the name of a real capability, so a future
reader (human or AI) can easily assume `buildings` or `residents`
handles something it doesn't, and go looking for logic that was never
written instead of finding it in `administration` where it actually
lives. If a genuine need for resident self-service profile editing or a
distinct visitor-facing account ever comes up, add it back as a real,
tested module at that point — don't restore the empty scaffolding.

There is likewise deliberately no `gates` model, module, or admin
surface anywhere in the codebase — see §7.

Keep module boundaries clean enough that one could later be extracted if
scale ever required it. Do not create microservices for appearance.

---

## 6. User Roles and — critically — Data Access Boundaries

This section is the most important part of this document. Read it before
adding any admin-facing endpoint or UI.

### 6.1 Core principle: admin runs the estate, not the residents' lives

**Estate Admin manages estate *infrastructure and staffing* — never
visitor identity, visitor contact details, or who is visiting whom.**
That information belongs to the resident who created the invitation and
to the security officer verifying it at the moment of a visit. It is not
an admin/operations concern, and treating it as one is a real privacy
risk (it would let one role profile residents' visitor patterns — who
comes, how often, at what times).

### 6.2 Super Admin
Platform-level, only used if a second estate is ever onboarded. Can
create/list estates. Nothing else. No cross-estate visitor or resident
data access of any kind.

### 6.3 Estate Admin / Estate Manager
Manages one estate's structure and people. **Can:**
- Create/manage buildings and apartments
- Onboard and manage resident *accounts* (name, apartment assignment,
  status) — this is tenant directory management, not visitor tracking
- Onboard and manage security officer accounts
- View **aggregate, anonymous operational counts only** — e.g. "42
  visitors today," "18 active residents" — never a per-resident or
  per-visitor breakdown
- View estate settings and configuration

**Cannot, under any circumstances, through any endpoint or UI:**
- List, search, or view invitations (visitor name, visitor phone, visit
  time, which resident/apartment)
- View current visitors on the estate or entry/exit history
- View a visitor's phone number, photo, or any other visitor PII
- See audit log entries that expose visitor identity — audit logs
  available to admin must carry only operational metadata (invitation
  ID, outcome, method, reason) and never visitor name/phone (this
  is already how `AuditLogsService.log()` is called from Verification and
  Entry/Exit — keep it that way when adding new call sites)

If a future request implies giving admin any of the above ("let admin see
who's visited apartment 4B," "add a visitor analytics dashboard for
admin," "let admin export invitation history"), **stop and flag it
explicitly** rather than implementing it — it conflicts with this section
and needs a real conversation, not a quiet code change.

### 6.4 Resident
Belongs to one apartment. Owns their own visitor data completely. Can:
create invitations, view/revoke their own invitations, view their own
visitor history, receive their own notifications. A resident only ever
sees their own data — never another resident's.

### 6.5 Security Officer
Belongs to an estate. Can scan QR codes, enter manual codes, see
verification results, call the resident (§8), allow/deny entry, record
exit, view current-visitors/history for the estate. Security officers
must not be able to browse resident data unrelated to an active or
recent verification (e.g. no arbitrary resident directory browse). Not
scoped to any particular gate — see §7 for why.

---

## 7. No Per-Gate Assignment or Selection

An earlier version of this plan modeled physical gates as a first-class
concept: a `Gate` and `GateAssignment` table, an Estate Admin screen to
create gates and assign specific officers to specific gates, a gate
picker on the security scan screen, and a `gateId` recorded on every
verification/entry/exit/offline-sync event. **This was cut.**

The estate this is being built for doesn't have a use case for it — a
security officer works the estate, not a specific gate, and there's
nobody who currently needs to answer "which physical gate did this scan
happen at" as a distinct question from "which officer verified this
visitor." Carrying the concept anyway meant:
- an admin CRUD surface (create/list/disable gates, assign/unassign
  officers) that existed only to serve a picker nobody needed
- a scan screen that made the officer choose a gate before they could do
  anything, for estates that functionally have one checkpoint
- a real bug this shape produced: "Record Exit" wasn't gated the same
  way Scan/Manual were, so an officer on a multi-gate estate could
  trigger it with no gate selected, which the backend then rejected —
  complexity introduced a failure mode for the exact users the feature
  was meant to serve

Security officers now verify, allow/deny, and record entry/exit as
themselves, scoped to their estate — not to a sub-resource of it. Every
event still records *which officer* acted and *when*, which covers the
accountability need; it just doesn't also record *which gate*.

If an estate with genuinely multiple staffed checkpoints that need to be
distinguished from each other shows up as a real requirement, that's a
new, separate feature to design — not a default to reach for. If it
comes back, don't just restore the old `Gate`/`GateAssignment` tables
verbatim; re-derive the shape from whatever the actual requirement turns
out to be (it may not need officer-to-gate assignment at all, e.g. a
simple "which device is this" tag might cover it).

---

## 8. No In-App Calling

An earlier version of this plan specified full WebRTC calling
(signaling gateway, TURN/STUN, call session bookkeeping) so security
could call a resident from inside the browser. **This was cut.**

Instead: the verification response includes the resident's phone number
(`residentPhone`), and the "Call Resident" button on the gate screen is a
plain `tel:` link that opens the officer's own phone dialer. This:
- needs zero signaling/TURN infrastructure to build, run, or debug
- works even when the gate device has no data connectivity, as long as
  it has cell signal (unlike a WebRTC call, which needs a live socket to
  the backend)
- covers the entire actual requirement ("security can reach the
  resident quickly")

If in-app calling is ever genuinely needed later (e.g. residents without
phone numbers, or a requirement for call recording), that's a new,
separate feature to design — not a default to reach for.

---

## 9. Database Model (current)

```text
User, Estate, Building, Apartment, ResidentProfile,
SecurityOfficerProfile, Visitor, Invitation,
InvitationEvent, VerificationEvent, Visit, EntryExitEvent,
Notification, AuditLog, OfflineSyncEvent
```

No `CallSession`/`CallStatus` — removed along with calling (§8). No
`Gate`/`GateAssignment` — removed along with per-gate assignment (§7).

Key fields worth calling out:
- **Invitation**: `secureTokenHash`, `displayCodeHash` — never store the
  raw token/code longer than needed to issue it once.
- **Apartment.flatNumber**: a string, not a number (`B-204`, `Flat 4`,
  etc. must work).
- Use an explicit **estate timezone**; never assume UTC or the browser's
  timezone for visit validity windows.

---

## 10. Invitation, QR, and Offline-Verification Security

This remains the most security-sensitive part of the system — keep this
section's rules even as everything else gets simplified.

### 10.1 Never put PII directly into the QR code
Do not encode `visitorName`, `residentName`, `flatNumber`, or
`phoneNumber` into the QR payload. Encode only an opaque, high-entropy,
cryptographically random token (e.g. `https://.../v/<opaque-token>`).

### 10.2 Store hashes, not raw secrets
Store a hash of the token and of the manual code server-side. To verify:
resolve token/code -> hash -> find invitation -> check estate match,
status, validity window, entry policy, revocation -> return only the
minimum data the gate needs -> record a verification event.

### 10.3 Manual code
Must be high-entropy — never a sequential number, the apartment number,
or a resident ID. Rate-limit attempts.

### 10.4 Replay
A QR can be screenshotted and forwarded. Mitigate with expiration,
revocation, an optional one-time-entry policy, server-side state, an
audit trail, and rate limiting.

### 10.5 Offline verification
Gate devices cache a **signed** manifest of hashed tokens/codes (never
plaintext) so verification can happen without a live connection. Every
cached record's signature is re-verified client-side on every scan, not
only when first cached, since the local IndexedDB store is fully
writable by anyone with device access. Offline decisions sync back
idempotently once the device reconnects — a decision made offline must
never be double-recorded.

Invitation statuses: `PENDING, ACTIVE, USED, EXPIRED, REVOKED, CANCELLED`.
Entry policies: `ONE_TIME, MULTI_ENTRY`.

---

## 11. Multi-Tenancy Enforcement (even though there's one estate today)

Every estate-owned record carries `estateId`. The backend must enforce
this on every query — never rely on frontend filtering. A request for
another estate's record must fail even if the attacker knows the record
ID. This matters today too: it's what keeps `SECURITY_OFFICER` and
`ESTATE_ADMIN` scoped correctly even in a single-estate deployment, and
it's what makes adding a second estate later a non-event instead of a
rewrite.

---

## 12. V1 Scope

**Resident:** login, dashboard, create visitor invitation, generate
QR/code/link, share invitation, view own active visitors, view own
history, revoke invitation.

**Visitor:** open invitation link, view invitation, show QR, show code.
No visitor account required for ordinary visits.

**Security:** login, scan QR, manual code entry, verification result,
call resident (`tel:` link), allow/deny, record entry/exit, offline
verification when disconnected.

**Admin:** manage estate structure (buildings, apartments),
onboard/manage residents and security officers, view aggregate
operational counts, view audit logs (operational metadata only — see
§6.3). **Not:** visitor records, invitation contents, entry/exit history,
per-resident analytics.

**Platform:** authentication, authorization, PostgreSQL, secure QR
tokens, in-app notifications, offline verification + sync, structured
logging, backups.

**Explicitly out of scope for v1:** payments, property listings, rent
collection, maintenance management, accounting, in-app calling/WebRTC,
Redis, multi-estate admin tooling, per-gate assignment/selection, any
visitor-facing analytics for admin.

---

## 13. Future Features (design extension points for, don't build now)

Recurring visitors, domestic staff/contractor/delivery passes, vehicle
registration and plate capture, visitor photos, resident-to-security
messaging, emergency alerts, estate announcements, SMS/WhatsApp
notifications, native mobile apps, hardware gate integration, license
plate recognition, face verification (subject to legal/privacy review),
distinguishing multiple staffed checkpoints if that becomes a real
requirement (§7), and — if the product direction changes — genuine
multi-estate SaaS (billing, estate self-signup, platform-level
reporting).

None of these are reasons to complicate v1.

---

## 14. AI Coding Instructions

**Never:**
- Give Estate Admin (or any new role) access to visitor identity, visitor
  contact details, invitation contents, or entry/exit history — see §6
- Add WebRTC/calling, Redis, or a WebSocket layer back in without a new
  explicit decision recorded in this file
- Add a `Gate`/`GateAssignment`-style per-checkpoint model or a gate
  picker back in without a new explicit decision recorded in this file
  — see §7
- Store plaintext secrets or raw QR tokens server-side longer than
  necessary
- Trust frontend-side authorization or tenant filtering
- Put PII into a QR code
- Build a platform-level multi-estate admin surface speculatively
- Claim a feature is production-ready without testing it
- Use mock data in production code paths

**Always:**
- Re-read §6 before touching any admin endpoint or UI
- Inspect existing code before changing it; preserve working
  functionality
- Enforce authorization and tenant isolation server-side
- Validate all server input; handle loading/error/empty states
- Use database transactions where correctness requires them (e.g.
  one-time invitation redemption must be atomic)
- Consider mobile usability and offline behavior for gate-facing screens
- Run tests/lint/type checks after meaningful changes
- If a request conflicts with a documented boundary in this file
  (especially §6, §7, or §8), say so explicitly and ask before
  implementing

---

## 15. Definition of Done

A feature is complete when it has: UI, frontend logic, API, database
changes, validation, authorization (including the role/data boundaries in
§6), error handling, loading states, tests for security-critical logic,
mobile behavior, offline behavior where applicable, and production
logging. "QR verification is complete" means the full chain in §10.2, not
just a scanner UI.

---

## 16. Final Product Principle

- **Resident:** Create -> Share -> Know when the visitor arrives.
- **Visitor:** Open -> Show QR -> Enter.
- **Security:** Scan -> Verify -> Call/Allow/Deny.
- **Admin:** Onboard -> Manage estate structure -> Monitor aggregate
  health. Never: browse residents' visitors.

Complexity belongs in the architecture, security, and data-access
boundaries — not in the user's workflow, and not in what any one role can
see about people it shouldn't.
