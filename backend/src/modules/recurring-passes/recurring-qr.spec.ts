import { addDays, isRecurringQr, parseRecurringQr, phoneKey } from './recurring-qr';

const TOKEN = 'abcdefghijklmnopqrstuvwx12345678';

describe('recurring QR', () => {
  it('splits the token and the code, from a bare value or a full link', () => {
    expect(parseRecurringQr(`${TOKEN}~ABCDEF1234`)).toEqual({ token: TOKEN, code: 'ABCDEF1234' });
    expect(parseRecurringQr(`https://entryva.tech/pass/${TOKEN}~ABCDEF1234`)).toEqual({
      token: TOKEN,
      code: 'ABCDEF1234',
    });
  });

  it('refuses anything that is not shaped like a recurring QR', () => {
    for (const bad of ['', TOKEN, `${TOKEN}~`, `~ABCDEF1234`, `short~ABCDEF1234`, `${TOKEN}~x`, `${TOKEN}~AB CD EF12`]) {
      expect(parseRecurringQr(bad)).toBeNull();
    }
  });

  it('tells recurring QRs from invitation QRs', () => {
    expect(isRecurringQr(`${TOKEN}~ABCDEF1234`)).toBe(true);
    expect(isRecurringQr(TOKEN)).toBe(false);
  });

  it('gives one phone key for one number written three ways', () => {
    const keys = ['0801 234 5678', '+234 801 234 5678', '2348012345678'].map(phoneKey);
    expect(new Set(keys).size).toBe(1);
    expect(phoneKey('123')).toBeNull();
    expect(phoneKey(null)).toBeNull();
  });

  it('adds days across month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-10-05', -5)).toBe('2026-09-30');
  });
});
