import type { AdminAuditLog } from '@/types/admin';

// Raw action codes (ADMIN_CHANGED_BUILDING, SECURITY_OFFICER_STATUS_CHANGED,
// ...) and JSON metadata blobs are the right shape for a database column,
// not for a human scanning a list. This turns each log entry into a
// summary line plus an optional one-line detail, using whatever the
// specific action's metadata actually carries (see
// backend/src/modules/administration/administration.service.ts and
// friends for what each action logs).
//
// Falls back to a readable-but-generic sentence for anything not
// explicitly mapped below, rather than showing the raw action code, so a
// new action added later doesn't regress to "ADMIN_DID_A_THING" in the UI.

interface Described {
  summary: string;
  detail?: string;
}

function titleCaseStatus(status: unknown): string {
  if (typeof status !== 'string') return 'a new status';
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function shortId(id?: string | null): string {
  return id ? `${id.slice(0, 8)}\u2026` : 'unknown';
}

export function describeAuditLog(log: AdminAuditLog): Described {
  const m = (log.metadata ?? {}) as Record<string, unknown>;
  const name = (key: string) => (typeof m[key] === 'string' ? (m[key] as string) : undefined);

  switch (log.action) {
    case 'ADMIN_CHANGED_BUILDING': {
      const buildingName = name('name') ?? 'A building';
      return m.change === 'created'
        ? { summary: `Added the building "${buildingName}"` }
        : { summary: `Renamed a building to "${buildingName}"` };
    }
    case 'ADMIN_REMOVED_BUILDING':
      return { summary: `Removed the building "${name('name') ?? shortId(log.entityId)}"` };

    case 'ADMIN_CHANGED_APARTMENT': {
      const flat = name('flatNumber') ?? 'an apartment';
      return m.change === 'created'
        ? { summary: `Added apartment ${flat}` }
        : { summary: `Updated apartment ${flat}` };
    }

    case 'ADMIN_CHANGED_RESIDENT': {
      const who = name('displayName') ?? 'a resident';
      if (m.change === 'created') return { summary: `Added ${who} as a resident` };
      if (m.change === 'removed') return { summary: `Removed ${who} as a resident` };
      if (m.change === 'status') return { summary: `Set ${who}'s account to ${titleCaseStatus(m.newStatus)}` };
      return { summary: `Updated ${who}'s details` };
    }

    case 'SECURITY_OFFICER_CREATED':
      return { summary: `Added ${name('fullName') ?? 'a security officer'}` };
    case 'SECURITY_OFFICER_UPDATED':
      return { summary: `Updated ${name('fullName') ?? 'a security officer'}'s details` };
    case 'SECURITY_OFFICER_REMOVED':
      return { summary: `Removed ${name('fullName') ?? 'a security officer'}` };
    case 'SECURITY_OFFICER_STATUS_CHANGED':
      return {
        summary: `Set ${name('fullName') ?? 'a security officer'}'s account to ${titleCaseStatus(m.newStatus)}`,
      };

    case 'ADMIN_CHANGED_ESTATE': {
      const fields = Array.isArray(m.fields) ? (m.fields as string[]) : [];
      return {
        summary: 'Updated the estate\u2019s settings',
        detail: fields.length ? `Changed: ${fields.join(', ')}` : undefined,
      };
    }

    case 'ADMIN_REMOVAL_PASSWORD_CHECK_FAILED':
      return { summary: 'An admin entered the wrong password while trying to remove someone' };

    case 'RESIDENT_INVITE_CREATED':
      return { summary: `Invited ${name('email') ?? 'a new resident'} to join`, detail: emailStatusDetail(m) };
    case 'RESIDENT_INVITE_RESENT':
      return { summary: 'Resent a resident invite', detail: emailStatusDetail(m) };
    case 'RESIDENT_INVITE_CANCELLED':
      return { summary: 'Cancelled a pending resident invite' };
    case 'RESIDENT_INVITE_COMPLETED':
      return { summary: 'A resident finished setting up their account' };

    case 'LOGIN':
      return { summary: 'Signed in' };
    case 'LOGIN_FAILED':
      return { summary: 'A sign-in attempt failed' };

    case 'ENTRY_ALLOWED':
      return { summary: 'Let a visitor in at the gate' };
    case 'ENTRY_DENIED':
      return { summary: 'Turned a visitor away at the gate' };
    case 'EXIT_RECORDED':
      return { summary: 'Recorded a visitor leaving' };
    case 'INVITATION_CREATED':
      return { summary: 'A resident created a visitor pass' };
    case 'INVITATION_REVOKED':
      return { summary: 'A resident cancelled a visitor pass' };
    case 'INVITATION_VERIFIED':
      return { summary: "A visitor's pass was checked at the gate" };
    case 'OFFLINE_EVENT_SYNCED':
      return { summary: 'A gate action recorded offline was synced back' };

    default:
      // Turns ADMIN_DID_A_THING into "Admin did a thing" rather than
      // showing the raw code, for whatever this mapping doesn't cover yet.
      return { summary: log.action.replaceAll('_', ' ').toLowerCase() };
  }
}

function emailStatusDetail(m: Record<string, unknown>): string | undefined {
  if (m.emailStatus === 'sent') return 'Email sent';
  if (m.emailStatus === 'failed') return "Email couldn't be sent";
  if (m.emailStatus === 'not_configured') return 'Email sending is not set up on this server';
  return undefined;
}
