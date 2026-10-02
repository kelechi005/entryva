import { REOPEN_WINDOW_MS, getPass, hasPass, markClosed, markOpen, reopenablePass, savePass, type PassStore } from '../pass-cache';
import type { CreatedInvitation } from '@/types/invitation';

function fakeStore(): PassStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const NOW = new Date('2026-10-02T20:00:00Z').getTime();

function pass(id: string, validUntil = '2026-10-02T22:00:00Z'): CreatedInvitation {
  return {
    id,
    visitorName: 'Obinna',
    visitorPhone: '08012345678',
    residentName: 'Ada Eze',
    apartmentLabel: 'B-204',
    validFrom: '2026-10-02T19:00:00Z',
    validUntil,
    status: 'ACTIVE',
    displayCode: 'ABC123',
    shareUrl: `https://entryva.tech/invite/token-${id}`,
  } as CreatedInvitation;
}

describe('pass cache', () => {
  it('shows a created pass again, with its link', () => {
    const store = fakeStore();
    savePass(pass('a'), store, NOW);
    expect(getPass('a', store)?.shareUrl).toBe('https://entryva.tech/invite/token-a');
    expect(hasPass('a', store)).toBe(true);
    expect(hasPass('zzz', store)).toBe(false);
  });

  it('keeps one copy per pass, newest first', () => {
    const store = fakeStore();
    savePass(pass('a'), store, NOW);
    savePass(pass('b'), store, NOW + 1);
    savePass(pass('a'), store, NOW + 2);
    const all = JSON.parse(store.data.get('entryva-created-passes') as string);
    expect(all.map((e: { pass: { id: string } }) => e.pass.id)).toEqual(['a', 'b']);
  });

  it('forgets passes that ended more than three days ago', () => {
    const store = fakeStore();
    savePass(pass('old', '2026-09-20T10:00:00Z'), store, NOW - 1000);
    savePass(pass('new'), store, NOW);
    expect(hasPass('old', store)).toBe(false);
    expect(hasPass('new', store)).toBe(true);
  });

  it('keeps at most 40 passes', () => {
    const store = fakeStore();
    for (let i = 0; i < 45; i++) savePass(pass(`p${i}`), store, NOW + i);
    expect(JSON.parse(store.data.get('entryva-created-passes') as string)).toHaveLength(40);
    expect(hasPass('p44', store)).toBe(true);
    expect(hasPass('p0', store)).toBe(false);
  });

  it('brings back the pass after leaving by mistake, but not after closing it on purpose', () => {
    const store = fakeStore();
    savePass(pass('a'), store, NOW);
    markOpen('a', store, NOW);
    expect(reopenablePass(store, NOW + 60_000)?.id).toBe('a');
    markClosed(store);
    expect(reopenablePass(store, NOW + 60_000)).toBeNull();
  });

  it('does not bring back a pass after the reopen window', () => {
    const store = fakeStore();
    savePass(pass('a'), store, NOW);
    markOpen('a', store, NOW);
    expect(reopenablePass(store, NOW + REOPEN_WINDOW_MS + 1)).toBeNull();
  });

  it('copes with no storage and with damaged storage', () => {
    expect(() => savePass(pass('a'), null)).not.toThrow();
    expect(getPass('a', null)).toBeNull();
    expect(reopenablePass(null)).toBeNull();
    const store = fakeStore();
    store.data.set('entryva-created-passes', '{not json');
    store.data.set('entryva-open-pass', 'nope');
    expect(getPass('a', store)).toBeNull();
    expect(reopenablePass(store, NOW)).toBeNull();
    expect(() => savePass(pass('a'), store, NOW)).not.toThrow();
    expect(hasPass('a', store)).toBe(true);
  });
});
