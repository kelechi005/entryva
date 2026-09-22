import * as bcrypt from 'bcrypt';

// Passwords are low-entropy and human-chosen, unlike the invitation
// tokens/codes in token.util.ts — bcrypt's deliberate slowness is the
// right tool here, SHA-256 would not be.
const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
