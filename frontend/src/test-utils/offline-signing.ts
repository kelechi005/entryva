// Test-only mirror of backend/src/common/crypto/signing.util.ts. Deliberately
// duplicated (rather than imported across the frontend/backend boundary,
// which don't share a module graph) so that offline/*.test.ts can build
// *real* ECDSA P-256, IEEE P1363-encoded signatures the exact same way the
// server does, and prove that src/offline/crypto.ts verifies them
// correctly — rather than mocking crypto.subtle.verify and only proving
// the mock was called.

import { createSign, createPrivateKey, createPublicKey, generateKeyPairSync } from 'crypto';

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

// Must match frontend/src/offline/crypto.ts canonicalizeForSigning() and
// backend/src/common/crypto/signing.util.ts canonicalizeForSigning() byte
// for byte.
export function canonicalizeForSigning(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

export interface TestKeyPair {
  privateKeyPem: string;
  publicKeyPem: string;
}

export function generateTestKeyPair(): TestKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  } as any);
  return { privateKeyPem: privateKey as unknown as string, publicKeyPem: publicKey as unknown as string };
}

/** Signs an already-canonicalized string, IEEE P1363 (raw r||s) — same
 * encoding the backend uses so SubtleCrypto.verify() can consume it
 * directly with no DER parsing. */
export function signCanonical(canonical: string, privateKeyPem: string): string {
  const signer = createSign('SHA256');
  signer.update(canonical);
  signer.end();
  const key = createPrivateKey(privateKeyPem);
  return signer.sign({ key, dsaEncoding: 'ieee-p1363' }).toString('base64');
}

/** Convenience: canonicalize + sign an unsigned manifest entry object,
 * returning the full signed entry ready to hand to db.ts / verify-offline.ts. */
export function signEntry<T extends Record<string, unknown>>(
  unsigned: T,
  privateKeyPem: string,
): T & { signature: string } {
  const canonical = canonicalizeForSigning(unsigned);
  const signature = signCanonical(canonical, privateKeyPem);
  return { ...unsigned, signature };
}

export function assertPublicKeyImportable(publicKeyPem: string): void {
  // Throws if the PEM is malformed — fail fast in test setup rather than
  // deep inside a subtle.importKey rejection.
  createPublicKey(publicKeyPem);
}
