import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../test-support/build-app.js';
import { connectTestDatabase, disconnectTestDatabase } from '../test-support/db.js';
import { bearer, registerPrincipal, type TestPrincipal } from '../test-support/api-helpers.js';

const { app } = buildApp();

let alice: TestPrincipal;
let bob: TestPrincipal;
let secondOrgId: string;

beforeAll(async () => {
  await connectTestDatabase();
  alice = await registerPrincipal(app, { name: 'Alice', organisationName: 'Alice Corp' });
  bob = await registerPrincipal(app, { name: 'Bob', organisationName: 'Bob Corp' });
});

afterAll(async () => {
  await disconnectTestDatabase();
});

describe('organisation id in the URL must match the session', () => {
  it('blocks reading another organisation', async () => {
    const response = await request(app)
      .get(`/api/v1/organisations/${bob.orgId}`)
      .set(bearer(alice.accessToken))
      .expect(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it("blocks listing another organisation's members", async () => {
    await request(app)
      .get(`/api/v1/organisations/${bob.orgId}/members`)
      .set(bearer(alice.accessToken))
      .expect(403);
  });

  it('blocks modifying another organisation and leaves its data intact', async () => {
    await request(app)
      .patch(`/api/v1/organisations/${bob.orgId}`)
      .set(bearer(alice.accessToken))
      .send({ name: 'Hijacked' })
      .expect(403);

    const readBack = await request(app)
      .get(`/api/v1/organisations/${bob.orgId}`)
      .set(bearer(bob.accessToken))
      .expect(200);
    expect(readBack.body.data.name).toBe('Bob Corp');
  });

  it('blocks addressing a malformed organisation id that is not the session org', async () => {
    const response = await request(app)
      .get('/api/v1/organisations/not-a-valid-id')
      .set(bearer(alice.accessToken))
      .expect(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('requires authentication on org routes', async () => {
    await request(app).get(`/api/v1/organisations/${alice.orgId}`).expect(401);
  });
});

describe('member data is scoped to the active organisation', () => {
  it("only returns members of the caller's organisation", async () => {
    const aliceMembers = await request(app)
      .get(`/api/v1/organisations/${alice.orgId}/members`)
      .set(bearer(alice.accessToken))
      .expect(200);
    expect(aliceMembers.body.data).toHaveLength(1);
    expect(aliceMembers.body.data[0].userId).toBe(alice.userId);

    const bobMembers = await request(app)
      .get(`/api/v1/organisations/${bob.orgId}/members`)
      .set(bearer(bob.accessToken))
      .expect(200);
    expect(bobMembers.body.data).toHaveLength(1);
    expect(bobMembers.body.data[0].userId).toBe(bob.userId);
  });

  it('cannot manage members of another organisation', async () => {
    await request(app)
      .patch(`/api/v1/organisations/${bob.orgId}/members/${bob.userId}`)
      .set(bearer(alice.accessToken))
      .send({ role: 'VIEWER' })
      .expect(403);

    await request(app)
      .delete(`/api/v1/organisations/${bob.orgId}/members/${bob.userId}`)
      .set(bearer(alice.accessToken))
      .expect(403);
  });
});

describe('multiple organisations per user', () => {
  it('creates a second organisation and switches between them', async () => {
    const created = await request(app)
      .post('/api/v1/organisations')
      .set(bearer(alice.accessToken))
      .send({ name: 'Alice Second Ltd' })
      .expect(201);
    secondOrgId = created.body.data.id;

    const list = await request(app)
      .get('/api/v1/organisations')
      .set(bearer(alice.accessToken))
      .expect(200);
    expect(list.body.data.map((org: { id: string }) => org.id)).toEqual(
      expect.arrayContaining([alice.orgId, secondOrgId]),
    );

    const switched = await request(app)
      .post('/api/v1/auth/switch-org')
      .set(bearer(alice.accessToken))
      .send({ organisationId: secondOrgId })
      .expect(200);
    const switchedToken = switched.body.data.accessToken as string;
    expect(switched.body.data.organisation.id).toBe(secondOrgId);

    // The new token now addresses the new organisation...
    const inNewOrg = await request(app)
      .get(`/api/v1/organisations/${secondOrgId}`)
      .set(bearer(switchedToken))
      .expect(200);
    expect(inNewOrg.body.data.name).toBe('Alice Second Ltd');

    // ...and the old organisation id is no longer addressable with it.
    await request(app)
      .get(`/api/v1/organisations/${alice.orgId}`)
      .set(bearer(switchedToken))
      .expect(403);

    // Switching back restores access to the first organisation.
    const back = await request(app)
      .post('/api/v1/auth/switch-org')
      .set(bearer(switchedToken))
      .send({ organisationId: alice.orgId })
      .expect(200);
    await request(app)
      .get(`/api/v1/organisations/${alice.orgId}`)
      .set(bearer(back.body.data.accessToken))
      .expect(200);
  });

  it('refuses to switch into an organisation the user does not belong to', async () => {
    const response = await request(app)
      .post('/api/v1/auth/switch-org')
      .set(bearer(alice.accessToken))
      .send({ organisationId: bob.orgId })
      .expect(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });
});
