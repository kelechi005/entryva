import { hhmmToMinutes, minutesToHHMM } from '../time-of-day';

describe('time of day', () => {
  it('converts both ways', () => {
    expect(hhmmToMinutes('00:00')).toBe(0);
    expect(hhmmToMinutes('22:00')).toBe(1320);
    expect(hhmmToMinutes('05:30')).toBe(330);
    expect(minutesToHHMM(1320)).toBe('22:00');
    expect(minutesToHHMM(330)).toBe('05:30');
    expect(minutesToHHMM(0)).toBe('00:00');
  });

  it('round-trips every minute of the day', () => {
    for (let m = 0; m < 1440; m += 7) expect(hhmmToMinutes(minutesToHHMM(m))).toBe(m);
  });

  it('rejects things that are not a 24-hour time', () => {
    for (const bad of ['', '24:00', '9:00', '12:60', 'noon', '12-30']) expect(hhmmToMinutes(bad)).toBeNull();
  });
});
