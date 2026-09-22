import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/common/crypto/password.util';

const prisma = new PrismaClient();

// Bootstraps just enough data to exercise the full flow locally end to
// end: login -> create invitation -> public visitor link -> gate scan ->
// allow entry -> record exit. Not meant for production use — real
// estate/resident/officer onboarding goes through the Administration
// module; this only exists because that module has no way yet to create
// the very first SUPER_ADMIN (see README "Getting a first login").
async function main() {
  const estate = await prisma.estate.upsert({
    where: { id: 'seed-estate' },
    update: {},
    create: {
      id: 'seed-estate',
      name: 'Whitfield Gardens Estate',
      timezone: 'Africa/Lagos',
    },
  });

  const building = await prisma.building.upsert({
    where: { id: 'seed-building' },
    update: {},
    create: { id: 'seed-building', estateId: estate.id, name: 'Block B' },
  });

  const apartment = await prisma.apartment.upsert({
    where: { id: 'seed-apartment' },
    update: {},
    create: {
      id: 'seed-apartment',
      estateId: estate.id,
      buildingId: building.id,
      flatNumber: 'B-204',
      status: 'OCCUPIED',
    },
  });

  const residentPasswordHash = await hashPassword('ResidentPass123!');
  const residentUser = await prisma.user.upsert({
    where: { email: 'kelechi@example.com' },
    update: {},
    create: {
      email: 'kelechi@example.com',
      passwordHash: residentPasswordHash,
      role: 'RESIDENT',
      status: 'ACTIVE',
    },
  });

  await prisma.residentProfile.upsert({
    where: { userId: residentUser.id },
    update: {},
    create: {
      userId: residentUser.id,
      estateId: estate.id,
      apartmentId: apartment.id,
      displayName: 'Kelechi Sunday',
    },
  });

  const adminPasswordHash = await hashPassword('AdminPass123!');
  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      passwordHash: adminPasswordHash,
      role: 'ESTATE_ADMIN',
      status: 'ACTIVE',
      adminEstateId: estate.id,
    },
  });

  // SUPER_ADMIN is deliberately estate-less (CLAUDE.md §5.1) — it manages
  // the platform, not one estate — so unlike the ESTATE_ADMIN above it
  // gets no adminEstateId.
  const superAdminPasswordHash = await hashPassword('SuperAdminPass123!');
  await prisma.user.upsert({
    where: { email: 'superadmin@example.com' },
    update: {},
    create: {
      email: 'superadmin@example.com',
      passwordHash: superAdminPasswordHash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    },
  });

  const securityPasswordHash = await hashPassword('SecurityPass123!');
  const securityUser = await prisma.user.upsert({
    where: { email: 'samuel@example.com' },
    update: {},
    create: {
      email: 'samuel@example.com',
      passwordHash: securityPasswordHash,
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    },
  });

  await prisma.securityOfficerProfile.upsert({
    where: { userId: securityUser.id },
    update: {},
    create: {
      userId: securityUser.id,
      estateId: estate.id,
      fullName: 'Samuel Okafor',
      employeeCode: 'SEC-001',
    },
  });

  console.log('Seeded estate, apartment, resident, admin, super admin, and security officer.');
  console.log('  Resident login:    kelechi@example.com / ResidentPass123!');
  console.log('  Estate admin:      admin@example.com / AdminPass123!');
  console.log('  Super admin:       superadmin@example.com / SuperAdminPass123!');
  console.log('  Security officer:  samuel@example.com / SecurityPass123!');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
