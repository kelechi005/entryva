import { formatShortVisitWindow } from '../format';

const iso = (d: Date) => d.toISOString();

describe('formatShortVisitWindow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 12, 10, 0));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('says Today for a visit later today and drops the :00', () => {
    const text = formatShortVisitWindow(iso(new Date(2026, 8, 12, 16, 0)), iso(new Date(2026, 8, 12, 20, 0)));
    expect(text.startsWith('Today')).toBe(true);
    expect(text).not.toContain(':00');
    expect(text.length).toBeLessThan(30);
  });

  it('says Tomorrow and Yesterday', () => {
    expect(
      formatShortVisitWindow(iso(new Date(2026, 8, 13, 9, 30)), iso(new Date(2026, 8, 13, 11, 0))).startsWith('Tomorrow'),
    ).toBe(true);
    expect(
      formatShortVisitWindow(iso(new Date(2026, 8, 11, 9, 0)), iso(new Date(2026, 8, 11, 11, 0))).startsWith('Yesterday'),
    ).toBe(true);
  });

  it('keeps minutes when they are not zero', () => {
    const text = formatShortVisitWindow(iso(new Date(2026, 8, 12, 16, 30)), iso(new Date(2026, 8, 12, 20, 0)));
    expect(text).toContain(':30');
  });

  it('uses a short day and date for other days', () => {
    const text = formatShortVisitWindow(iso(new Date(2026, 8, 20, 16, 0)), iso(new Date(2026, 8, 20, 20, 0)));
    expect(text).not.toMatch(/Today|Tomorrow|Yesterday/);
    expect(text).toContain('20');
    expect(text.length).toBeLessThan(40);
  });
});
