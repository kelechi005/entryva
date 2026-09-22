import { generateSecureToken, generateDisplayCode, hashSecret } from './token.util';

describe('token.util', () => {
  describe('generateSecureToken', () => {
    it('produces a high-entropy, URL-safe token', () => {
      const token = generateSecureToken();
      // base64url of 32 random bytes -> 43 chars, no padding.
      expect(token).toHaveLength(43);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('never repeats across calls (collision would be catastrophic)', () => {
      const tokens = new Set(Array.from({ length: 1000 }, () => generateSecureToken()));
      expect(tokens.size).toBe(1000);
    });

    it('is never derived from visitor/resident data (CLAUDE.md §8.1) — takes no input', () => {
      // Structural guarantee: the function signature accepts no arguments,
      // so there is no code path by which PII could leak into the token.
      expect(generateSecureToken.length).toBe(0);
    });
  });

  describe('generateDisplayCode', () => {
    it('defaults to 6 characters', () => {
      expect(generateDisplayCode()).toHaveLength(6);
    });

    it('respects a custom length', () => {
      expect(generateDisplayCode(8)).toHaveLength(8);
    });

    it('never contains visually ambiguous characters (0/O, 1/I/L)', () => {
      for (let i = 0; i < 200; i += 1) {
        const code = generateDisplayCode(10);
        expect(code).not.toMatch(/[01IOL]/);
      }
    });

    it('is not a sequential or predictable value across calls', () => {
      const codes = new Set(Array.from({ length: 500 }, () => generateDisplayCode()));
      // With 32^6 possible codes, 500 draws should essentially never collide.
      expect(codes.size).toBe(500);
    });
  });

  describe('hashSecret', () => {
    it('is deterministic for the same input', () => {
      expect(hashSecret('abc123')).toBe(hashSecret('abc123'));
    });

    it('produces different hashes for different inputs', () => {
      expect(hashSecret('abc123')).not.toBe(hashSecret('abc124'));
    });

    it('never returns the plaintext input', () => {
      const secret = 'super-secret-token-value';
      expect(hashSecret(secret)).not.toContain(secret);
    });

    it('produces a fixed-length hex digest (sha256 -> 64 hex chars)', () => {
      expect(hashSecret('x')).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
