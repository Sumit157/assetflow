import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '@assetflow/shared';
import { requireObjectId } from '../lib/object-id.js';
import { requirePermission } from '../middleware/require-permission.js';
import { validateBody } from '../middleware/validate.js';
import type { LocationService } from '../services/location-service.js';

export interface LocationsRouterDeps {
  locations: LocationService;
  authenticate: RequestHandler;
}

const locationSchema = z.object({
  name: z.string().trim().min(1, 'Enter a location name.').max(120),
  code: z.string().trim().max(40).nullish(),
});

export function createLocationsRouter(deps: LocationsRouterDeps): Router {
  const router = Router();
  const ipOf = (req: Request) => req.ip ?? null;

  router.use(deps.authenticate);

  router.get('/', requirePermission(PERMISSIONS.ASSETS_VIEW), async (req, res) => {
    res.json({ data: await deps.locations.list(req.auth!) });
  });

  router.post(
    '/',
    requirePermission(PERMISSIONS.ASSETS_CREATE),
    validateBody(locationSchema),
    async (req, res) => {
      const location = await deps.locations.create(req.auth!, req.body, ipOf(req));
      res.status(201).json({ data: location });
    },
  );

  router.patch(
    '/:locationId',
    requirePermission(PERMISSIONS.ASSETS_UPDATE),
    validateBody(locationSchema),
    async (req, res) => {
      const location = await deps.locations.update(
        req.auth!,
        requireObjectId(String(req.params.locationId)),
        req.body,
        ipOf(req),
      );
      res.json({ data: location });
    },
  );

  router.delete('/:locationId', requirePermission(PERMISSIONS.ASSETS_DELETE), async (req, res) => {
    await deps.locations.remove(
      req.auth!,
      requireObjectId(String(req.params.locationId)),
      ipOf(req),
    );
    res.json({ data: null });
  });

  return router;
}
