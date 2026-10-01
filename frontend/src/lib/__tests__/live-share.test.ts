import { bearingDeg, nextHeading } from '../live-share';

describe('bearingDeg', () => {
  it('points north, east, south and west', () => {
    const o = { lng: 0, lat: 0 };
    expect(bearingDeg(o, { lng: 0, lat: 1 })).toBeCloseTo(0, 3);
    expect(bearingDeg(o, { lng: 1, lat: 0 })).toBeCloseTo(90, 3);
    expect(bearingDeg(o, { lng: 0, lat: -1 })).toBeCloseTo(180, 3);
    expect(bearingDeg(o, { lng: -1, lat: 0 })).toBeCloseTo(270, 3);
  });
});

describe('nextHeading', () => {
  const a = { lng: 7.38, lat: 9.0 };

  it('anchors on the first reading and keeps the last heading', () => {
    expect(nextHeading(null, a, null)).toEqual({ heading: null, anchor: a });
    expect(nextHeading(null, a, 120)).toEqual({ heading: 120, anchor: a });
  });

  it('ignores tiny movements (GPS jitter)', () => {
    const jitter = { lng: 7.38, lat: 9.00002 };
    expect(nextHeading(a, jitter, 120)).toEqual({ heading: 120, anchor: a });
  });

  it('turns once the visitor has really moved', () => {
    const moved = { lng: 7.38, lat: 9.001 };
    const result = nextHeading(a, moved, null);
    expect(result.heading).toBeCloseTo(0, 3);
    expect(result.anchor).toEqual(moved);
  });
});
