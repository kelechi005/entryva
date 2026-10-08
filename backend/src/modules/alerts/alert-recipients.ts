import { PrismaService } from '../../../prisma/prisma.service';

export type RecipientGroup = 'RESIDENTS' | 'OFFICERS' | 'ADMINS';

/**
 * Who in ONE estate should be told about something. Only active accounts,
 * and always filtered by estate server-side, so an alert can never leak to
 * another estate's people (CLAUDE.md §11).
 */
export async function findRecipientUserIds(
  prisma: PrismaService,
  estateId: string,
  groups: RecipientGroup[],
): Promise<string[]> {
  const ids = new Set<string>();

  if (groups.includes('RESIDENTS')) {
    const rows = await prisma.residentProfile.findMany({
      where: { estateId, status: 'ACTIVE', user: { status: 'ACTIVE' } },
      select: { userId: true },
    });
    rows.forEach((r) => ids.add(r.userId));
  }

  if (groups.includes('OFFICERS')) {
    const rows = await prisma.securityOfficerProfile.findMany({
      where: { estateId, status: 'ACTIVE', user: { status: 'ACTIVE' } },
      select: { userId: true },
    });
    rows.forEach((r) => ids.add(r.userId));
  }

  if (groups.includes('ADMINS')) {
    const rows = await prisma.user.findMany({
      where: { role: 'ESTATE_ADMIN', adminEstateId: estateId, status: 'ACTIVE' },
      select: { id: true },
    });
    rows.forEach((r) => ids.add(r.id));
  }

  return [...ids];
}
