import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../test-support/build-app.js';
import { connectTestDatabase, disconnectTestDatabase } from '../test-support/db.js';
import { Invitation } from '../models/invitation.js';
import {
  bearer,
  INVITE_LINK,
  registerPrincipal,
  tokenFromMailbox,
  uniqueEmail,
  type TestPrincipal,
} from '../test-support/api-helpers.js';

const { app, mailbox } = buildApp();

let admin: TestPrincipal;

beforeAll(async () => {
  await connectTestDatabase();
  admin = await registerPrincipal(app, { name: 'Ola Admin', organisationName: 'Invite Corp' });
});

afterAll(async () => {
  await disconnectTestDatabase();
});

async function createInvitation(
  role: 'VIEWER' | 'MANAGER' | 'ORG_ADMIN',
  mailboxStart: number,
  email = uniqueEmail('invitee'),
): Promise<{ email: string; invitationId: string; token: string }> {
  const response = await request(app)
    .post(`/api/v1/organisations/${admin.orgId}/invitations`)
    .set(bearer(admin.accessToken))
    .send({ email, role })
    .expect(201);
  const token = tokenFromMailbox(mailbox.slice(mailboxStart), INVITE_LINK);
  return {
    email,
    invitationId: response.body.data.id as string,
    token,
  };
}

