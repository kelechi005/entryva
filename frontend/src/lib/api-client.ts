// Thin fetch wrapper for talking to the NestJS backend.
// Keep this the single place that knows the API base URL / auth shape.
//
// Auth is entirely httpOnly-cookie based (see backend/src/modules/auth) —
// access_token (15m) and refresh_token (7d) are both set as cookies by
// the server on login/refresh, and JwtStrategy reads access_token from
// the cookie first (Authorization: Bearer is only a secondary fallback
// the frontend never actually uses). `credentials: 'include'` below is
// what does the real work; there is no client-held token to attach.
//
// Because the access token is short-lived, a session that's simply been
// idle for >15 minutes — very plausible for a security officer between
// visitors — would otherwise start failing every request with a 401 and
// no recovery until the officer notices and re-logs-in manually. That's
// an unacceptable failure mode for the one screen CLAUDE.md treats as
// the most operationally critical (the gate). So: on a single 401, this
// wrapper transparently calls POST /auth/refresh (which reads the
// refresh_token cookie and reissues both cookies) and retries the
// original request exactly once. Only if the refresh itself fails (the
// refresh token is also expired/invalid — a real "you must log in
// again") does the caller see an error, and that error is a
// SessionExpiredError so callers/UI can special-case "redirect to
// login" versus "show this as a normal request failure."

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';

export class SessionExpiredError extends Error {
  constructor() {
    super('Your session has expired. Please sign in again.');
    this.name = 'SessionExpiredError';
  }
}

// Previously, a SessionExpiredError just propagated up to whichever page
// happened to be open, which caught it the same as any other request
// error and rendered its message inline via setError — the page itself
// never redirected, so the officer/resident was left staring at a dead
// screen with a permanent "session expired" banner and no logged-out
// state (still on /gate, still showing stale data, every subsequent
// action failing the same way). A session that's actually gone needs to
// take the whole screen down, not decorate it with a sentence.
//
// A hard `window.location` navigation (not router.push) is deliberate:
// it forces a full reload, which throws away every bit of in-memory
// React state across the whole app in one move — there is no other
// reliable way to guarantee a stale dashboard, a half-filled form, or a
// live call doesn't keep running underneath. Guarded so this can't loop
// if it's somehow triggered while already on /login.
function forceSessionLogout(): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.location.pathname.startsWith('/login')) return;
    window.location.href = '/login?sessionExpired=1';
  } catch {
    // Non-browser/test environments (e.g. jsdom under Jest) may not
    // implement navigation — the redirect is a real-browser concern
    // only, so a failure here is safe to swallow.
  }
}

// Concurrent requests that all hit a 401 at once (e.g. a page firing
// several apiFetch calls via Promise.all) must trigger exactly one
// refresh, not one per request — sharing this in-flight promise ensures
// that regardless of how many callers race into refreshOnce().
let inFlightRefresh: Promise<boolean> | null = null;

async function refreshOnce(): Promise<boolean> {
  if (!inFlightRefresh) {
    inFlightRefresh = fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        inFlightRefresh = null;
      });
  }
  return inFlightRefresh;
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body?.message) return Array.isArray(body.message) ? body.message[0] : body.message;
  } catch {
    // response wasn't JSON — fall through to the generic message
  }
  return `Request failed (${res.status}).`;
}

export async function apiFetch<T>(path: string, init?: RequestInit, _isRetry = false): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 401 && !_isRetry && path !== '/auth/refresh' && path !== '/auth/login') {
    const refreshed = await refreshOnce();
    if (refreshed) {
      return apiFetch<T>(path, init, true);
    }
    forceSessionLogout();
    throw new SessionExpiredError();
  }

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }

  return res.json() as Promise<T>;
}
