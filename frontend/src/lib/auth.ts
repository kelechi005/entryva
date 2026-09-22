// Session helper. Auth is entirely httpOnly-cookie based (see
// api-client.ts's header comment) — there is no client-held access or
// refresh token to store, so this file deliberately does NOT keep
// anything in localStorage. Keeping a parallel, unused "save the token
// in localStorage" code path around was actively misleading (it implies
// a bearer-token model the app doesn't use) and, if anything ever did
// wire it up, would reintroduce the exact XSS token-theft exposure this
// project chose httpOnly cookies specifically to avoid.

import { apiFetch } from './api-client';

/** Calls the backend to clear both auth cookies server-side, then sends
 * the user back to login. Swallows a failed logout call (e.g. already
 * logged out, or offline) — the redirect to /login happens either way,
 * since that's the actually-important outcome for the user. */
export async function logout(router: { push: (href: string) => void }): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } catch {
    // Already logged out / session already expired / offline — fine,
    // we're navigating to /login regardless.
  }
  router.push('/login');
}
