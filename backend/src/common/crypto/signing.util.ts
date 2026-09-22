import { createSign, createVerify, createPrivateKey, createPublicKey, KeyObject } from 'crypto';

/**
 * CLAUDE.md §25: "Offline invitations must use signed data or another
 * cryptographically verifiable mechanism. Do not trust arbitrary
 * client-side JSON." A gate device's IndexedDB is fully writable by
 * anyone with access to the device (or just devtools), so the manifest
 * handed to it must be signed with a key the client never holds, and the
 * client must re-verify that signature on every read — not only once
 * when the record was first cached — or a local edit to IndexedDB would
 * be indistinguishable from a genuine server record.
 *
 * ECDSA (asymmetric) rather than HMAC: HMAC needs the same secret on
 * server and client, and a secret shipped to every gate device isn't a
 * secret. With ECDSA the private key never leaves the server; the public
 * key is safe to publish to devices, which can verify signatures but
 * never forge new ones.
 *
 * Signatures are produced in IEEE P1363 (raw r||s) encoding rather than
 * the Node default (DER) specifically so the frontend can verify them
 * directly with SubtleCrypto's ECDSA verify, which expects raw r||s and
 * has no built-in DER parser.
 */

const CURVE = 'P-256';

function loadPrivateKey(): KeyObject {
  const b64 = process.env.OFFLINE_SIGNING_PRIVATE_KEY_B64;
  if (!b64) {
    throw new Error(
      'OFFLINE_SIGNING_PRIVATE_KEY_B64 is not set. See .env.example for how to generate an ' +
        'offline-signing keypair (openssl ecparam -name prime256v1 -genkey -noout, then base64 it).',
    );
  }
  return createPrivateKey(Buffer.from(b64, 'base64').toString('utf8'));
}

let cachedPublicKeyPem: string | null = null;

/** The PEM the frontend imports via SubtleCrypto to verify manifest signatures. */
export function getOfflineSigningPublicKeyPem(): string {
  if (cachedPublicKeyPem) return cachedPublicKeyPem;
  const b64 = process.env.OFFLINE_SIGNING_PUBLIC_KEY_B64;
  if (!b64) {
    throw new Error(
      'OFFLINE_SIGNING_PUBLIC_KEY_B64 is not set. See .env.example for how to generate an ' +
        'offline-signing keypair.',
    );
  }
  cachedPublicKeyPem = Buffer.from(b64, 'base64').toString('utf8');
  return cachedPublicKeyPem;
}

/**
 * Stable JSON stringification (keys sorted, recursively) so the same
 * logical object always signs/verifies to identical bytes regardless of
 * property insertion order. The frontend implements the exact same
 * function (see frontend/src/offline/crypto.ts) — any drift between the
 * two breaks every signature check.
 */
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

export function signOfflineManifestEntry(canonical: string): string {
  const signer = createSign('SHA256');
  signer.update(canonical);
  signer.end();
  return signer.sign({ key: loadPrivateKey(), dsaEncoding: 'ieee-p1363' }).toString('base64');
}

/**
 * Not on the hot path (verification happens client-side, offline, by
 * design) — kept so the server itself can sanity-check a manifest entry
 * from tooling or tests without needing a browser.
 */
export function verifyOfflineManifestEntrySignature(
  canonical: string,
  signatureBase64: string,
): boolean {
  // A malformed signature (wrong length, corrupted base64, truncated
  // r||s pair) must be treated as "verification failed", not as an
  // exception the caller has to remember to catch. Since the entire
  // point of this function is detecting a tampered/corrupted local
  // IndexedDB record, throwing here would make tamper detection itself
  // crash the gate-scanner UI instead of just rejecting the scan.
  try {
    const publicKey = createPublicKey(getOfflineSigningPublicKeyPem());
    const verifier = createVerify('SHA256');
    verifier.update(canonical);
    verifier.end();
    return verifier.verify(
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signatureBase64, 'base64'),
    );
  } catch {
    return false;
  }
}

export const OFFLINE_SIGNING_CURVE = CURVE;
