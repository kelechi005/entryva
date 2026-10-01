import { MapboxError, fetchRoute, getMapboxToken, searchPlaces } from '../mapbox';

const ORIGINAL_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const from = { lat: 7.7, lng: 8.5 };
const to = { lat: 7.71, lng: 8.51 };

function mockFetchOnce(body: unknown, ok = true) {
  (global as any).fetch = jest.fn().mockResolvedValue({ ok, json: async () => body });
}

afterEach(() => {
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = ORIGINAL_TOKEN;
  jest.restoreAllMocks();
});

describe('getMapboxToken', () => {
  it('returns a public token', () => {
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'pk.abc';
    expect(getMapboxToken()).toBe('pk.abc');
  });

  it('rejects a missing token and refuses a secret (sk.) token', () => {
    delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    expect(getMapboxToken()).toBeNull();
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'sk.secret';
    expect(getMapboxToken()).toBeNull();
  });
});

describe('fetchRoute', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'pk.test';
  });

  it('parses distance, duration, line and steps; asks for lng,lat order', async () => {
    mockFetchOnce({
      routes: [
        {
          distance: 3400,
          duration: 540,
          geometry: { coordinates: [[8.5, 7.7], [8.51, 7.71]] },
          legs: [{ steps: [{ distance: 200, maneuver: { instruction: 'Turn left onto Estate Road' } }, { distance: 0 }] }],
        },
      ],
    });

    const route = await fetchRoute(from, to);

    expect(route.distanceM).toBe(3400);
    expect(route.durationS).toBe(540);
    expect(route.coordinates).toHaveLength(2);
    // steps with no instruction text are dropped
    expect(route.steps).toEqual([{ instruction: 'Turn left onto Estate Road', distanceM: 200 }]);
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('/8.5,7.7;8.51,7.71?');
    expect(url).toContain('access_token=pk.test');
  });

  it('fails with no-route when Mapbox finds nothing', async () => {
    mockFetchOnce({ routes: [] });
    await expect(fetchRoute(from, to)).rejects.toMatchObject({ kind: 'no-route' });
  });

  it('fails with request-failed on an HTTP error or a network failure', async () => {
    mockFetchOnce({}, false);
    await expect(fetchRoute(from, to)).rejects.toMatchObject({ kind: 'request-failed' });
    (global as any).fetch = jest.fn().mockRejectedValue(new TypeError('network'));
    await expect(fetchRoute(from, to)).rejects.toBeInstanceOf(MapboxError);
  });

  it('fails with no-token and makes no request when unconfigured', async () => {
    delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    (global as any).fetch = jest.fn();
    await expect(fetchRoute(from, to)).rejects.toMatchObject({ kind: 'no-token' });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('searchPlaces', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'pk.test';
  });

  it('maps features to labelled coordinates', async () => {
    mockFetchOnce({
      features: [
        { geometry: { coordinates: [8.5214, 7.7337] }, properties: { full_address: 'Emerald Gardens, Makurdi' } },
        { geometry: { coordinates: [8.6, 7.8] }, properties: { name: 'Gate Rd', place_formatted: 'Benue' } },
        { properties: { name: 'no geometry' } },
      ],
    });

    const results = await searchPlaces('Emerald Gardens');

    expect(results).toEqual([
      { label: 'Emerald Gardens, Makurdi', lng: 8.5214, lat: 7.7337 },
      { label: 'Gate Rd, Benue', lng: 8.6, lat: 7.8 },
    ]);
  });

  it('does not call Mapbox for very short queries', async () => {
    (global as any).fetch = jest.fn();
    expect(await searchPlaces('ab')).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
