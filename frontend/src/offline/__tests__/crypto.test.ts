/** @jest-environment node */

import { sha256Hex, canonicalizeForSigning, importOfflinePublicKey, verifyManifestEntry } from '../crypto';
import { generateTestKeyPair, signEntry } from '@/test-utils/offline-signing';

describe('sha256Hex', () => {
  it('matches the known SHA-256 hash for a fixed input (backend parity)', async () => {
    // Node: crypto.createHash('sha256').update('ABC123').digest('hex')
    const hash = await sha256Hex('ABC123');
    expect(hash).toBe('e0bebd22819993425814866b62701e2919ea26f1370499c1037b53b9d49c2c8a');
  });

  it('produces different hashes for different inputs', async () => {
    const a = await sha256Hex('token-one');
    const b = await sha256Hex('token-two');
    expect(a).not.toBe(b);
  });

  it('is deterministic', async () => {
    const a = await sha256Hex('same-value');
    const b = await sha256Hex('same-value');
    expect(a).toBe(b);
  });
});

describe('canonicalizeForSigning', () => {
  it('produces identical output regardless of key insertion order', () => {
    const a = canonicalizeForSigning({ b: 1, a: 2, c: { z: 1, y: 2 } });
    const b = canonicalizeForSigning({ a: 2, c: { y: 2, z: 1 }, b: 1 });
    expect(a).toBe(b);
  });

  it('sorts keys recursively inside arrays of objects', () => {
    const a = canonicalizeForSigning({ list: [{ b: 1, a: 2 }] });
    expect(a).toBe('{"list":[{"a":2,"b":1}]}');
  });

  it('does not sort array element order itself, only object keys', () => {
    const a = canonicalizeForSigning({ list: [3, 1, 2] });
    expect(a).toBe('{"list":[3,1,2]}');
  });
});

describe('verifyManifestEntry (real ECDSA P-256, IEEE P1363)', () => {
  it('accepts a signature produced the same way the backend produces it', async () => {
    const { privateKeyPem, publicKeyPem } = generateTestKeyPair();
    const unsigned = { invitationId: 'inv_1', secureTokenHash: 'abc', status: 'ACTIVE' };
    const signed = signEntry(unsigned, privateKeyPem);

    const publicKey = await importOfflinePublicKey(publicKeyPem);
    const ok = await verifyManifestEntry(unsigned, signed.signature, publicKey);
    expect(ok).toBe(true);
  });

  it('rejects a signature if any field of the payload is tampered with after signing', async () => {
    const { privateKeyPem, publicKeyPem } = generateTestKeyPair();
    const unsigned = { invitationId: 'inv_1', status: 'ACTIVE' };
    const signed = signEntry(unsigned, privateKeyPem);

    const tampered = { ...unsigned, status: 'REVOKED' }; // flip status post-signing
    const publicKey = await importOfflinePublicKey(publicKeyPem);
    const ok = await verifyManifestEntry(tampered, signed.signature, publicKey);
    expect(ok).toBe(false);
  });

  it('rejects a signature verified against the wrong public key', async () => {
    const pairA = generateTestKeyPair();
    const pairB = generateTestKeyPair();
    const unsigned = { invitationId: 'inv_1', status: 'ACTIVE' };
    const signed = signEntry(unsigned, pairA.privateKeyPem);

    const wrongPublicKey = await importOfflinePublicKey(pairB.publicKeyPem);
    const ok = await verifyManifestEntry(unsigned, signed.signature, wrongPublicKey);
    expect(ok).toBe(false);
  });

  it('rejects garbage/corrupted signature bytes without throwing', async () => {
    const { publicKeyPem } = generateTestKeyPair();
    const publicKey = await importOfflinePublicKey(publicKeyPem);
    const ok = await verifyManifestEntry({ a: 1 }, 'not-a-real-base64-signature!!', publicKey);
    expect(ok).toBe(false);
  });
});
