// Keeps the passes this resident created on this phone or computer, so the
// link can be shown again after leaving the screen by mistake. The server
// stores only a hash of each link, so it cannot show a link a second time.
// Passes live here only on this device, and only until they are a few days old.
import type { CreatedInvitation } from '@/types/invitation';

export interface PassStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const CACHE_KEY = 'entryva-created-passes';
const OPEN_KEY = 'entryva-open-pass';
const MAX_PASSES = 40;
const KEEP_AFTER_EXPIRY_MS = 3 * 24 * 3600_000;
/** After leaving the pass screen by mistake, it comes back for this long. */
export const REOPEN_WINDOW_MS = 30 * 60_000;

interface CacheEntry {
  pass: CreatedInvitation;
  savedAt: number;
}

export function browserStore(): PassStore | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null; // storage blocked
  }
}

function readAll(store: PassStore): CacheEntry[] {
  try {
    const raw = store.getItem(CACHE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as CacheEntry[]).filter((e) => e && e.pass && e.pass.id) : [];
  } catch {
    return [];
  }
}

function writeAll(store: PassStore, entries: CacheEntry[]): void {
  try {
    store.setItem(CACHE_KEY, JSON.stringify(entries));
  } catch {
    // storage full or blocked: the pass still works, it just can't be shown again later
  }
}

export function savePass(pass: CreatedInvitation, store: PassStore | null = browserStore(), now = Date.now()): void {
  if (!store) return;
  const kept = readAll(store).filter((e) => {
    if (e.pass.id === pass.id) return false;
    return new Date(e.pass.validUntil).getTime() + KEEP_AFTER_EXPIRY_MS > now;
  });
  writeAll(store, [{ pass, savedAt: now }, ...kept].slice(0, MAX_PASSES));
}

export function getPass(id: string, store: PassStore | null = browserStore()): CreatedInvitation | null {
  if (!store) return null;
  return readAll(store).find((e) => e.pass.id === id)?.pass ?? null;
}

export function hasPass(id: string, store: PassStore | null = browserStore()): boolean {
  return getPass(id, store) !== null;
}

/** The pass screen is showing this pass right now. */
export function markOpen(id: string, store: PassStore | null = browserStore(), now = Date.now()): void {
  if (!store) return;
  try {
    store.setItem(OPEN_KEY, JSON.stringify({ id, at: now }));
  } catch {
    // ignore
  }
}

/** The resident chose to leave the pass screen on purpose. */
export function markClosed(store: PassStore | null = browserStore()): void {
  if (!store) return;
  try {
    store.removeItem(OPEN_KEY);
  } catch {
    // ignore
  }
}

/** A pass the resident was looking at and did not close on purpose. */
export function reopenablePass(store: PassStore | null = browserStore(), now = Date.now()): CreatedInvitation | null {
  if (!store) return null;
  try {
    const raw = store.getItem(OPEN_KEY);
    if (!raw) return null;
    const open = JSON.parse(raw) as { id?: string; at?: number };
    if (!open.id || typeof open.at !== 'number' || now - open.at > REOPEN_WINDOW_MS) return null;
    return getPass(open.id, store);
  } catch {
    return null;
  }
}
