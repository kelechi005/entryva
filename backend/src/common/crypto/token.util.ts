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
 * Derives the visitor-facing display code from the secure token itself,
 * instead of independent randomness. This lets the public invite page
 * (InvitationsService.findPublicByToken) recompute and show the same
 * code every time the visitor reopens their link, without ever storing
 * a second plaintext secret server-side -- only displayCodeHash is
 * persisted, exactly as before.
 *
 * Safe specifically because a visitor holding the link already holds
 * the full secureToken (it's embedded in the URL), which is strictly
 * more powerful than the 6-character code. The derivation only works
 * one direction (token -> code); there is no way back from the code to
 * the token, so this adds no new exposure beyond what holding the link
 * already grants.
 *
 * The fixed 'display-code:' prefix domain-separates this from
 * hashSecret(token) (used to look the invitation up by its raw token)
 * so the two hashes never collide or become interchangeable.
 */
export function deriveDisplayCode(secureToken: string, length = 6): string {
  const digest = createHash('sha256').update(`display-code:${secureToken}`).digest();
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += DISPLAY_CODE_ALPHABET[digest[i] % DISPLAY_CODE_ALPHABET.length];
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
