import {
  buildSmsText,
  buildSmsUrl,
  buildWhatsAppText,
  buildWhatsAppUrl,
  toInternationalDigits,
} from '../share-pass';
import type { CreatedInvitation } from '@/types/invitation';

const invitation: CreatedInvitation = {
  id: 'inv1',
  visitorName: 'Tom & Jerry Okafor',
  visitorPhone: '0801 234 5678',
  residentName: 'Ada Eze',
  apartmentLabel: 'B-204',
  validFrom: new Date(2026, 9, 5, 16, 0).toISOString(),
  validUntil: new Date(2026, 9, 5, 20, 0).toISOString(),
  status: 'ACTIVE',
  displayCode: 'ABC123',
  shareUrl: 'https://entryva.tech/invite/secret-token',
};

describe('toInternationalDigits', () => {
  it('turns Nigerian number styles into one international form', () => {
    expect(toInternationalDigits('+234 801 234 5678')).toBe('2348012345678');
    expect(toInternationalDigits('0801 234 5678')).toBe('2348012345678');
    expect(toInternationalDigits('801 234 5678')).toBe('2348012345678');
    expect(toInternationalDigits('234 801 234 5678')).toBe('2348012345678');
  });

  it('keeps numbers from other countries', () => {
    expect(toInternationalDigits('0044 20 7946 0958')).toBe('442079460958');
    expect(toInternationalDigits('+44 20 7946 0958')).toBe('442079460958');
  });

  it('returns null for empty or too-short input', () => {
    expect(toInternationalDigits('')).toBeNull();
    expect(toInternationalDigits(null)).toBeNull();
    expect(toInternationalDigits(undefined)).toBeNull();
    expect(toInternationalDigits('123')).toBeNull();
  });
});

describe('WhatsApp share', () => {
  it('opens a chat with the visitor and carries the message', () => {
    const url = buildWhatsAppUrl(invitation);
    expect(url.startsWith('https://wa.me/2348012345678?text=')).toBe(true);
    const text = decodeURIComponent(url.split('text=')[1]);
    expect(text).toBe(buildWhatsAppText(invitation));
    expect(text).toContain('Hi Tom');
    expect(text).toContain('ABC123');
    expect(text).toContain('https://entryva.tech/invite/secret-token');
  });

  it('opens the contact picker when there is no phone number', () => {
    const url = buildWhatsAppUrl({ ...invitation, visitorPhone: undefined });
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
  });
});

describe('SMS share', () => {
  it('addresses the visitor and puts the code before the link', () => {
    const url = buildSmsUrl(invitation);
    expect(url.startsWith('sms:+2348012345678?&body=')).toBe(true);
    const text = buildSmsText(invitation);
    expect(text.indexOf('ABC123')).toBeLessThan(text.indexOf('https://'));
    expect(decodeURIComponent(url.split('body=')[1])).toBe(text);
  });

  it('works without a phone number', () => {
    expect(buildSmsUrl({ ...invitation, visitorPhone: '' }).startsWith('sms:?&body=')).toBe(true);
  });
});
