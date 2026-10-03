import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLog } from '../models/audit-log.js';
import { buildApp } from '../test-support/build-app.js';
import { connectTestDatabase, disconnectTestDatabase } from '../test-support/db.js';
import {
  bearer,
  registerPrincipal,
  refreshCookieFrom,
  tokenFromMailbox,
  uniqueEmail,
  VERIFY_LINK,
} from '../test-support/api-helpers.js';

const { app, mailbox } = buildApp();

beforeAll(async () => {
  await connectTestDatabase();
});

afterAll(async () => {
  await disconnectTestDatabase();
});

describe('registration', () => {
  it('creates a user, an organisation and an admin session', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Ada Lovelace',
        email: 'ada@example.test',
        password: 'analytical engine',
        organisationName: 'Analytical Engines Ltd',
      })
      .expect(201);

    expect(response.body.data.user).toMatchObject({
      name: 'Ada Lovelace',
      email: 'ada@example.test',
      emailVerified: false,
    });
    expect(response.body.data.organisation.name).toBe('Analytical Engines Ltd');
    expect(response.body.data.membership.role).toBe('ORG_ADMIN');
    expect(response.body.data.memberships).toHaveLength(1);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(refreshCookieFrom(response)).toMatch(/^af_refresh=/);

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set(bearer(response.body.data.accessToken))
      .expect(200);
    expect(me.body.data.user.email).toBe('ada@example.test');
    expect(me.body.data.organisation.name).toBe('Analytical Engines Ltd');
  });

  it('rejects duplicate registrations with a stable error code', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Ada',
        email: 'duplicate@example.test',
        password: 'analytical engine',
        organisationName: 'First Inc',
      })
      .expect(201);

    const second = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Ada again',
        email: 'DUPLICATE@example.test',
        password: 'analytical engine',
        organisationName: 'Second Inc',
      })
      .expect(409);

    expect(second.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('validates registration input with field-level details', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: '', email: 'not-an-email', password: 'short', organisationName: '' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    const paths = response.body.error.details.map((detail: { path: string }) => detail.path);
    expect(paths).toContain('email');
    expect(paths).toContain('password');
    expect(paths).toContain('name');
  });
});

describe('login', () => {
  it('rejects unknown emails and wrong passwords identically', async () => {
    const principal = await registerPrincipal(app, { organisationName: 'Login Org' });

    const unknown = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail('ghost'), password: 'correct horse battery' })
      .expect(401);
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');

    const wrong = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: principal.email, password: 'not the password' })
      .expect(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');

    const failedAttempts = await AuditLog.countDocuments({ action: 'auth.login_failed' });
    expect(failedAttempts).toBeGreaterThanOrEqual(2);
  });

  it('returns a session for valid credentials', async () => {
    const principal = await registerPrincipal(app, { organisationName: 'Return Org' });

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: principal.email, password: 'correct horse battery' })
      .expect(200);

    expect(response.body.data.user.id).toBe(principal.userId);
    expect(response.body.data.organisation.id).toBe(principal.orgId);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(refreshCookieFrom(response)).toMatch(/^af_refresh=/);

    const logins = await AuditLog.countDocuments({
      action: 'auth.login',
      userId: principal.userId,
    });
    expect(logins).toBe(1);
  });
});