describe('creating invitations', () => {
  it('creates a pending invitation, emails the link and lists it', async () => {
    const mailboxStart = mailbox.length;
    const { invitationId } = await createInvitation('MANAGER', mailboxStart);

    const list = await request(app)
      .get(`/api/v1/organisations/${admin.orgId}/invitations`)
      .set(bearer(admin.accessToken))
      .expect(200);
    const row = list.body.data.find((item: { id: string }) => item.id === invitationId);
    expect(row).toMatchObject({ role: 'MANAGER', status: 'pending' });
    expect(row.invitedByName).toBe('Ola Admin');
  });

  it('rejects a duplicate pending invitation', async () => {
    const mailboxStart = mailbox.length;
    const email = uniqueEmail('duplicate');
    await createInvitation('VIEWER', mailboxStart, email);

    const response = await request(app)
      .post(`/api/v1/organisations/${admin.orgId}/invitations`)
      .set(bearer(admin.accessToken))
      .send({ email, role: 'VIEWER' })
      .expect(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('rejects inviting someone who is already a member', async () => {
    const response = await request(app)
      .post(`/api/v1/organisations/${admin.orgId}/invitations`)
      .set(bearer(admin.accessToken))
      .send({ email: admin.email, role: 'VIEWER' })
      .expect(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('rejects unassignable roles and malformed emails', async () => {
    const badRole = await request(app)
      .post(`/api/v1/organisations/${admin.orgId}/invitations`)
      .set(bearer(admin.accessToken))
      .send({ email: 'someone@example.test', role: 'SUPER_ADMIN' })
      .expect(400);
    expect(badRole.body.error.code).toBe('VALIDATION_ERROR');

    await request(app)
      .post(`/api/v1/organisations/${admin.orgId}/invitations`)
      .set(bearer(admin.accessToken))
      .send({ email: 'not-an-email', role: 'VIEWER' })
      .expect(400);
  });
});

describe('previewing invitation links', () => {
  it('shows organisation, email, role and status to anyone holding the link', async () => {
    const mailboxStart = mailbox.length;
    const { token, email } = await createInvitation('MANAGER', mailboxStart);

    const preview = await request(app).get(`/api/v1/invitations/${token}`).expect(200);
    expect(preview.body.data).toMatchObject({
      organisationName: 'Invite Corp',
      email,
      role: 'MANAGER',
      status: 'pending',
    });
  });

  it('rejects unknown tokens', async () => {
    const response = await request(app)
      .get('/api/v1/invitations/definitely-not-a-real-token')
      .expect(400);
    expect(response.body.error.code).toBe('TOKEN_INVALID');
  });
});

describe('accepting invitations', () => {
  it('adds the invited user to the organisation exactly once', async () => {
    const mailboxStart = mailbox.length;
    const { token, email } = await createInvitation('VIEWER', mailboxStart);

    const invitee = await registerPrincipal(app, { email, organisationName: 'Own Org' });
    const accepted = await request(app)
      .post('/api/v1/invitations/accept')
      .set(bearer(invitee.accessToken))
      .send({ token })
      .expect(200);
    expect(accepted.body.data.organisation.id).toBe(admin.orgId);
    expect(accepted.body.data.membership.role).toBe('VIEWER');

    const members = await request(app)
      .get(`/api/v1/organisations/${admin.orgId}/members`)
      .set(bearer(admin.accessToken))
      .expect(200);
    const row = members.body.data.find(
      (member: { userId: string }) => member.userId === invitee.userId,
    );
    expect(row).toMatchObject({ role: 'VIEWER', email });

    const preview = await request(app).get(`/api/v1/invitations/${token}`).expect(200);
    expect(preview.body.data.status).toBe('accepted');

    // Accepting again is idempotent rather than an error.
    await request(app)
      .post('/api/v1/invitations/accept')
      .set(bearer(invitee.accessToken))
      .send({ token })
      .expect(200);
  });

  it('refuses an invitation addressed to a different email', async () => {
    const mailboxStart = mailbox.length;
    const { token } = await createInvitation('VIEWER', mailboxStart);

    const wrongPerson = await registerPrincipal(app, { organisationName: 'Wrong Org' });
    const response = await request(app)
      .post('/api/v1/invitations/accept')
      .set(bearer(wrongPerson.accessToken))
      .send({ token })
      .expect(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('requires authentication to accept', async () => {
    const mailboxStart = mailbox.length;
    const { token } = await createInvitation('VIEWER', mailboxStart);
    await request(app).post('/api/v1/invitations/accept').send({ token }).expect(401);
  });

  it('treats an expired invitation as a conflict', async () => {
    const mailboxStart = mailbox.length;
    const { token, email } = await createInvitation('VIEWER', mailboxStart);

    await Invitation.updateOne(
      { email, status: 'pending' },
      { $set: { expiresAt: new Date(Date.now() - 1_000) } },
    ).exec();

    const preview = await request(app).get(`/api/v1/invitations/${token}`).expect(200);
    expect(preview.body.data.status).toBe('expired');

    const invitee = await registerPrincipal(app, { email, organisationName: 'Expired Org' });
    const response = await request(app)
      .post('/api/v1/invitations/accept')
      .set(bearer(invitee.accessToken))
      .send({ token })
      .expect(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });
});

describe('revoking invitations', () => {
  it('revokes a pending invitation and kills its link', async () => {
    const mailboxStart = mailbox.length;
    const { token, invitationId, email } = await createInvitation('VIEWER', mailboxStart);

    await request(app)
      .delete(`/api/v1/organisations/${admin.orgId}/invitations/${invitationId}`)
      .set(bearer(admin.accessToken))
      .expect(200);

    // The preview still resolves so the invite page can explain the state,
    // but the link itself can no longer be accepted.
    const preview = await request(app).get(`/api/v1/invitations/${token}`).expect(200);
    expect(preview.body.data.status).toBe('revoked');

    const accept = await request(app)
      .post('/api/v1/invitations/accept')
      .set(bearer(admin.accessToken))
      .send({ token })
      .expect(400);
    expect(accept.body.error.code).toBe('TOKEN_INVALID');

    const list = await request(app)
      .get(`/api/v1/organisations/${admin.orgId}/invitations`)
      .set(bearer(admin.accessToken))
      .expect(200);
    const row = list.body.data.find((item: { email: string }) => item.email === email);
    expect(row?.status).toBe('revoked');

    // Revoked invitations can be re-created for the same address.
    await request(app)
      .post(`/api/v1/organisations/${admin.orgId}/invitations`)
      .set(bearer(admin.accessToken))
      .send({ email, role: 'VIEWER' })
      .expect(201);
  });

  it('rejects revoking an unknown invitation', async () => {
    await request(app)
      .delete(`/api/v1/organisations/${admin.orgId}/invitations/0123456789abcdef01234567`)
      .set(bearer(admin.accessToken))
      .expect(404);
  });

  it('does not leak invitations of other organisations', async () => {
    const mailboxStart = mailbox.length;
    const { invitationId } = await createInvitation('VIEWER', mailboxStart);

    const other = await registerPrincipal(app, { organisationName: 'Other Corp' });
    const response = await request(app)
      .delete(`/api/v1/organisations/${admin.orgId}/invitations/${invitationId}`)
      .set(bearer(other.accessToken))
      .expect(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });
});
