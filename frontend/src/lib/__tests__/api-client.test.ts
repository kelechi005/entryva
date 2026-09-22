// api-client.ts is not part of the offline module, but its 401-refresh
// behavior is the direct fix for the "does apiFetch transparently
// refresh an expired token" gap flagged during the offline test pass —
// it's exercised the same way (mocked global.fetch, real module logic).

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('apiFetch', () => {
  beforeEach(() => {
    jest.resetModules();
    (global as any).fetch = jest.fn();
  });

  it('returns parsed JSON on a normal 200 response', async () => {
    const { apiFetch } = require('../api-client') as typeof import('../api-client');
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ hello: 'world' }));

    const result = await apiFetch('/some-path');
    expect(result).toEqual({ hello: 'world' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('sends credentials: include on every request (cookie-based auth)', async () => {
    const { apiFetch } = require('../api-client') as typeof import('../api-client');
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}));

    await apiFetch('/some-path');
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.credentials).toBe('include');
  });

  it('on a 401, calls /auth/refresh once and retries the original request', async () => {
    const { apiFetch } = require('../api-client') as typeof import('../api-client');
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401)) // original request
      .mockResolvedValueOnce(jsonResponse({ refreshed: true }, 200)) // /auth/refresh
      .mockResolvedValueOnce(jsonResponse({ hello: 'world' }, 200)); // retried original request

    const result = await apiFetch('/protected-thing');
    expect(result).toEqual({ hello: 'world' });
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toContain('/auth/refresh');
  });

  it('throws SessionExpiredError if refresh also fails, without retrying forever', async () => {
    const { apiFetch, SessionExpiredError } = require('../api-client') as typeof import('../api-client');
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({}, 401)) // original request
      .mockResolvedValueOnce(jsonResponse({}, 401)); // /auth/refresh also fails

    await expect(apiFetch('/protected-thing')).rejects.toBeInstanceOf(SessionExpiredError);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not attempt refresh on a 401 from /auth/login itself (that just means wrong password)', async () => {
    const { apiFetch, SessionExpiredError } = require('../api-client') as typeof import('../api-client');
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ message: 'Bad credentials' }, 401));

    await expect(apiFetch('/auth/login', { method: 'POST' })).rejects.not.toBeInstanceOf(SessionExpiredError);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('shares a single in-flight refresh across concurrent 401s (no refresh stampede)', async () => {
    const { apiFetch } = require('../api-client') as typeof import('../api-client');
    let refreshCalls = 0;
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        refreshCalls += 1;
        // Resolve on the next microtask so both callers are mid-flight
        // when refreshOnce() is invoked a second time.
        return Promise.resolve(jsonResponse({ refreshed: true }, 200));
      }
      if (url.endsWith('/a') || url.endsWith('/b')) {
        // Each distinct path 401s once, then succeeds on retry.
        const calls = (global.fetch as jest.Mock).mock.calls.filter(([u]: [string]) => u === url);
        return Promise.resolve(jsonResponse({ ok: true }, calls.length === 1 ? 401 : 200));
      }
      return Promise.resolve(jsonResponse({}, 200));
    });

    const [a, b] = await Promise.all([apiFetch('/a'), apiFetch('/b')]);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(refreshCalls).toBe(1);
  });

  it('does not retry a second time if the retried request 401s again', async () => {
    const { apiFetch, SessionExpiredError } = require('../api-client') as typeof import('../api-client');
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({}, 401)) // original
      .mockResolvedValueOnce(jsonResponse({ refreshed: true }, 200)) // refresh succeeds
      .mockResolvedValueOnce(jsonResponse({}, 401)); // retried original still 401s

    await expect(apiFetch('/protected-thing')).rejects.toThrow();
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
