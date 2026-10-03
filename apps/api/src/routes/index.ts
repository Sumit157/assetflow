import { Router, type RequestHandler } from 'express';
import { requireAuth } from '../middleware/require-auth.js';
import type { AuthService } from '../services/auth-service.js';
import type { CredentialService } from '../services/credential-service.js';
import type { HealthService } from '../services/health-service.js';
import type { InvitationService } from '../services/invitation-service.js';
import type { MemberService } from '../services/member-service.js';
import type { OrganisationService } from '../services/organisation-service.js';
import { createAuthRouter } from './auth-router.js';
import { createHealthRouter } from './health-router.js';
import { createInvitationsRouter } from './invitations-router.js';
import { createOrganisationsRouter } from './organisations-router.js';

export interface RouterDeps {
  healthService: HealthService;
  auth: AuthService;
  credentials: CredentialService;
  organisations: OrganisationService;
  members: MemberService;
  invitations: InvitationService;
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

  return router;
}
