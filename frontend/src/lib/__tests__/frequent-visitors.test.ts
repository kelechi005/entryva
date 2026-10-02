import { frequentVisitors } from '../frequent-visitors';
import type { InvitationHistoryItem } from '@/types/invitation';

let n = 0;
function inv(name: string, phone: string | null, createdAt: string): InvitationHistoryItem {
  n += 1;
  return {
    id: `i${n}`,
    visitorName: name,
    visitorPhone: phone,
    apartmentLabel: 'B-204',
    validFrom: createdAt,
    validUntil: createdAt,
    status: 'USED',
    entryPolicy: 'ONE_TIME',
    createdAt,
    revokedAt: null,
    usedAt: null,
  };
}

describe('frequentVisitors', () => {
  it('ranks by how often a person was invited, then by most recent', () => {
    const result = frequentVisitors([
      inv('Chidi', '08011111111', '2026-09-01T10:00:00Z'),
      inv('Bola', '08022222222', '2026-09-02T10:00:00Z'),
      inv('Chidi', '08011111111', '2026-09-03T10:00:00Z'),
      inv('Dayo', '08033333333', '2026-09-05T10:00:00Z'),
    ]);
    expect(result.map((v) => v.name)).toEqual(['Chidi', 'Dayo', 'Bola']);
    expect(result[0].count).toBe(2);
  });

  it('treats the same number written differently as one person', () => {
    const result = frequentVisitors([
      inv('Amaka', '0801 234 5678', '2026-09-01T10:00:00Z'),
      inv('Amaka O.', '+234 801 234 5678', '2026-09-04T10:00:00Z'),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(2);
    // the latest name is kept
    expect(result[0].name).toBe('Amaka O.');
  });

  it('matches people without a phone number by name, ignoring case', () => {
    const result = frequentVisitors([
      inv('Emeka', null, '2026-09-01T10:00:00Z'),
      inv('emeka', '', '2026-09-02T10:00:00Z'),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(2);
  });

  it('skips blank names and respects the limit', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      inv(`Person ${i}`, `0801000000${i}`, `2026-09-${String(i + 1).padStart(2, '0')}T10:00:00Z`),
    );
    const result = frequentVisitors([inv('   ', '08099999999', '2026-09-30T10:00:00Z'), ...many], 6);
    expect(result).toHaveLength(6);
    expect(result.every((v) => v.name.trim() !== '')).toBe(true);
  });

  it('returns nothing for an empty history', () => {
    expect(frequentVisitors([])).toEqual([]);
  });
});
