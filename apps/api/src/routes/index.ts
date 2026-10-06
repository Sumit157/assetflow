import { Router, type RequestHandler } from 'express';
import { requireAuth } from '../middleware/require-auth.js';
import type { AssetCategoryService } from '../services/asset-category-service.js';
import type { AssetService } from '../services/asset-service.js';
import type { AuthService } from '../services/auth-service.js';
import type { CredentialService } from '../services/credential-service.js';
import type { HealthService } from '../services/health-service.js';
import type { InvitationService } from '../services/invitation-service.js';
import type { LocationService } from '../services/location-service.js';
import type { MemberService } from '../services/member-service.js';
import type { OrganisationService } from '../services/organisation-service.js';
import { createAssetCategoriesRouter } from './asset-categories-router.js';
import { createAssetsRouter } from './assets-router.js';
import { createAuthRouter } from './auth-router.js';
import { createHealthRouter } from './health-router.js';
import { createInvitationsRouter } from './invitations-router.js';
import { createLocationsRouter } from './locations-router.js';
import { createOrganisationsRouter } from './organisations-router.js';

export interface RouterDeps {
  healthService: HealthService;
  auth: AuthService;
  credentials: CredentialService;
  organisations: OrganisationService;
  members: MemberService;
  invitations: InvitationService;
  assetCategories: AssetCategoryService;
  locations: LocationService;
  assets: AssetService;
  authRateLimiter: RequestHandler;
}

export function createApiRouter(deps: RouterDeps): Router {
  const router = Router();
  const authenticate = requireAuth((token) => deps.auth.verifyAccessToken(token));

  router.use('/health', createHealthRouter(deps.healthService));
  router.use(
    '/auth',
    createAuthRouter({
      auth: deps.auth,
      credentials: deps.credentials,
      authRateLimiter: deps.authRateLimiter,
    }),
  );
  router.use(
    '/organisations',
    createOrganisationsRouter({
      organisations: deps.organisations,
      members: deps.members,
      invitations: deps.invitations,
      authenticate,
    }),
  );
  router.use(
    '/invitations',
    createInvitationsRouter({ invitations: deps.invitations, auth: deps.auth }),
  );
  router.use(
    '/asset-categories',
    createAssetCategoriesRouter({ categories: deps.assetCategories, authenticate }),
  );
  router.use('/locations', createLocationsRouter({ locations: deps.locations, authenticate }));
  router.use('/assets', createAssetsRouter({ assets: deps.assets, authenticate }));

  return router;
}
