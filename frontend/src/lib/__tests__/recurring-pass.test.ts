import {
  addDaysKey,
  formatDays,
  formatWindow,
  isRecurringQr,
  localDateKey,
  passLink,
  passWhatsAppUrl,
} from '../recurring-pass';

describe('recurring pass helpers', () => {
  it('describes the weekdays', () => {
    expect(formatDays([0, 1, 2, 3, 4, 5, 6])).toBe('Every day');
    expect(formatDays([5, 4, 3, 2, 1])).toBe('Mon to Fri');
    expect(formatDays([5, 1, 3])).toBe('Mon, Wed, Fri');
    expect(formatDays([0, 6])).toBe('Sat, Sun');
  });

  it('describes the hours', () => {
    expect(formatWindow(540, 960)).toBe('09:00 to 16:00');
  });

  it('tells a recurring QR from an invitation QR', () => {
    expect(isRecurringQr('abcdefghijklmnop~ABCDEF1234')).toBe(true);
    expect(isRecurringQr('abcdefghijklmnop')).toBe(false);
  });

  it('builds the pass link without a double slash', () => {
    expect(passLink('https://entryva.tech/', 'tok')).toBe('https://entryva.tech/pass/tok');
  });

  it('builds a WhatsApp message to the right number', () => {
    const url = passWhatsAppUrl({
      name: 'Mama Ngozi',
      phone: '0801 234 5678',
      link: 'https://entryva.tech/pass/tok',
      residentName: 'Ada Eze',
    });
    expect(url.startsWith('https://wa.me/2348012345678?text=')).toBe(true);
    const text = decodeURIComponent(url.split('text=')[1]);
    expect(text).toContain('Hi Mama');
    expect(text).toContain('https://entryva.tech/pass/tok');
    expect(passWhatsAppUrl({ name: 'X', phone: null, link: 'l' }).startsWith('https://wa.me/?text=')).toBe(true);
  });

  it('works with dates as plain keys', () => {
    expect(localDateKey(new Date(2026, 9, 5))).toBe('2026-10-05');
    expect(addDaysKey('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysKey('2026-10-05', 29)).toBe('2026-11-03');
  });
});
