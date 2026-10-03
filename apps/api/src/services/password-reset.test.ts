import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../test-support/build-app.js';
import { connectTestDatabase, disconnectTestDatabase } from '../test-support/db.js';
import {
  refreshCookieFrom,
  registerPrincipal,
  RESET_LINK,
  tokenFromMailbox,
} from '../test-support/api-helpers.js';

const { app, mailbox } = buildApp();

beforeAll(async () => {
  await connectTestDatabase();
});

afterAll(async () => {
  await disconnectTestDatabase();
});

describe('forgot password', () => {
  it('always answers 200 to avoid leaking which accounts exist', async () => {
    const unknown = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody-here@example.test' })
      .expect(200);
    expect(unknown.body.data).toBeNull();

    const principal = await registerPrincipal(app, { organisationName: 'Forgot Org' });
    const before = mailbox.length;

    await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'NOBODY-HERE-2@example.test' })
      .expect(200);
    expect(mailbox.length).toBe(before);

    await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: principal.email.toUpperCase() })
      .expect(200);
    expect(mailbox.length).toBe(before + 1);
  });

  it('rejects malformed payloads', async () => {
    const response = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'not-an-email' })
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('revokes every session and rotates the password on reset', async () => {
    const mailboxStart = mailbox.length;
    const principal = await registerPrincipal(app, { organisationName: 'Reset Org' });

    await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: principal.email })
      .expect(200);

    const token = tokenFromMailbox(mailbox.slice(mailboxStart), RESET_LINK);

    await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'an entirely new passphrase' })
      .expect(200);

    // Old password no longer works; the new one does.
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: principal.email, password: 'correct horse battery' })
      .expect(401);
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: principal.email, password: 'an entirely new passphrase' })
      .expect(200);

    // The pre-reset refresh cookie is dead.
    const replay = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', principal.refreshCookie)
      .expect(401);
    expect(replay.body.error.code).toBe('SESSION_EXPIRED');

    // A brand-new login still works, proving only old sessions were revoked.
    expect(refreshCookieFrom(login)).toMatch(/^af_refresh=/);
  });

  it('consumes the reset token exactly once', async () => {
    const mailboxStart = mailbox.length;
    const principal = await registerPrincipal(app, { organisationName: 'Single Use Org' });

    await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: principal.email })
      .expect(200);
    const token = tokenFromMailbox(mailbox.slice(mailboxStart), RESET_LINK);

    await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'first replacement passphrase' })
      .expect(200);

    const replay = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'second replacement passphrase' })
      .expect(400);
    expect(replay.body.error.code).toBe('TOKEN_INVALID');
  });

  it('rejects unknown and malformed reset tokens', async () => {
    const garbage = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'made-up-token', password: 'a perfectly fine passphrase' })
      .expect(400);
    expect(garbage.body.error.code).toBe('TOKEN_INVALID');

    const weak = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'made-up-token', password: 'short' })
      .expect(400);
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('invalidates the previous reset link when a new one is requested', async () => {
    const principal = await registerPrincipal(app, { organisationName: 'Reissue Org' });
    const mailboxStart = mailbox.length;

    await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: principal.email })
      .expect(200);
    const stale = tokenFromMailbox(mailbox.slice(mailboxStart), RESET_LINK);

    await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: principal.email })
      .expect(200);
    const fresh = tokenFromMailbox(mailbox.slice(mailboxStart + 1), RESET_LINK);
    expect(fresh).not.toBe(stale);

    await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: stale, password: 'replacement passphrase one' })
      .expect(400);

    await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: fresh, password: 'replacement passphrase two' })
      .expect(200);
  });
});
