import {
  ARRIVAL_CONFIRMATIONS,
  POOR_ACCURACY_M,
  evaluateArrival,
  externalDirectionsUrl,
  formatDistance,
  formatDuration,
  haversineMeters,
} from '../geo';

describe('haversineMeters', () => {
  it('is 0 for the same point and ~111 km per degree of latitude', () => {
    const p = { lat: 7.73, lng: 8.52 };
    expect(haversineMeters(p, p)).toBe(0);
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it('measures a short real-world gap (~111 m for 0.001 degrees of latitude)', () => {
    const d = haversineMeters({ lat: 7.7337, lng: 8.5214 }, { lat: 7.7347, lng: 8.5214 });
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(117);
  });
});

describe('evaluateArrival', () => {
  const radiusM = 100;

  it('arrives inside the radius with a good fix', () => {
    expect(evaluateArrival({ distanceM: 60, accuracyM: 15, radiusM })).toBe('arrived');
  });

  it('arrives exactly on the radius edge', () => {
    expect(evaluateArrival({ distanceM: 100, accuracyM: 15, radiusM })).toBe('arrived');
  });

  it('is "near" up to three times the radius, "far" beyond', () => {
    expect(evaluateArrival({ distanceM: 101, accuracyM: 15, radiusM })).toBe('near');
    expect(evaluateArrival({ distanceM: 300, accuracyM: 15, radiusM })).toBe('near');
    expect(evaluateArrival({ distanceM: 301, accuracyM: 15, radiusM })).toBe('far');
  });

  it('refuses to decide on a weak GPS fix, even when the dot is on the gate', () => {
    expect(evaluateArrival({ distanceM: 5, accuracyM: POOR_ACCURACY_M + 1, radiusM })).toBe('weak-gps');
  });

  it('treats missing numbers as weak GPS', () => {
    expect(evaluateArrival({ distanceM: NaN, accuracyM: 10, radiusM })).toBe('weak-gps');
    expect(evaluateArrival({ distanceM: 10, accuracyM: NaN, radiusM })).toBe('weak-gps');
  });

  it('requires more than one confirming reading', () => {
    expect(ARRIVAL_CONFIRMATIONS).toBeGreaterThanOrEqual(2);
  });
});

describe('formatting', () => {
  it('formats distance', () => {
    expect(formatDistance(2)).toBe('5 m');
    expect(formatDistance(87)).toBe('85 m');
    expect(formatDistance(999)).toBe('1000 m');
    expect(formatDistance(3420)).toBe('3.4 km');
    expect(formatDistance(25_300)).toBe('25 km');
  });

  it('formats duration', () => {
    expect(formatDuration(10)).toBe('1 min');
    expect(formatDuration(540)).toBe('9 min');
    expect(formatDuration(3900)).toBe('1 h 5 min');
    expect(formatDuration(7200)).toBe('2 h');
  });
});

describe('externalDirectionsUrl', () => {
  it('points a maps app at the gate coordinates', () => {
    expect(externalDirectionsUrl({ lat: 7.7345, lng: 8.5221 })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=7.7345,8.5221&travelmode=driving',
    );
  });
});
