import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '@assetflow/shared';
import { requireObjectId } from '../lib/object-id.js';
import { requirePermission } from '../middleware/require-permission.js';
import { validateBody } from '../middleware/validate.js';
import type { AssetCategoryService } from '../services/asset-category-service.js';

export interface AssetCategoriesRouterDeps {
  categories: AssetCategoryService;
  authenticate: RequestHandler;
}

const categorySchema = z.object({
  name: z.string().trim().min(1, 'Enter a category name.').max(80),
  description: z.string().trim().max(500).nullish(),
});

export function createAssetCategoriesRouter(deps: AssetCategoriesRouterDeps): Router {
  const router = Router();
  const ipOf = (req: Request) => req.ip ?? null;

  router.use(deps.authenticate);

  router.get('/', requirePermission(PERMISSIONS.ASSETS_VIEW), async (req, res) => {
    res.json({ data: await deps.categories.list(req.auth!) });
  });

  router.post(
    '/',
    requirePermission(PERMISSIONS.ASSETS_CREATE),
    validateBody(categorySchema),
    async (req, res) => {
      const category = await deps.categories.create(req.auth!, req.body, ipOf(req));
      res.status(201).json({ data: category });
    },
  );

  router.patch(
    '/:categoryId',
    requirePermission(PERMISSIONS.ASSETS_UPDATE),
    validateBody(categorySchema),
    async (req, res) => {
      const category = await deps.categories.update(
        req.auth!,
        requireObjectId(String(req.params.categoryId)),
        req.body,
        ipOf(req),
      );
      res.json({ data: category });
    },
  );

  router.delete('/:categoryId', requirePermission(PERMISSIONS.ASSETS_DELETE), async (req, res) => {
    await deps.categories.remove(
      req.auth!,
      requireObjectId(String(req.params.categoryId)),
      ipOf(req),
    );
    res.json({ data: null });
  });

  return router;
}
