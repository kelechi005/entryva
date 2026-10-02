// "Invite again": the people a resident has invited before, most frequent
// first. Worked out from the resident's own invitation history, so nothing
// extra is stored.
import type { InvitationHistoryItem } from '@/types/invitation';

export interface FrequentVisitor {
  name: string;
  phone: string;
  count: number;
  lastInvitedAt: string;
}

// The same phone written as 0801..., +234801... or 234801... is one person.
function keyOf(name: string, phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 7 ? `p:${digits.slice(-9)}` : `n:${name.toLowerCase()}`;
}

export function frequentVisitors(list: InvitationHistoryItem[], limit = 6): FrequentVisitor[] {
  const people = new Map<string, FrequentVisitor>();

  for (const inv of list) {
    const name = inv.visitorName.trim();
    if (!name) continue;
    const key = keyOf(name, inv.visitorPhone);
    const existing = people.get(key);
    if (!existing) {
      people.set(key, { name, phone: inv.visitorPhone ?? '', count: 1, lastInvitedAt: inv.createdAt });
      continue;
    }
    existing.count += 1;
    // Keep the name and number from the most recent invitation.
    if (inv.createdAt > existing.lastInvitedAt) {
      existing.name = name;
      existing.phone = inv.visitorPhone || existing.phone;
      existing.lastInvitedAt = inv.createdAt;
    }
  }

  return [...people.values()]
    .sort((a, b) => b.count - a.count || (a.lastInvitedAt < b.lastInvitedAt ? 1 : -1))
    .slice(0, limit);
}
