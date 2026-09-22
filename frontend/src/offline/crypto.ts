// CLAUDE.md §25: "Offline invitations must use signed data or another
// cryptographically verifiable mechanism. Do not trust arbitrary
// client-side JSON." Everything here runs in the browser against data
// that lives in IndexedDB — fully editable via devtools by anyone with
// the device — so every read must re-verify the ECDSA signature the
// server attached, not just trust that it once passed a check at fetch
// time. See backend/src/common/crypto/signing.util.ts for the server
// side of this; the two files must stay in lockstep.

/** SHA-256 of a UTF-8 string, lowercase hex — must match the backend's
 * `hashSecret()` (Node's `createHash('sha256').update(v).digest('hex')`)
 * byte-for-byte, since this is how a scanned token/code is matched
 * against a cached `secureTokenHash`/`displayCodeHash` without the
 * device ever knowing the original plaintext round-trips through the
 * server. */
export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Must be byte-identical to canonicalizeForSigning() in
 * backend/src/common/crypto/signing.util.ts — recursively sorted keys,
 * no extra whitespace. Any drift here silently breaks every signature
 * check. */
export function canonicalizeForSigning(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function base64ToBytes(b64: string): ArrayBuffer {
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  return base64ToBytes(b64);
}

/** Imports the server's ECDSA P-256 public key (SPKI PEM, as returned by
 * GET /offline-sync/manifest) for use with verifyManifestEntry(). */
export async function importOfflinePublicKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    pemToDer(pem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
}

/**
 * Verifies a manifest entry's signature against the imported public key.
 * `entry` must be the exact unsigned payload the server signed (i.e. the
 * manifest entry object with the `signature` field removed) — see
 * OfflineManifestEntry in backend/src/modules/offline-sync/offline-sync.service.ts.
 * The signature is IEEE P1363 (raw r||s), matching what SubtleCrypto's
 * ECDSA verify expects and what the backend produces via
 * `dsaEncoding: 'ieee-p1363'`.
 */
export async function verifyManifestEntry(
  entry: Record<string, unknown>,
  signatureBase64: string,
  publicKey: CryptoKey,
): Promise<boolean> {
  // Everything below — including decoding signatureBase64 — must be
  // inside the try/catch. signatureBase64 comes from IndexedDB, which is
  // fully writable by anyone with device access (see file header), so a
  // corrupted or hand-edited signature string (invalid base64 chars,
  // wrong length, truncated r||s) is exactly the input this function
  // exists to reject. atob() throws on invalid characters, and
  // subtle.verify() can throw on malformed key material — both must be
  // treated as "verification failed", not as an unhandled exception that
  // would crash the gate-scanner UI mid-scan.
  try {
    const canonical = canonicalizeForSigning(entry);
    const data = new TextEncoder().encode(canonical);
    const signature = base64ToBytes(signatureBase64);
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      signature,
      data,
    );
  } catch {
    return false;
  }
}
