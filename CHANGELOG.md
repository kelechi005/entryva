# Changelog

Every entry here should correspond to something a resident, admin, or
security officer would actually notice, or a change worth knowing about
before you deploy it (a new required env var, a migration, a behavior
change). Skip purely internal refactors with no user-visible effect —
the git log already has those.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Add new entries under **Unreleased** as you build; when you deploy, move
them under a dated heading. The commit SHA of what's actually live at
any moment is always available at `GET /api/health` — see
[DEPLOYMENT.md](./DEPLOYMENT.md#ongoing-deploys) — so exact deploy
timestamps don't need to be tracked here by hand.

## Unreleased

_Nothing yet._

## 2026-09-21 — Initial production release

- Estate admins can edit their estate's name and address after creation
  (`PATCH /api/admin/estate`) — previously only settable once, at
  creation, with no way to correct it.
- Audit logs read in plain language (e.g. "Added the building 'Tower
  A'") instead of raw action codes.
- Resident invite emails report whether they actually sent — an admin
  clicking "resend" now sees a copy-the-link fallback if delivery fails
  or no email provider is configured, instead of a misleading success.
- Visitor invitation links no longer show a fake placeholder in place of
  a manual entry code that can't actually be recovered after creation —
  the QR code is the link's only share mechanism; the real one-time code
  is still shown to the resident who creates the invite.
- `GET /api/health` now reports which commit is live (`version`), for
  verifying what a deploy actually shipped.
- CI/CD: pushes to `main` build, test, and deploy automatically — see
  [DEPLOYMENT.md](./DEPLOYMENT.md).
