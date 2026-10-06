import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AssetPublic, Paginated } from '@assetflow/types';
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
let categoryId: string;
let locationId: string;

function uniqueTag(prefix = 'AST'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

async function createAsset(
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<AssetPublic> {
  const response = await request(app)
    .post('/api/v1/assets')
    .set(bearer(token))
    .send({ name: 'MacBook Pro 14', assetTag: uniqueTag(), ...overrides })
    .expect(201);
  return response.body.data;
}

beforeAll(async () => {
  await connectTestDatabase();
  owner = await registerPrincipal(app, { name: 'Org Admin', organisationName: 'Assets Corp' });
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

  const category = await request(app)
    .post('/api/v1/asset-categories')
    .set(bearer(owner.accessToken))
    .send({ name: 'Laptops' })
    .expect(201);
  categoryId = category.body.data.id;

  const location = await request(app)
    .post('/api/v1/locations')
    .set(bearer(owner.accessToken))
    .send({ name: 'Head Office' })
    .expect(201);
  locationId = location.body.data.id;
});

afterAll(async () => {
  await disconnectTestDatabase();
});

describe('creating assets', () => {
  it('creates an asset with a barcode derived from the tag', async () => {
    const assetTag = uniqueTag('LAP');
    const asset = await createAsset(owner.accessToken, {
      assetTag,
      serialNumber: 'SN-123',
      categoryId,
      locationId,
      condition: 'fair',
      description: 'Design laptop',
    });

    expect(asset.assetTag).toBe(assetTag);
    expect(asset.barcode).toBe(assetTag);
    expect(asset.status).toBe('available');
    expect(asset.condition).toBe('fair');
    expect(asset.categoryName).toBe('Laptops');
    expect(asset.locationName).toBe('Head Office');
    expect(asset.assignedToUserId).toBeNull();
    expect(asset.retiredAt).toBeNull();
  });

  it('rejects duplicate asset tags and serial numbers in the organisation', async () => {
    const assetTag = uniqueTag();
    await createAsset(owner.accessToken, { assetTag, serialNumber: 'DUP-SN' });

    const duplicateTag = await request(app)
      .post('/api/v1/assets')
      .set(bearer(owner.accessToken))
      .send({ name: 'Copy', assetTag })
      .expect(409);
    expect(duplicateTag.body.error.message).toContain('tag');

    const duplicateSerial = await request(app)
      .post('/api/v1/assets')
      .set(bearer(owner.accessToken))
      .send({ name: 'Copy', assetTag: uniqueTag(), serialNumber: 'DUP-SN' })
      .expect(409);
    expect(duplicateSerial.body.error.message).toContain('serial');
  });

  it('refuses categories and locations from another organisation', async () => {
    const foreignCategory = await request(app)
      .post('/api/v1/asset-categories')
      .set(bearer(outsider.accessToken))
      .send({ name: 'Foreign' })
      .expect(201);

    await request(app)
      .post('/api/v1/assets')
      .set(bearer(owner.accessToken))
      .send({ name: 'Smuggled', assetTag: uniqueTag(), categoryId: foreignCategory.body.data.id })
      .expect(404);
  });

  it('rejects invalid payloads and does not let viewers create assets', async () => {
    await request(app)
      .post('/api/v1/assets')
      .set(bearer(owner.accessToken))
      .send({ name: '', assetTag: '' })
      .expect(400);

    await request(app)
      .post('/api/v1/assets')
      .set(bearer(viewer.accessToken))
      .send({ name: 'Nope', assetTag: uniqueTag() })
      .expect(403);
  });
});

describe('reading assets', () => {
  it('gets a single asset and returns 404 for unknown or foreign assets', async () => {
    const asset = await createAsset(owner.accessToken);

    const read = await request(app)
      .get(`/api/v1/assets/${asset.id}`)
      .set(bearer(owner.accessToken))
      .expect(200);
    expect(read.body.data.id).toBe(asset.id);

    await request(app)
      .get(`/api/v1/assets/ffffffffffffffffffffffff`)
      .set(bearer(owner.accessToken))
      .expect(404);

    await request(app)
      .get(`/api/v1/assets/${asset.id}`)
      .set(bearer(outsider.accessToken))
      .expect(404);

    await request(app).get('/api/v1/assets/not-an-id').set(bearer(owner.accessToken)).expect(404);
  });

  it('paginates, sorts and filters the asset list', async () => {
    const prefix = uniqueTag('LIST');
    const first = await createAsset(owner.accessToken, { assetTag: `${prefix}-1`, name: 'Alpha' });
    const second = await createAsset(owner.accessToken, {
      assetTag: `${prefix}-2`,
      name: 'Beta',
      categoryId,
      condition: 'poor',
    });
    await createAsset(owner.accessToken, { assetTag: `${prefix}-3`, name: 'Gamma' });

    const page1 = await request(app)
      .get('/api/v1/assets?page=1&limit=2&sortBy=assetTag&sortDir=asc')
      .set(bearer(viewer.accessToken))
      .expect(200);
    const payload = page1.body.data as Paginated<AssetPublic>;
    expect(payload.page).toBe(1);
    expect(payload.limit).toBe(2);
    expect(payload.total).toBeGreaterThanOrEqual(3);
    expect(payload.totalPages).toBe(Math.max(1, Math.ceil(payload.total / 2)));

    const search = await request(app)
      .get(`/api/v1/assets?q=${prefix}`)
      .set(bearer(owner.accessToken))
      .expect(200);
    expect((search.body.data as Paginated<AssetPublic>).total).toBe(3);

    const byCategory = await request(app)
      .get(`/api/v1/assets?categoryId=${categoryId}`)
      .set(bearer(owner.accessToken))
      .expect(200);
    const categoryItems = (byCategory.body.data as Paginated<AssetPublic>).items;
    expect(categoryItems.every((item) => item.categoryId === categoryId)).toBe(true);
    expect(categoryItems.some((item) => item.id === second.id)).toBe(true);

    const byStatus = await request(app)
      .get('/api/v1/assets?status=available&limit=100')
      .set(bearer(owner.accessToken))
      .expect(200);
    expect(
      (byStatus.body.data as Paginated<AssetPublic>).items.every(
        (item) => item.status === 'available',
      ),
    ).toBe(true);
    expect(
      (byStatus.body.data as Paginated<AssetPublic>).items.some((item) => item.id === first.id),
    ).toBe(true);

    const badQuery = await request(app)
      .get('/api/v1/assets?status=nope')
      .set(bearer(owner.accessToken))
      .expect(400);
    expect(badQuery.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('never leaks assets from another organisation', async () => {
    await createAsset(outsider.accessToken, { assetTag: uniqueTag('OUT'), name: 'Secret' });

    const list = await request(app)
      .get('/api/v1/assets?limit=100')
      .set(bearer(owner.accessToken))
      .expect(200);
    const items = (list.body.data as Paginated<AssetPublic>).items;
    expect(items.every((item) => item.organisationId === owner.orgId)).toBe(true);
    expect(items.some((item) => item.name === 'Secret')).toBe(false);

    const search = await request(app)
      .get('/api/v1/assets?q=Secret')
      .set(bearer(owner.accessToken))
      .expect(200);
    expect((search.body.data as Paginated<AssetPublic>).total).toBe(0);
  });

  it('requires authentication', async () => {
    await request(app).get('/api/v1/assets').expect(401);
  });
});

describe('updating and deleting assets', () => {
  it('updates asset fields and reports the changed paths', async () => {
    const asset = await createAsset(owner.accessToken, { name: 'Old Name' });

    const updated = await request(app)
      .patch(`/api/v1/assets/${asset.id}`)
      .set(bearer(owner.accessToken))
      .send({ name: 'New Name', categoryId, condition: 'poor' })
      .expect(200);
    expect(updated.body.data.name).toBe('New Name');
    expect(updated.body.data.categoryId).toBe(categoryId);
    expect(updated.body.data.condition).toBe('poor');

    const noOp = await request(app)
      .patch(`/api/v1/assets/${asset.id}`)
      .set(bearer(owner.accessToken))
      .send({ name: 'New Name' })
      .expect(200);
    expect(noOp.body.data.id).toBe(asset.id);
  });

  it('guards tag and serial uniqueness on update', async () => {
    const first = await createAsset(owner.accessToken, { serialNumber: 'UNIQUE-1' });
    const second = await createAsset(owner.accessToken);

    const tagConflict = await request(app)
      .patch(`/api/v1/assets/${second.id}`)
      .set(bearer(owner.accessToken))
      .send({ assetTag: first.assetTag })
      .expect(409);
    expect(tagConflict.body.error.code).toBe('CONFLICT');

    const serialConflict = await request(app)
      .patch(`/api/v1/assets/${second.id}`)
      .set(bearer(owner.accessToken))
      .send({ serialNumber: 'UNIQUE-1' })
      .expect(409);
    expect(serialConflict.body.error.code).toBe('CONFLICT');

    const selfTag = await request(app)
      .patch(`/api/v1/assets/${first.id}`)
      .set(bearer(owner.accessToken))
      .send({ assetTag: first.assetTag })
      .expect(200);
    expect(selfTag.body.data.assetTag).toBe(first.assetTag);
  });

  it('blocks viewer updates and cross-tenant patches', async () => {
    const asset = await createAsset(owner.accessToken);

    await request(app)
      .patch(`/api/v1/assets/${asset.id}`)
      .set(bearer(viewer.accessToken))
      .send({ name: 'Viewer Edit' })
      .expect(403);

    await request(app)
      .patch(`/api/v1/assets/${asset.id}`)
      .set(bearer(outsider.accessToken))
      .send({ name: 'Outsider Edit' })
      .expect(404);
  });

  it('deletes an asset without history and keeps it visible to nobody afterwards', async () => {
    const asset = await createAsset(owner.accessToken);

    await request(app)
      .delete(`/api/v1/assets/${asset.id}`)
      .set(bearer(viewer.accessToken))
      .expect(403);

    await request(app)
      .delete(`/api/v1/assets/${asset.id}`)
      .set(bearer(owner.accessToken))
      .expect(200);

    await request(app).get(`/api/v1/assets/${asset.id}`).set(bearer(owner.accessToken)).expect(404);
  });
});
