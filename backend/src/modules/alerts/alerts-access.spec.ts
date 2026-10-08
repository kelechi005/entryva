// Who may call what. These are the access rules for alerts, checked on the
// route definitions themselves (the RolesGuard enforces exactly this).
import 'reflect-metadata';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { AnnouncementsController } from './announcements.controller';
import { EmergencyController } from './emergency.controller';

const rolesOf = (handler: unknown) => (Reflect.getMetadata(ROLES_KEY, handler as object) as string[]).slice().sort();

describe('alerts route access', () => {
  const a = AnnouncementsController.prototype;
  const e = EmergencyController.prototype;

  it('announcements: everyone in the estate reads; residents can never post; only admin deletes', () => {
    expect(rolesOf(a.list)).toEqual(['ESTATE_ADMIN', 'RESIDENT', 'SECURITY_OFFICER']);
    expect(rolesOf(a.create)).toEqual(['ESTATE_ADMIN', 'SECURITY_OFFICER']);
    expect(rolesOf(a.remove)).toEqual(['ESTATE_ADMIN']);
  });

  it('emergencies: only residents raise; only staff acknowledge; SUPER_ADMIN has no access', () => {
    expect(rolesOf(e.raise)).toEqual(['RESIDENT']);
    expect(rolesOf(e.acknowledge)).toEqual(['ESTATE_ADMIN', 'SECURITY_OFFICER']);
    expect(rolesOf(e.list)).toEqual(['ESTATE_ADMIN', 'RESIDENT', 'SECURITY_OFFICER']);
    expect(rolesOf(e.resolve)).toEqual(['ESTATE_ADMIN', 'RESIDENT', 'SECURITY_OFFICER']);
    for (const handler of [e.raise, e.acknowledge, e.list, e.resolve, a.list, a.create, a.remove]) {
      expect(rolesOf(handler)).not.toContain('SUPER_ADMIN');
    }
  });
});
