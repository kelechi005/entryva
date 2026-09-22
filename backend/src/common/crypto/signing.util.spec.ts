import { generateKeyPairSync } from 'crypto';

// These env vars must be set before signing.util.ts's internal getters are
// first invoked, since getOfflineSigningPublicKeyPem() caches the PEM in a
// module-level variable on first call.
const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
process.env.OFFLINE_SIGNING_PRIVATE_KEY_B64 = Buffer.from(privateKey).toString('base64');
process.env.OFFLINE_SIGNING_PUBLIC_KEY_B64 = Buffer.from(publicKey).toString('base64');

// A second, unrelated keypair used to simulate a forged/attacker signature.
const attackerKeys = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

import {
  canonicalizeForSigning,
  signOfflineManifestEntry,
  verifyOfflineManifestEntrySignature,
  getOfflineSigningPublicKeyPem,
} from './signing.util';
import { createSign } from 'crypto';

describe('signing.util', () => {
  describe('canonicalizeForSigning', () => {
    it('produces identical output regardless of key insertion order', () => {
      const a = canonicalizeForSigning({ b: 2, a: 1, c: { z: 1, y: 2 } });
      const b = canonicalizeForSigning({ a: 1, c: { y: 2, z: 1 }, b: 2 });
      expect(a).toBe(b);
    });

    it('sorts keys deeply, including inside arrays of objects', () => {
      const a = canonicalizeForSigning({ list: [{ b: 1, a: 2 }] });
      const b = canonicalizeForSigning({ list: [{ a: 2, b: 1 }] });
      expect(a).toBe(b);
    });

    it('produces different output for genuinely different data', () => {
      const a = canonicalizeForSigning({ status: 'ACTIVE' });
      const b = canonicalizeForSigning({ status: 'USED' });
      expect(a).not.toBe(b);
    });
  });

  describe('sign + verify round trip', () => {
    const entry = {
      invitationId: 'inv_123',
      secureTokenHash: 'abc',
      displayCodeHash: 'def',
      status: 'ACTIVE',
    };

    it('a signature produced by the real key verifies against the real public key', () => {
      const canonical = canonicalizeForSigning(entry);
      const signature = signOfflineManifestEntry(canonical);
      expect(verifyOfflineManifestEntrySignature(canonical, signature)).toBe(true);
    });

    it('rejects a signature if even one field in the payload is tampered with', () => {
      const canonical = canonicalizeForSigning(entry);
      const signature = signOfflineManifestEntry(canonical);

      // Simulate a gate device's local IndexedDB record being edited,
      // e.g. flipping status back from USED to ACTIVE to replay an
      // already-consumed one-time invitation.
      const tamperedCanonical = canonicalizeForSigning({ ...entry, status: 'REVOKED' });
      expect(verifyOfflineManifestEntrySignature(tamperedCanonical, signature)).toBe(false);
    });

    it('rejects a signature produced by a different (attacker) private key', () => {
      const canonical = canonicalizeForSigning(entry);

      const forgedSigner = createSign('SHA256');
      forgedSigner.update(canonical);
      forgedSigner.end();
      const forgedSignature = forgedSigner
        .sign({ key: attackerKeys.privateKey, dsaEncoding: 'ieee-p1363' })
        .toString('base64');

      expect(verifyOfflineManifestEntrySignature(canonical, forgedSignature)).toBe(false);
    });

    it('rejects a garbage/malformed signature rather than throwing', () => {
      const canonical = canonicalizeForSigning(entry);
      expect(() =>
        verifyOfflineManifestEntrySignature(canonical, Buffer.from('not-a-signature').toString('base64')),
      ).not.toThrow();
      expect(
        verifyOfflineManifestEntrySignature(canonical, Buffer.from('not-a-signature').toString('base64')),
      ).toBe(false);
    });
  });

  describe('getOfflineSigningPublicKeyPem', () => {
    it('returns a PEM string safe to publish to gate devices', () => {
      const pem = getOfflineSigningPublicKeyPem();
      expect(pem).toContain('BEGIN PUBLIC KEY');
      expect(pem).not.toContain('PRIVATE KEY');
    });
  });
});
