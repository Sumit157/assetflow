import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import type { AssetListQuery } from '@assetflow/types';
import { PERMISSIONS } from '@assetflow/shared';
import { requireObjectId } from '../lib/object-id.js';
import { requirePermission } from '../middleware/require-permission.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import type { AssetService } from '../services/asset-service.js';

export interface AssetsRouterDeps {
  assets: AssetService;
  authenticate: RequestHandler;
}

const conditionSchema = z.enum(['good', 'fair', 'poor']);

const createAssetSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name for this asset.').max(160),
  assetTag: z.string().trim().min(1, 'Enter an asset tag.').max(50),
  description: z.string().trim().max(2000).nullish(),
  categoryId: z.string().trim().min(1).nullish(),
  locationId: z.string().trim().min(1).nullish(),
  serialNumber: z.string().trim().max(100).nullish(),
  condition: conditionSchema.optional(),
});

const updateAssetSchema = createAssetSchema.partial();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).optional(),
  status: z.enum(['available', 'assigned', 'retired']).optional(),
  categoryId: z.string().trim().min(1).optional(),
  locationId: z.string().trim().min(1).optional(),
  assignedTo: z.string().trim().min(1).optional(),
  sortBy: z.enum(['createdAt', 'name', 'assetTag']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

const assignSchema = z.object({
  assignedToUserId: z.string().trim().min(1, 'Choose who to assign this asset to.'),
  notes: z.string().trim().max(1000).nullish(),
});

const returnSchema = z.object({
  condition: conditionSchema.optional(),
  notes: z.string().trim().max(1000).nullish(),
});

const transferSchema = z.object({
  toUserId: z.string().trim().min(1, 'Choose who to transfer this asset to.'),
  toLocationId: z.string().trim().min(1).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

const retireSchema = z.object({
  reason: z.string().trim().max(500).nullish(),
});

export function createAssetsRouter(deps: AssetsRouterDeps): Router {
  const router = Router();
  const ipOf = (req: Request) => req.ip ?? null;

  router.use(deps.authenticate);

  router.get(
    '/',
    requirePermission(PERMISSIONS.ASSETS_VIEW),
    validateQuery(listQuerySchema),
    async (req, res) => {
      res.json({ data: await deps.assets.list(req.auth!, req.validatedQuery as AssetListQuery) });
    },
  );

  router.post(
    '/',
    requirePermission(PERMISSIONS.ASSETS_CREATE),
    validateBody(createAssetSchema),
    async (req, res) => {
      const asset = await deps.assets.create(req.auth!, req.body, ipOf(req));
      res.status(201).json({ data: asset });
    },
  );

  router.get('/:assetId', requirePermission(PERMISSIONS.ASSETS_VIEW), async (req, res) => {
    res.json({
      data: await deps.assets.get(req.auth!, requireObjectId(String(req.params.assetId))),
    });
  });

  router.patch(
    '/:assetId',
    requirePermission(PERMISSIONS.ASSETS_UPDATE),
    validateBody(updateAssetSchema),
    async (req, res) => {
      const asset = await deps.assets.update(
        req.auth!,
        requireObjectId(String(req.params.assetId)),
        req.body,
        ipOf(req),
      );
      res.json({ data: asset });
    },
  );

  router.delete('/:assetId', requirePermission(PERMISSIONS.ASSETS_DELETE), async (req, res) => {
    await deps.assets.remove(req.auth!, requireObjectId(String(req.params.assetId)), ipOf(req));
    res.json({ data: null });
  });

  router.post(
    '/:assetId/assign',
    requirePermission(PERMISSIONS.ASSETS_ASSIGN),
    validateBody(assignSchema),
    async (req, res) => {
      const asset = await deps.assets.assign(
        req.auth!,
        requireObjectId(String(req.params.assetId)),
        req.body,
        ipOf(req),
      );
      res.json({ data: asset });
    },
  );

  router.post(
    '/:assetId/return',
    requirePermission(PERMISSIONS.ASSETS_ASSIGN),
    validateBody(returnSchema),
    async (req, res) => {
      const asset = await deps.assets.returnAsset(
        req.auth!,
        requireObjectId(String(req.params.assetId)),
        req.body,
        ipOf(req),
      );
      res.json({ data: asset });
    },
  );

  router.post(
    '/:assetId/transfer',
    requirePermission(PERMISSIONS.ASSETS_TRANSFER),
    validateBody(transferSchema),
    async (req, res) => {
      const asset = await deps.assets.transfer(
        req.auth!,
        requireObjectId(String(req.params.assetId)),
        req.body,
        ipOf(req),
      );
      res.json({ data: asset });
    },
  );

  router.post(
    '/:assetId/retire',
    requirePermission(PERMISSIONS.ASSETS_UPDATE),
    validateBody(retireSchema),
    async (req, res) => {
      const asset = await deps.assets.retire(
        req.auth!,
        requireObjectId(String(req.params.assetId)),
        req.body,
        ipOf(req),
      );
      res.json({ data: asset });
    },
  );

  router.get('/:assetId/history', requirePermission(PERMISSIONS.ASSETS_VIEW), async (req, res) => {
    res.json({
      data: await deps.assets.history(req.auth!, requireObjectId(String(req.params.assetId))),
    });
  });

  return router;
}
