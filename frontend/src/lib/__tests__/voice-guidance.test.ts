import {
  buildDirectionsUrl,
  haversineM,
  locateOnRoute,
  parseRoute,
  pickAnnouncement,
} from '../voice-guidance';

const sample = {
  routes: [
    {
      distance: 330,
      duration: 60,
      legs: [
        {
          steps: [
            {
              maneuver: { location: [7.38, 9.0], instruction: 'Head north' },
              geometry: { coordinates: [[7.38, 9.0], [7.38, 9.001], [7.38, 9.002]] },
              voiceInstructions: [
                { distanceAlongGeometry: 230, announcement: 'Head north for 200 metres' },
                { distanceAlongGeometry: 100, announcement: 'In 100 metres, turn right' },
              ],
            },
            {
              maneuver: { location: [7.38, 9.002], instruction: 'Turn right' },
              geometry: { coordinates: [[7.38, 9.002], [7.381, 9.002]] },
              voiceInstructions: [{ distanceAlongGeometry: 100, announcement: 'Turn right onto Gate Road' }],
            },
            {
              maneuver: { location: [7.381, 9.002], instruction: 'You have arrived' },
              geometry: { coordinates: [[7.381, 9.002]] },
              voiceInstructions: [{ distanceAlongGeometry: 30, announcement: 'You have arrived' }],
            },
          ],
        },
      ],
    },
  ],
};

describe('parseRoute', () => {
  it('reads steps, ends and voice instructions', () => {
    const route = parseRoute(sample);
    expect(route?.steps).toHaveLength(3);
    expect(route?.steps[0].endsAt).toEqual({ lng: 7.38, lat: 9.002 });
    expect(route?.steps[0].voice).toHaveLength(2);
    expect(route?.distanceM).toBe(330);
  });

  it('returns null for a reply with no route', () => {
    expect(parseRoute({ routes: [] })).toBeNull();
    expect(parseRoute(null)).toBeNull();
    expect(parseRoute({ routes: [{ legs: [{ steps: [{}] }] }] })).toBeNull();
  });
});

describe('pickAnnouncement', () => {
  const route = parseRoute(sample)!;

  it('speaks the first instruction when it is due', () => {
    const pick = pickAnnouncement(route.steps[0], 220, new Set(), 0);
    expect(pick?.text).toBe('Head north for 200 metres');
    expect(pick?.keys).toEqual(['0:0']);
  });

  it('speaks the closer instruction later and does not repeat the first', () => {
    const pick = pickAnnouncement(route.steps[0], 90, new Set(['0:0']), 0);
    expect(pick?.text).toBe('In 100 metres, turn right');
    expect(pick?.keys).toEqual(['0:1']);
  });

  it('returns null when everything due was already spoken', () => {
    expect(pickAnnouncement(route.steps[0], 90, new Set(['0:0', '0:1']), 0)).toBeNull();
  });

  it('returns null when nothing is due yet', () => {
    expect(pickAnnouncement(route.steps[1], 500, new Set(), 1)).toBeNull();
  });
});

describe('locateOnRoute', () => {
  const route = parseRoute(sample)!;

  it('finds the step the visitor is on', () => {
    const loc = locateOnRoute(route, { lng: 7.3805, lat: 9.002 }, 0);
    expect(loc.stepIndex).toBe(1);
    expect(loc.offRouteM).toBeLessThan(5);
  });

  it('never goes back to an earlier step', () => {
    const loc = locateOnRoute(route, { lng: 7.38, lat: 9.0 }, 1);
    expect(loc.stepIndex).toBeGreaterThanOrEqual(1);
  });

  it('reports how far off the route a visitor is', () => {
    const loc = locateOnRoute(route, { lng: 7.39, lat: 9.0 }, 0);
    expect(loc.offRouteM).toBeGreaterThan(500);
  });
});

describe('helpers', () => {
  it('measures distance in metres', () => {
    const d = haversineM({ lng: 7.38, lat: 9.0 }, { lng: 7.38, lat: 9.001 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(113);
  });

  it('builds a Directions URL with voice instructions', () => {
    const url = buildDirectionsUrl({ lng: 1, lat: 2 }, { lng: 3, lat: 4 }, 'pk.test');
    expect(url).toContain('/driving/1,2;3,4?');
    expect(url).toContain('voice_instructions=true');
    expect(url).toContain('access_token=pk.test');
  });
});
