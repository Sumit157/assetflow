import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });

  it('produces a unique salt per hash', async () => {
    const a = await hashPassword('same password');
    const b = await hashPassword('same password');
    expect(a).not.toBe(b);
    expect(await verifyPassword('same password', a)).toBe(true);
    expect(await verifyPassword('same password', b)).toBe(true);
  });

  it('rejects malformed stored hashes without throwing', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$10$abc')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$abc$8$1$c2FsdA==$aGFzaA==')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$32768$8$1$$')).toBe(false);
  });

  it('records algorithm parameters so cost can be upgraded later', async () => {
    const hash = await hashPassword('upgrade path');
    expect(hash.startsWith('scrypt$32768$8$1$')).toBe(true);
  });
});
