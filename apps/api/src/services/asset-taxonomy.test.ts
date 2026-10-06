import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../test-support/build-app.js';
import { connectTestDatabase, disconnectTestDatabase } from '../test-support/db.js';
import {
  bearer,
  INVITE_LINK,
  registerPrincipal,
  tokenFromMailbox,
  type TestPrincipal,
} from '../test-support/api-helpers.js';

const { app, mailbox } = buildApp();

let owner: TestPrincipal;
let viewer: TestPrincipal;
let outsider: TestPrincipal;

function uniqueName(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniqueTag(): string {
  return `TAG-${Math.random().toString(36).slice(2, 10)}`;
}

async function createAsset(
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string }> {
  const response = await request(app)
    .post('/api/v1/assets')
    .set(bearer(token))
    .send({ name: 'Test Asset', assetTag: uniqueTag(), ...overrides })
    .expect(201);
  return response.body.data;
}

beforeAll(async () => {
  await connectTestDatabase();
  owner = await registerPrincipal(app, { name: 'Org Admin', organisationName: 'Taxonomy Corp' });
  outsider = await registerPrincipal(app, { name: 'Outsider', organisationName: 'Other Corp' });

  const viewerEmail = `viewer-${Math.random().toString(36).slice(2, 10)}@example.test`;
  const mailboxStart = mailbox.length;
  await request(app)
    .post(`/api/v1/organisations/${owner.orgId}/invitations`)
    .set(bearer(owner.accessToken))
    .send({ email: viewerEmail, role: 'VIEWER' })
    .expect(201);
  const inviteToken = tokenFromMailbox(mailbox.slice(mailboxStart), INVITE_LINK);

  viewer = await registerPrincipal(app, { email: viewerEmail, organisationName: 'Viewer Own' });
  await request(app)
    .post('/api/v1/invitations/accept')
    .set(bearer(viewer.accessToken))
    .send({ token: inviteToken })
    .expect(200);

  const switched = await request(app)
    .post('/api/v1/auth/switch-org')
    .set(bearer(viewer.accessToken))
    .send({ organisationId: owner.orgId })
    .expect(200);
  viewer = { ...viewer, accessToken: switched.body.data.accessToken as string };
});

afterAll(async () => {
  await disconnectTestDatabase();
});

describe('asset categories', () => {
  it('creates, lists and counts categories', async () => {
    const name = uniqueName('Laptops');
    const created = await request(app)
      .post('/api/v1/asset-categories')
      .set(bearer(owner.accessToken))
      .send({ name, description: 'Portable computers' })
      .expect(201);
    expect(created.body.data.name).toBe(name);
    expect(created.body.data.assetCount).toBe(0);

    const list = await request(app)
      .get('/api/v1/asset-categories')
      .set(bearer(owner.accessToken))
      .expect(200);
    expect(list.body.data.map((row: { name: string }) => row.name)).toContain(name);
  });

  it('rejects duplicate category names in the same organisation', async () => {
    const name = uniqueName('Monitors');
    await request(app)
      .post('/api/v1/asset-categories')
      .set(bearer(owner.accessToken))
      .send({ name })
      .expect(201);

    const duplicate = await request(app)
      .post('/api/v1/asset-categories')
      .set(bearer(owner.accessToken))
      .send({ name })
      .expect(409);
    expect(duplicate.body.error.code).toBe('CONFLICT');
  });

  it('does not let viewers create or rename categories', async () => {
    await request(app)
      .post('/api/v1/asset-categories')
      .set(bearer(viewer.accessToken))
      .send({ name: uniqueName('Blocked') })
      .expect(403);
  });

  it('renames a category and keeps it scoped to the organisation', async () => {
    const name = uniqueName('Desks');
    const created = await request(app)
      .post('/api/v1/asset-categories')
      .set(bearer(owner.accessToken))
      .send({ name })
      .expect(201);

    const renamed = await request(app)
      .patch(`/api/v1/asset-categories/${created.body.data.id}`)
      .set(bearer(owner.accessToken))
      .send({ name: `${name} v2`, description: null })
      .expect(200);
    expect(renamed.body.data.name).toBe(`${name} v2`);

    const outsiderList = await request(app)
      .get('/api/v1/asset-categories')
      .set(bearer(outsider.accessToken))
      .expect(200);
    expect(outsiderList.body.data).toHaveLength(0);

    await request(app)
      .patch(`/api/v1/asset-categories/${created.body.data.id}`)
      .set(bearer(outsider.accessToken))
      .send({ name: 'Hijacked' })
      .expect(404);
  });

  it('refuses to delete a category that assets still use', async () => {
    const name = uniqueName('In Use');
    const category = await request(app)
      .post('/api/v1/asset-categories')
      .set(bearer(owner.accessToken))
      .send({ name })
      .expect(201);

    await createAsset(owner.accessToken, { categoryId: category.body.data.id });

    const blocked = await request(app)
      .delete(`/api/v1/asset-categories/${category.body.data.id}`)
      .set(bearer(owner.accessToken))
      .expect(409);
    expect(blocked.body.error.message).toContain('1 asset');

    const list = await request(app)
      .get('/api/v1/asset-categories')
      .set(bearer(owner.accessToken))
      .expect(200);
    const row = list.body.data.find((item: { id: string }) => item.id === category.body.data.id);
    expect(row.assetCount).toBe(1);
  });

  it('deletes an unused category', async () => {
    const name = uniqueName('Disposable');
    const category = await request(app)
      .post('/api/v1/asset-categories')
      .set(bearer(owner.accessToken))
      .send({ name })
      .expect(201);

    await request(app)
      .delete(`/api/v1/asset-categories/${category.body.data.id}`)
      .set(bearer(owner.accessToken))
      .expect(200);

    const list = await request(app)
      .get('/api/v1/asset-categories')
      .set(bearer(owner.accessToken))
      .expect(200);
    expect(list.body.data.map((row: { id: string }) => row.id)).not.toContain(
      category.body.data.id,
    );
  });
});

describe('locations', () => {
  it('creates and lists locations with a code', async () => {
    const name = uniqueName('HQ Floor 2');
    const created = await request(app)
      .post('/api/v1/locations')
      .set(bearer(owner.accessToken))
      .send({ name, code: 'HQ-2F' })
      .expect(201);
    expect(created.body.data.code).toBe('HQ-2F');
    expect(created.body.data.assetCount).toBe(0);

    const list = await request(app)
      .get('/api/v1/locations')
      .set(bearer(owner.accessToken))
      .expect(200);
    expect(list.body.data.map((row: { name: string }) => row.name)).toContain(name);
  });

  it('rejects duplicate location names', async () => {
    const name = uniqueName('Warehouse A');
    await request(app)
      .post('/api/v1/locations')
      .set(bearer(owner.accessToken))
      .send({ name })
      .expect(201);

    const duplicate = await request(app)
      .post('/api/v1/locations')
      .set(bearer(owner.accessToken))
      .send({ name })
      .expect(409);
    expect(duplicate.body.error.code).toBe('CONFLICT');
  });

  it('does not let viewers create locations', async () => {
    await request(app)
      .post('/api/v1/locations')
      .set(bearer(viewer.accessToken))
      .send({ name: uniqueName('Blocked Site') })
      .expect(403);
  });

  it('refuses to delete a location that assets still use', async () => {
    const location = await request(app)
      .post('/api/v1/locations')
      .set(bearer(owner.accessToken))
      .send({ name: uniqueName('Storage') })
      .expect(201);

    await createAsset(owner.accessToken, { locationId: location.body.data.id });

    await request(app)
      .delete(`/api/v1/locations/${location.body.data.id}`)
      .set(bearer(owner.accessToken))
      .expect(409);
  });

  it('deletes an unused location and blocks cross-tenant deletes', async () => {
    const location = await request(app)
      .post('/api/v1/locations')
      .set(bearer(owner.accessToken))
      .send({ name: uniqueName('Temp Office') })
      .expect(201);

    await request(app)
      .delete(`/api/v1/locations/${location.body.data.id}`)
      .set(bearer(outsider.accessToken))
      .expect(404);

    await request(app)
      .delete(`/api/v1/locations/${location.body.data.id}`)
      .set(bearer(owner.accessToken))
      .expect(200);
  });
});