describe('session refresh and logout', () => {
  it('rotates the refresh token and invalidates the previous one', async () => {
    const principal = await registerPrincipal(app, { organisationName: 'Refresh Org' });

    const firstRefresh = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', principal.refreshCookie)
      .expect(200);
    expect(firstRefresh.body.data.accessToken).toEqual(expect.any(String));
    const secondCookie = refreshCookieFrom(firstRefresh);
    expect(secondCookie).not.toBe(principal.refreshCookie);

    // Replaying the original token is treated as theft: the family dies.
    await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', principal.refreshCookie)
      .expect(401)
      .then((response) => {
        expect(response.body.error.code).toBe('SESSION_EXPIRED');
      });

    const revoked = await AuditLog.countDocuments({
      action: 'auth.session_revoked',
      metadata: { reason: 'token_reuse' },
    });
    expect(revoked).toBeGreaterThanOrEqual(1);

    // The rotated token from the same family is revoked too.
    const afterReuse = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', secondCookie)
      .expect(401);
    expect(afterReuse.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('issues a fresh access token from a valid cookie', async () => {
    const principal = await registerPrincipal(app, { organisationName: 'Cookie Org' });

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', principal.refreshCookie)
      .expect(200);
    const freshToken = refreshed.body.data.accessToken as string;

    const me = await request(app).get('/api/v1/auth/me').set(bearer(freshToken)).expect(200);
    expect(me.body.data.user.id).toBe(principal.userId);

    // Rotate once more so we still have a live cookie for later assertions.
    const rotated = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', refreshCookieFrom(refreshed))
      .expect(200);

    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', refreshCookieFrom(rotated))
      .expect(200);
    expect(logout.body.data).toBeNull();

    const afterLogout = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', refreshCookieFrom(rotated))
      .expect(401);
    expect(afterLogout.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('rejects refresh without a cookie', async () => {
    const response = await request(app).post('/api/v1/auth/refresh').expect(401);
    expect(response.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('requires authentication for protected routes', async () => {
    const response = await request(app).get('/api/v1/auth/me').expect(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');

    const garbage = await request(app).get('/api/v1/auth/me').set(bearer('not.a.jwt')).expect(401);
    expect(garbage.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('email verification', () => {
  it('verifies an address from the emailed link exactly once', async () => {
    const mailboxStart = mailbox.length;
    const principal = await registerPrincipal(app, { organisationName: 'Verify Org' });
    const token = tokenFromMailbox(mailbox.slice(mailboxStart), VERIFY_LINK);

    await request(app).post('/api/v1/auth/verify-email').send({ token }).expect(200);

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set(bearer(principal.accessToken))
      .expect(200);
    expect(me.body.data.user.emailVerified).toBe(true);

    const replay = await request(app).post('/api/v1/auth/verify-email').send({ token }).expect(400);
    expect(replay.body.error.code).toBe('TOKEN_INVALID');
  });

  it('resends verification only for unverified accounts', async () => {
    const principal = await registerPrincipal(app, { organisationName: 'Resend Org' });
    const before = mailbox.length;

    await request(app)
      .post('/api/v1/auth/resend-verification')
      .set(bearer(principal.accessToken))
      .expect(200);
    expect(mailbox.length).toBe(before + 1);

    const token = tokenFromMailbox(mailbox.slice(before), VERIFY_LINK);
    await request(app).post('/api/v1/auth/verify-email').send({ token }).expect(200);

    const conflict = await request(app)
      .post('/api/v1/auth/resend-verification')
      .set(bearer(principal.accessToken))
      .expect(409);
    expect(conflict.body.error.code).toBe('CONFLICT');
  });
});

describe('sessions', () => {
  it('lists active sessions and revokes a chosen one', async () => {
    const principal = await registerPrincipal(app, { organisationName: 'Sessions Org' });

    // A second login creates a second session for the same user.
    const second = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: principal.email, password: 'correct horse battery' })
      .expect(200);

    const list = await request(app)
      .get('/api/v1/auth/sessions')
      .set(bearer(principal.accessToken))
      .expect(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(2);
    const current = list.body.data.filter((session: { current: boolean }) => session.current);
    expect(current).toHaveLength(1);

    const other = list.body.data.find((session: { current: boolean }) => !session.current) as {
      id: string;
    };
    await request(app)
      .delete(`/api/v1/auth/sessions/${other.id}`)
      .set(bearer(principal.accessToken))
      .expect(200);

    // The revoked session can no longer refresh.
    const revokedCookie = refreshCookieFrom(second);
    const refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', revokedCookie)
      .expect(401);
    expect(refresh.body.error.code).toBe('SESSION_EXPIRED');
  });

  it("cannot revoke another user's session", async () => {
    const alice = await registerPrincipal(app, { organisationName: 'Alice Org' });
    const bob = await registerPrincipal(app, { organisationName: 'Bob Org' });

    const list = await request(app)
      .get('/api/v1/auth/sessions')
      .set(bearer(alice.accessToken))
      .expect(200);
    const aliceSession = list.body.data[0] as { id: string };

    await request(app)
      .delete(`/api/v1/auth/sessions/${aliceSession.id}`)
      .set(bearer(bob.accessToken))
      .expect(404);
  });
});
