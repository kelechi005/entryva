import { formatTime12, from12h, minuteOptions, to12h } from '../time-format';

describe('time format', () => {
  it('reads 24-hour times as 12-hour', () => {
    expect(to12h('00:00')).toEqual({ hour: 12, minute: 0, pm: false });
    expect(to12h('09:05')).toEqual({ hour: 9, minute: 5, pm: false });
    expect(to12h('12:00')).toEqual({ hour: 12, minute: 0, pm: true });
    expect(to12h('21:14')).toEqual({ hour: 9, minute: 14, pm: true });
    expect(to12h('23:59')).toEqual({ hour: 11, minute: 59, pm: true });
  });

  it('refuses things that are not a time', () => {
    for (const bad of ['', '24:00', '9:00', '12:60', 'noon']) expect(to12h(bad)).toBeNull();
  });

  it('goes back to 24-hour, including the midnight and noon cases', () => {
    expect(from12h({ hour: 12, minute: 0, pm: false })).toBe('00:00');
    expect(from12h({ hour: 12, minute: 30, pm: true })).toBe('12:30');
    expect(from12h({ hour: 9, minute: 14, pm: true })).toBe('21:14');
    expect(from12h({ hour: 1, minute: 5, pm: false })).toBe('01:05');
  });

  it('round-trips every minute of the day', () => {
    for (let m = 0; m < 1440; m++) {
      const v = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      expect(from12h(to12h(v)!)).toBe(v);
    }
  });

  it('writes a readable time', () => {
    expect(formatTime12('21:14')).toBe('9:14 PM');
    expect(formatTime12('00:05')).toBe('12:05 AM');
    expect(formatTime12('')).toBe('');
  });

  it('offers the steps and keeps an off-step minute', () => {
    expect(minuteOptions(15, 0)).toEqual([0, 15, 30, 45]);
    expect(minuteOptions(15, 14)).toEqual([0, 14, 15, 30, 45]);
    expect(minuteOptions(5, 5)).toHaveLength(12);
    expect(minuteOptions(0, 0).length).toBeGreaterThan(1);
  });
});
