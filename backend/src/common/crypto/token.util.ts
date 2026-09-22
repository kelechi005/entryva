import { randomBytes, createHash } from 'crypto';

// Characters chosen to avoid visual ambiguity when read aloud or typed
// manually at a gate (no 0/O, 1/I/L).
const DISPLAY_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Generates the opaque, high-entropy token embedded in the QR code.
 * Never derive this from visitor/resident data — see CLAUDE.md \u00a78.1.
 */
export function generateSecureToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Generates the short human-readable code shown alongside the QR. */
export function generateDisplayCode(length = 6): string {
  const bytes = randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += DISPLAY_CODE_ALPHABET[bytes[i] % DISPLAY_CODE_ALPHABET.length];
  }
  return code;
}

/**
 * One-way hash for tokens/codes. SHA-256 (not bcrypt) is appropriate here:
 * these are high-entropy, machine-generated secrets rather than
 * low-entropy, human-chosen passwords, so a slow KDF isn't needed and
 * would only hurt gate-scan latency.
 */
export function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
