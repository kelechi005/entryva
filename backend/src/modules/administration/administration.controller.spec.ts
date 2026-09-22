import { AdministrationController } from './administration.controller';

/**
 * CLAUDE.md §6.3: "If a future request implies giving admin any of the
 * above ... stop and flag it explicitly rather than implementing it."
 * This test is a tripwire, not a behavior test: it inspects the actual
 * method names on AdministrationController and fails if any of them look
 * like they'd expose visitor identity, invitation contents, or entry/exit
 * history — the kind of endpoint an AI agent might add later while
 * "helpfully" building out an admin dashboard, without re-reading §6.
 *
 * If this test starts failing because a new method was added, that is
 * the point: stop and read CLAUDE.md §6.3 before deciding whether the
 * new method is actually fine (e.g. an aggregate count) or a real
 * boundary violation.
 */
describe('AdministrationController — route-surface tripwire (CLAUDE.md §6.3)', () => {
  const forbiddenNamePatterns = [
    /invitation/i,
    /visitor/i,
    /entry.?exit/i,
    /currentlyinside/i,
    /verif/i, // verification/verify
    /history/i,
  ];

  const methodNames = Object.getOwnPropertyNames(AdministrationController.prototype).filter(
    (name) => name !== 'constructor',
  );

  it('has a non-trivial route surface to check (sanity check the test itself isn\'t vacuous)', () => {
    expect(methodNames.length).toBeGreaterThan(5);
  });

  it.each(methodNames)('controller method "%s" does not expose visitor/invitation/entry-exit data', (name) => {
    const violated = forbiddenNamePatterns.find((pattern) => pattern.test(name));
    expect(violated).toBeUndefined();
  });

  it('exposes exactly the known-safe estate-management + aggregate-overview surface', () => {
    const expected = [
      'createEstate',
      'listEstates',
      'updateEstate',
      'createBuilding',
      'listBuildings',
      'updateBuilding',
      'removeBuilding',
      'createApartment',
      'listApartments',
      'updateApartment',
      'createResident',
      'listResidents',
      'updateResident',
      'updateResidentStatus',
      'removeResident',
      'createSecurityOfficer',
      'listSecurityOfficers',
      'updateSecurityOfficer',
      'updateSecurityOfficerStatus',
      'removeSecurityOfficer',
      'getOverview',
      'getEstateSettings',
    ].sort();
    // Each name above was individually checked against forbiddenNamePatterns
    // by the it.each block earlier in this file — this list only needs to
    // stay in sync with the controller's actual surface, not re-justify
    // safety per entry. Update it (after checking CLAUDE.md §6.3) whenever
    // a new admin method is added.
    expect(methodNames.sort()).toEqual(expected);
  });
});
