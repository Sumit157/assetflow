import { Router, type Request } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/require-auth.js';
import { validateBody } from '../middleware/validate.js';
import type { AuthService, RequestContext } from '../services/auth-service.js';
import type { InvitationService } from '../services/invitation-service.js';

export interface InvitationsRouterDeps {
  invitations: InvitationService;
  auth: AuthService;
}

const acceptSchema = z.object({ token: z.string().min(1).max(256) });

function contextFrom(req: Request): RequestContext {
  return {
    ip: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  };
}

export function createInvitationsRouter(deps: InvitationsRouterDeps): Router {
  const router = Router();
  const authenticate = requireAuth((token) => deps.auth.verifyAccessToken(token));

  router.get('/:token', async (req, res) => {
    res.json({ data: await deps.invitations.preview(String(req.params.token ?? '')) });
  });

  router.post('/accept', authenticate, validateBody(acceptSchema), async (req, res) => {
    const result = await deps.invitations.accept(req.auth!, req.body.token, contextFrom(req));
    res.json({ data: result });
  });

  return router;
}
