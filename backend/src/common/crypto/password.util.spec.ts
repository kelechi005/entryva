import { hashPassword, verifyPassword } from './password.util';

describe('password.util', () => {
  it('hashes a password to something other than the plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toBe('correct horse battery staple');
    expect(hash.startsWith('$2')).toBe(true); // bcrypt hash prefix
  });

  it('produces a different hash each time (random salt) even for the same password', async () => {
    const [a, b] = await Promise.all([hashPassword('same-password'), hashPassword('same-password')]);
    expect(a).not.toBe(b);
  });

  it('verifies a correct password against its hash', async () => {
    const hash = await hashPassword('my-real-password');
    await expect(verifyPassword('my-real-password', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('my-real-password');
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('rejects an empty password against a real hash', async () => {
    const hash = await hashPassword('my-real-password');
    await expect(verifyPassword('', hash)).resolves.toBe(false);
  });
});
