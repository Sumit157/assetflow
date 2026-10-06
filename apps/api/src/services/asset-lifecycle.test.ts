import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AssetHistory, AssetPublic } from '@assetflow/types';
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
let carol: TestPrincipal;
let viewer: TestPrincipal;
let outsider: TestPrincipal;

function uniqueTag(prefix = 'LIFE'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

async function createAsset(token = owner.accessToken): Promise<AssetPublic> {
  const response = await request(app)
    .post('/api/v1/assets')
    .set(bearer(token))
    .send({ name: 'Field Laptop', assetTag: uniqueTag() })
    .expect(201);
  return response.body.data;
}

async function getHistory(assetId: string, token = owner.accessToken): Promise<AssetHistory> {
  const response = await request(app)
    .get(`/api/v1/assets/${assetId}/history`)
    .set(bearer(token))
    .expect(200);
  return response.body.data;
}

async function joinOrg(
  ownerPrincipal: TestPrincipal,
  email: string,
  name: string,
  role: 'ASSET_MANAGER' | 'VIEWER',
): Promise<TestPrincipal> {
  const mailboxStart = mailbox.length;
  await request(app)
    .post(`/api/v1/organisations/${ownerPrincipal.orgId}/invitations`)
    .set(bearer(ownerPrincipal.accessToken))
    .send({ email, role })
    .expect(201);
  const inviteToken = tokenFromMailbox(mailbox.slice(mailboxStart), INVITE_LINK);

  const user = await registerPrincipal(app, { name, email, organisationName: `${role} Own` });
  await request(app)
    .post('/api/v1/invitations/accept')
    .set(bearer(user.accessToken))
    .send({ token: inviteToken })
    .expect(200);

  const switched = await request(app)
    .post('/api/v1/auth/switch-org')
    .set(bearer(user.accessToken))
    .send({ organisationId: ownerPrincipal.orgId })
    .expect(200);
  return { ...user, accessToken: switched.body.data.accessToken as string };
}

beforeAll(async () => {
  await connectTestDatabase();
  owner = await registerPrincipal(app, { name: 'Org Admin', organisationName: 'Lifecycle Corp' });
  outsider = await registerPrincipal(app, { name: 'Outsider', organisationName: 'Other Corp' });
  carol = await joinOrg(
    owner,
    `carol-${Math.random().toString(36).slice(2, 10)}@example.test`,
    'Carol',
    'ASSET_MANAGER',
  );
  viewer = await joinOrg(
    owner,
    `viewer-${Math.random().toString(36).slice(2, 10)}@example.test`,
    'Viewer',
    'VIEWER',
  );
});

afterAll(async () => {
  await disconnectTestDatabase();
});

describe('assigning assets', () => {
  it('assigns an available asset and opens an assignment record', async () => {
    const asset = await createAsset();

    const assigned = await request(app)
      .post(`/api/v1/assets/${asset.id}/assign`)
      .set(bearer(owner.accessToken))
      .send({ assignedToUserId: carol.userId, notes: 'For the design team' })
      .expect(200);
    expect(assigned.body.data.status).toBe('assigned');
    expect(assigned.body.data.assignedToUserId).toBe(carol.userId);
    expect(assigned.body.data.assignedToName).toBe('Carol');

    const history = await getHistory(asset.id);
    expect(history.assignments).toHaveLength(1);
    const row = history.assignments[0]!;
    expect(row.assignedToUserId).toBe(carol.userId);
    expect(row.assignedToName).toBe('Carol');
    expect(row.assignedByName).toBe('Org Admin');
    expect(row.returnedAt).toBeNull();
    expect(row.notes).toBe('For the design team');
  });

  it('rejects double assignment and non-member targets', async () => {
    const asset = await createAsset();
    await request(app)
      .post(`/api/v1/assets/${asset.id}/assign`)
      .set(bearer(owner.accessToken))
      .send({ assignedToUserId: carol.userId })
      .expect(200);

    const again = await request(app)
      .post(`/api/v1/assets/${asset.id}/assign`)
      .set(bearer(owner.accessToken))
      .send({ assignedToUserId: viewer.userId })
      .expect(409);
    expect(again.body.error.message).toContain('already assigned');

    const fresh = await createAsset();
    const nonMember = await request(app)
      .post(`/api/v1/assets/${fresh.id}/assign`)
      .set(bearer(owner.accessToken))
      .send({ assignedToUserId: outsider.userId })
      .expect(409);
    expect(nonMember.body.error.message).toContain('not a member');
  });

  it('validates input and blocks viewers', async () => {
    const asset = await createAsset();

    await request(app)
      .post(`/api/v1/assets/${asset.id}/assign`)
      .set(bearer(owner.accessToken))
      .send({})
      .expect(400);

    await request(app)
      .post(`/api/v1/assets/${asset.id}/assign`)
      .set(bearer(viewer.accessToken))
      .send({ assignedToUserId: carol.userId })
      .expect(403);

    await request(app)
      .post(`/api/v1/assets/${asset.id}/assign`)
      .set(bearer(outsider.accessToken))
      .send({ assignedToUserId: carol.userId })
      .expect(404);
  });
});

describe('returning assets', () => {
  it('returns an asset, updates condition and closes the assignment exactly once', async () => {
    const asset = await createAsset();
    await request(app)
      .post(`/api/v1/assets/${asset.id}/assign`)
      .set(bearer(owner.accessToken))
      .send({ assignedToUserId: carol.userId })
      .expect(200);

    const returned = await request(app)
      .post(`/api/v1/assets/${asset.id}/return`)
      .set(bearer(owner.accessToken))
      .send({ condition: 'poor', notes: 'Screen damaged' })
      .expect(200);
    expect(returned.body.data.status).toBe('available');
    expect(returned.body.data.assignedToUserId).toBeNull();
    expect(returned.body.data.condition).toBe('poor');

    const history = await getHistory(asset.id);
    expect(history.assignments).toHaveLength(1);
    const row = history.assignments[0]!;
    expect(row.returnedAt).not.toBeNull();
    expect(row.returnedByName).toBe('Org Admin');
    expect(row.returnCondition).toBe('poor');
    expect(row.assignedToUserId).toBe(carol.userId);
    expect(row.assignedAt).toBeTruthy();

    const again = await request(app)
      .post(`/api/v1/assets/${asset.id}/return`)
      .set(bearer(owner.accessToken))
      .send({})
      .expect(409);
    expect(again.body.error.message).toContain('not currently assigned');
  });

  it('blocks viewers from returning assets', async () => {
    const asset = await createAsset();
    await request(app)
      .post(`/api/v1/assets/${asset.id}/assign`)
      .set(bearer(owner.accessToken))
      .send({ assignedToUserId: carol.userId })
      .expect(200);

    await request(app)
      .post(`/api/v1/assets/${asset.id}/return`)
      .set(bearer(viewer.accessToken))
      .send({})
      .expect(403);
  });
});

describe('transferring assets', () => {
  it('moves custody between members and writes an immutable transfer record', async () => {
    const asset = await createAsset();
    await request(app)
      .post(`/api/v1/assets/${asset.id}/assign`)
      .set(bearer(owner.accessToken))
      .send({ assignedToUserId: carol.userId })
      .expect(200);

    const transferred = await request(app)
      .post(`/api/v1/assets/${asset.id}/transfer`)
      .set(bearer(owner.accessToken))
      .send({ toUserId: viewer.userId, notes: 'Reassigned after onboarding' })
      .expect(200);
    expect(transferred.body.data.status).toBe('assigned');
    expect(transferred.body.data.assignedToUserId).toBe(viewer.userId);
    expect(transferred.body.data.assignedToName).toBe('Viewer');

    const history = await getHistory(asset.id);
    expect(history.transfers).toHaveLength(1);
    const transfer = history.transfers[0]!;
    expect(transfer.fromUserId).toBe(carol.userId);
    expect(transfer.fromUserName).toBe('Carol');
    expect(transfer.toUserId).toBe(viewer.userId);
    expect(transfer.transferredByName).toBe('Org Admin');
    expect(transfer.notes).toBe('Reassigned after onboarding');

    expect(history.assignments).toHaveLength(2);
    const [open, closed] = history.assignments;
    expect(closed!.assignedToUserId).toBe(carol.userId);
    expect(closed!.returnedAt).not.toBeNull();
    expect(closed!.returnCondition).toBeNull();
    expect(open!.assignedToUserId).toBe(viewer.userId);
    expect(open!.returnedAt).toBeNull();
  });

  it('rejects self-transfers, non-members and unassigned assets', async () => {
    const asset = await createAsset();

    await request(app)
      .post(`/api/v1/assets/${asset.id}/transfer`)
      .set(bearer(owner.accessToken))
      .send({ toUserId: carol.userId })
      .expect(409);

    await request(app)
      .post(`/api/v1/assets/${asset.id}/assign`)
      .set(bearer(owner.accessToken))
      .send({ assignedToUserId: carol.userId })
      .expect(200);

    const selfTransfer = await request(app)
      .post(`/api/v1/assets/${asset.id}/transfer`)
      .set(bearer(owner.accessToken))
      .send({ toUserId: carol.userId })
      .expect(409);
    expect(selfTransfer.body.error.message).toContain('already assigned');

    await request(app)
      .post(`/api/v1/assets/${asset.id}/transfer`)
      .set(bearer(owner.accessToken))
      .send({ toUserId: outsider.userId })
      .expect(409);

    await request(app)
      .post(`/api/v1/assets/${asset.id}/transfer`)
      .set(bearer(viewer.accessToken))
      .send({ toUserId: owner.userId })
      .expect(403);
  });
});

describe('retiring assets', () => {
  it('retires an available asset and blocks later use', async () => {
    const asset = await createAsset();

    const retired = await request(app)
      .post(`/api/v1/assets/${asset.id}/retire`)
      .set(bearer(owner.accessToken))
      .send({ reason: 'End of life' })
      .expect(200);
    expect(retired.body.data.status).toBe('retired');
    expect(retired.body.data.retiredAt).not.toBeNull();
    expect(retired.body.data.retirementReason).toBe('End of life');

    await request(app)
      .post(`/api/v1/assets/${asset.id}/retire`)
      .set(bearer(owner.accessToken))
      .send({})
      .expect(409);

    await request(app)
      .post(`/api/v1/assets/${asset.id}/assign`)
      .set(bearer(owner.accessToken))
      .send({ assignedToUserId: carol.userId })
      .expect(409);
  });

  it('requires a return before retiring an assigned asset', async () => {
    const asset = await createAsset();
    await request(app)
      .post(`/api/v1/assets/${asset.id}/assign`)
      .set(bearer(owner.accessToken))
      .send({ assignedToUserId: carol.userId })
      .expect(200);

    const blocked = await request(app)
      .post(`/api/v1/assets/${asset.id}/retire`)
      .set(bearer(owner.accessToken))
      .send({})
      .expect(409);
    expect(blocked.body.error.message).toContain('Return the asset');

    await request(app)
      .post(`/api/v1/assets/${asset.id}/retire`)
      .set(bearer(viewer.accessToken))
      .send({})
      .expect(403);
  });
});

describe('history and deletion rules', () => {
  it('never overwrites assignment rows across a full lifecycle', async () => {
    const asset = await createAsset();

    await request(app)
      .post(`/api/v1/assets/${asset.id}/assign`)
      .set(bearer(owner.accessToken))
      .send({ assignedToUserId: carol.userId })
      .expect(200);
    await request(app)
      .post(`/api/v1/assets/${asset.id}/return`)
      .set(bearer(owner.accessToken))
      .send({ condition: 'good' })
      .expect(200);
    await request(app)
      .post(`/api/v1/assets/${asset.id}/assign`)
      .set(bearer(owner.accessToken))
      .send({ assignedToUserId: viewer.userId })
      .expect(200);
    await request(app)
      .post(`/api/v1/assets/${asset.id}/transfer`)
      .set(bearer(owner.accessToken))
      .send({ toUserId: carol.userId })
      .expect(200);

    const history = await getHistory(asset.id);
    expect(history.assignments).toHaveLength(3);
    expect(history.transfers).toHaveLength(1);

    const closedRows = history.assignments.filter((row) => row.returnedAt !== null);
    expect(closedRows).toHaveLength(2);
    for (const row of closedRows) {
      expect(row.assignedAt).toBeTruthy();
      expect(row.assignedToUserId).toBeTruthy();
    }
    expect(history.assignments.at(0)?.assignedToUserId).toBe(carol.userId);
    expect(history.assignments.at(0)?.returnedAt).toBeNull();
  });

  it('refuses to delete assets that carry history', async () => {
    const asset = await createAsset();
    await request(app)
      .post(`/api/v1/assets/${asset.id}/assign`)
      .set(bearer(owner.accessToken))
      .send({ assignedToUserId: carol.userId })
      .expect(200);
    await request(app)
      .post(`/api/v1/assets/${asset.id}/return`)
      .set(bearer(owner.accessToken))
      .send({})
      .expect(200);

    const blocked = await request(app)
      .delete(`/api/v1/assets/${asset.id}`)
      .set(bearer(owner.accessToken))
      .expect(409);
    expect(blocked.body.error.message).toContain('history');
  });

  it('keeps history tenant-scoped', async () => {
    const asset = await createAsset();

    await request(app)
      .get(`/api/v1/assets/${asset.id}/history`)
      .set(bearer(outsider.accessToken))
      .expect(404);

    await request(app)
      .get(`/api/v1/assets/${asset.id}/history`)
      .set(bearer(viewer.accessToken))
      .expect(200);
  });
});
