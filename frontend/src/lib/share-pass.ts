// Builds the one-tap WhatsApp and SMS messages for a new pass. Both open the
// resident's own app with the message ready: no provider, no cost, nothing
// sent from our server.
import { formatShortVisitWindow } from '@/lib/format';
import type { CreatedInvitation } from '@/types/invitation';

/** Used when a number has no country code. Nigeria. */
export const DEFAULT_COUNTRY_CODE = '234';

/**
 * "0801 234 5678", "+234 801 234 5678" and "801 234 5678" all become
 * "2348012345678". Returns null when it doesn't look like a phone number.
 */
export function toInternationalDigits(
  raw: string | null | undefined,
  countryCode: string = DEFAULT_COUNTRY_CODE,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (!hasPlus) {
    if (digits.startsWith('00')) digits = digits.slice(2);
    else if (digits.startsWith('0')) digits = countryCode + digits.slice(1);
    else if (digits.length === 10 && /^[789]/.test(digits)) digits = countryCode + digits;
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || 'there';
}

export function buildWhatsAppText(inv: CreatedInvitation): string {
  return [
    `Hi ${firstName(inv.visitorName)}, ${inv.residentName} (${inv.apartmentLabel}) has invited you.`,
    `When: ${formatShortVisitWindow(inv.validFrom, inv.validUntil)}`,
    `Your pass: ${inv.shareUrl}`,
    `Pass code: ${inv.displayCode}`,
    'Show the QR code or the pass code to security at the gate.',
  ].join('\n');
}

/** The pass code comes first so it is useful even if the link can't be opened. */
export function buildSmsText(inv: CreatedInvitation): string {
  return (
    `Visitor pass from ${inv.residentName}: code ${inv.displayCode}, ` +
    `${formatShortVisitWindow(inv.validFrom, inv.validUntil)}. ` +
    `Show it to security at the gate. Pass link: ${inv.shareUrl}`
  );
}

export function buildWhatsAppUrl(inv: CreatedInvitation): string {
  const number = toInternationalDigits(inv.visitorPhone);
  const text = encodeURIComponent(buildWhatsAppText(inv));
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
}

/** "?&body=" is the form that works on both iPhone and Android. */
export function buildSmsUrl(inv: CreatedInvitation): string {
  const number = toInternationalDigits(inv.visitorPhone);
  const body = encodeURIComponent(buildSmsText(inv));
  return `sms:${number ? `+${number}` : ''}?&body=${body}`;
}
