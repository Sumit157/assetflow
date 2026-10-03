import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuditService } from './audit-service.js';
import { createMemberService } from './member-service.js';
import { buildApp } from '../test-support/build-app.js';
import { connectTestDatabase, disconnectTestDatabase } from '../test-support/db.js';
import type { AuthContext } from '../types/auth-context.js';
import {
  bearer,
  INVITE_LINK,
  registerPrincipal,
  tokenFromMailbox,
  type TestPrincipal,
} from '../test-support/api-helpers.js';

const { app, mailbox } = buildApp();

let admin: TestPrincipal;
let viewer: TestPrincipal;
let viewerOrgToken: string;

async function inviteAndJoin(
  adminPrincipal: TestPrincipal,
  email: string,
  role: 'VIEWER' | 'MANAGER',
): Promise<{ user: TestPrincipal; token: string }> {
  const mailboxStart = mailbox.length;
  await request(app)
    .post(`/api/v1/organisations/${adminPrincipal.orgId}/invitations`)
    .set(bearer(adminPrincipal.accessToken))
    .send({ email, role })
    .expect(201);

  const inviteToken = tokenFromMailbox(mailbox.slice(mailboxStart), INVITE_LINK);
  const user = await registerPrincipal(app, { email, organisationName: 'Personal Org' });

  await request(app)
    .post('/api/v1/invitations/accept')
    .set(bearer(user.accessToken))
    .send({ token: inviteToken })
    .expect(200);

  const switched = await request(app)
    .post('/api/v1/auth/switch-org')
    .set(bearer(user.accessToken))
    .send({ organisationId: adminPrincipal.orgId })
    .expect(200);

  return { user, token: switched.body.data.accessToken as string };
}

beforeAll(async () => {
  await connectTestDatabase();
  admin = await registerPrincipal(app, { name: 'Root Admin', organisationName: 'RBAC Corp' });

  const joined = await inviteAndJoin(
    admin,
    `viewer-${Math.random().toString(36).slice(2, 10)}@example.test`,
    'VIEWER',
  );
  viewer = joined.user;
  viewerOrgToken = joined.token;
});

afterAll(async () => {
  await disconnectTestDatabase();
});

describe('permission grants for organisation administrators', () => {
  it('lets an ORG_ADMIN rename the organisation', async () => {
    const response = await request(app)
      .patch(`/api/v1/organisations/${admin.orgId}`)
      .set(bearer(admin.accessToken))
      .send({ name: 'RBAC Corporation' })
      .expect(200);
    expect(response.body.data.name).toBe('RBAC Corporation');
  });

  it('lets an ORG_ADMIN manage members and invitations', async () => {
    await request(app)
      .get(`/api/v1/organisations/${admin.orgId}/members`)
      .set(bearer(admin.accessToken))
      .expect(200);
    await request(app)
      .get(`/api/v1/organisations/${admin.orgId}/invitations`)
      .set(bearer(admin.accessToken))
      .expect(200);

    // Promote the viewer to manager, then demote back to prove both directions.
    await request(app)
      .patch(`/api/v1/organisations/${admin.orgId}/members/${viewer.userId}`)
      .set(bearer(admin.accessToken))
      .send({ role: 'MANAGER' })
      .expect(200);
    await request(app)
      .patch(`/api/v1/organisations/${admin.orgId}/members/${viewer.userId}`)
      .set(bearer(admin.accessToken))
      .send({ role: 'VIEWER' })
      .expect(200);
  });

  it('cannot change or remove the acting administrator themself', async () => {
    const selfRole = await request(app)
      .patch(`/api/v1/organisations/${admin.orgId}/members/${admin.userId}`)
      .set(bearer(admin.accessToken))
      .send({ role: 'VIEWER' })
      .expect(403);
    expect(selfRole.body.error.code).toBe('FORBIDDEN');

    await request(app)
      .delete(`/api/v1/organisations/${admin.orgId}/members/${admin.userId}`)
      .set(bearer(admin.accessToken))
      .expect(403);
  });
});

describe('permission denials for viewers', () => {
  it('can read the organisation and the member list', async () => {
    await request(app)
      .get(`/api/v1/organisations/${admin.orgId}`)
      .set(bearer(viewerOrgToken))
      .expect(200);
    const members = await request(app)
      .get(`/api/v1/organisations/${admin.orgId}/members`)
      .set(bearer(viewerOrgToken))
      .expect(200);
    expect(members.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('cannot rename the organisation', async () => {
    const response = await request(app)
      .patch(`/api/v1/organisations/${admin.orgId}`)
      .set(bearer(viewerOrgToken))
      .send({ name: 'Taken Over' })
      .expect(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('cannot invite, revoke invitations or list them', async () => {
    await request(app)
      .post(`/api/v1/organisations/${admin.orgId}/invitations`)
      .set(bearer(viewerOrgToken))
      .send({ email: 'someone@example.test', role: 'VIEWER' })
      .expect(403);

    await request(app)
      .get(`/api/v1/organisations/${admin.orgId}/invitations`)
      .set(bearer(viewerOrgToken))
      .expect(403);

    await request(app)
      .delete(`/api/v1/organisations/${admin.orgId}/invitations/0123456789abcdef01234567`)
      .set(bearer(viewerOrgToken))
      .expect(403);
  });

  it('cannot change member roles or remove members', async () => {
    await request(app)
      .patch(`/api/v1/organisations/${admin.orgId}/members/${admin.userId}`)
      .set(bearer(viewerOrgToken))
      .send({ role: 'VIEWER' })
      .expect(403);

    await request(app)
      .delete(`/api/v1/organisations/${admin.orgId}/members/${admin.userId}`)
      .set(bearer(viewerOrgToken))
      .expect(403);
  });

  it('rejects privilege escalation attempts to SUPER_ADMIN', async () => {
    const response = await request(app)
      .patch(`/api/v1/organisations/${admin.orgId}/members/${viewer.userId}`)
      .set(bearer(admin.accessToken))
      .send({ role: 'SUPER_ADMIN' })
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('the organisation always keeps at least one administrator', () => {
  it('refuses to demote or remove the sole ORG_ADMIN', async () => {
    // Invariants are enforced in the service layer because route-level checks
    // (self-editing) prevent the edge case from being reached over HTTP.
    const members = createMemberService({
      audit: { record: async () => undefined } as unknown as AuditService,
    });
    const otherAdminClaims: AuthContext = {
      userId: viewer.userId,
      sessionId: 'service-level-test',
      orgId: admin.orgId,
      role: 'ORG_ADMIN',
    };

    await expect(
      members.updateRole(otherAdminClaims, admin.userId, 'MANAGER', null),
    ).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });

    await expect(members.remove(otherAdminClaims, admin.userId, null)).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
    });

    // The admin is still an admin afterwards.
    const membersAfter = await request(app)
      .get(`/api/v1/organisations/${admin.orgId}/members`)
      .set(bearer(admin.accessToken))
      .expect(200);
    const self = membersAfter.body.data.find(
      (row: { userId: string }) => row.userId === admin.userId,
    );
    expect(self?.role).toBe('ORG_ADMIN');
  });

  it('refuses to remove a member who does not exist', async () => {
    const members = createMemberService({
      audit: { record: async () => undefined } as unknown as AuditService,
    });
    const claims: AuthContext = {
      userId: admin.userId,
      sessionId: 'service-level-test',
      orgId: admin.orgId,
      role: 'ORG_ADMIN',
    };

    await expect(members.remove(claims, '0123456789abcdef01234567', null)).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });
});
