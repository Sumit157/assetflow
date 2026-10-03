import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { env } from '../config/env.js';
import { signAccessToken, verifyAccessToken } from './jwt.js';

describe('access tokens', () => {
  it('round-trips an authentication context', () => {
    const token = signAccessToken({
      userId: 'user-1',
      sessionId: 'family-1',
      orgId: 'org-1',
      role: 'ORG_ADMIN',
    });
    expect(verifyAccessToken(token)).toEqual({
      userId: 'user-1',
      sessionId: 'family-1',
      orgId: 'org-1',
      role: 'ORG_ADMIN',
    });
  });

  it('supports sessions without an organisation', () => {
    const token = signAccessToken({ userId: 'user-2', sessionId: 'family-2' });
    const claims = verifyAccessToken(token);
    expect(claims?.userId).toBe('user-2');
    expect(claims?.orgId).toBeUndefined();
  });

  it('rejects tampered tokens', () => {
    const token = signAccessToken({ userId: 'user-3', sessionId: 'family-3' });
    const [header, payload, signature] = token.split('.');
    const forged = `${header}.${payload}.AAAA${signature}`;
    expect(verifyAccessToken(forged)).toBeNull();
  });

  it('rejects tokens signed with another secret', () => {
    const token = jwt.sign({ sub: 'user-4', sid: 'family-4' }, 'some-other-secret', {
      algorithm: 'HS256',
      expiresIn: 600,
    });
    expect(verifyAccessToken(token)).toBeNull();
  });

  it('rejects expired tokens', () => {
    const token = jwt.sign({ sub: 'user-5', sid: 'family-5' }, env.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: -10,
    });
    expect(verifyAccessToken(token)).toBeNull();
  });

  it('ignores forged role claims for unassignable roles', () => {
    const token = jwt.sign({ sub: 'user-6', sid: 'family-6', role: 'NOT_A_ROLE' }, env.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: 600,
    });
    expect(verifyAccessToken(token)?.role).toBeUndefined();
  });
});
