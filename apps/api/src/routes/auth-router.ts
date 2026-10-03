import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import { requireObjectId } from '../lib/object-id.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../lib/password.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from '../lib/refresh-cookie.js';
import { requireAuth } from '../middleware/require-auth.js';
import { validateBody } from '../middleware/validate.js';
import type { RequestContext, AuthService } from '../services/auth-service.js';
import type { CredentialService } from '../services/credential-service.js';

export interface AuthRouterDeps {
  auth: AuthService;
  credentials: CredentialService;
  authRateLimiter: RequestHandler;
}

const emailSchema = z.email('Enter a valid email address.');
const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH);

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(100),
  email: emailSchema,
  password: passwordSchema,
  organisationName: z.string().trim().min(1, 'Enter an organisation name.').max(120),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.').max(PASSWORD_MAX_LENGTH),
});

const forgotSchema = z.object({ email: emailSchema });

const resetSchema = z.object({
  token: z.string().min(1).max(256),
  password: passwordSchema,
});

const tokenSchema = z.object({ token: z.string().min(1).max(256) });

const switchOrgSchema = z.object({ organisationId: z.string().min(1).max(64) });

function contextFrom(req: Request): RequestContext {
  return {
    ip: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  };
}

export function createAuthRouter(deps: AuthRouterDeps): Router {
  const router = Router();
  const authenticate = requireAuth((token) => deps.auth.verifyAccessToken(token));

  router.post('/register', deps.authRateLimiter, validateBody(registerSchema), async (req, res) => {
    const outcome = await deps.auth.register(req.body, contextFrom(req));
    setRefreshCookie(res, outcome.refreshToken, outcome.refreshExpiresAt);
    res.status(201).json({ data: outcome.response });
  });

  router.post('/login', deps.authRateLimiter, validateBody(loginSchema), async (req, res) => {
    const outcome = await deps.auth.login(req.body, contextFrom(req));
    setRefreshCookie(res, outcome.refreshToken, outcome.refreshExpiresAt);
    res.json({ data: outcome.response });
  });

  router.post('/refresh', async (req, res) => {
    const outcome = await deps.auth.refresh(readRefreshCookie(req), contextFrom(req));
    setRefreshCookie(res, outcome.refreshToken, outcome.refreshExpiresAt);
    res.json({ data: outcome.response });
  });

  router.post('/logout', async (req, res) => {
    await deps.auth.logout(readRefreshCookie(req), contextFrom(req));
    clearRefreshCookie(res);
    res.json({ data: null });
  });

  router.post(
    '/forgot-password',
    deps.authRateLimiter,
    validateBody(forgotSchema),
    async (req, res) => {
      await deps.credentials.forgotPassword(req.body.email, contextFrom(req));
      res.json({ data: null });
    },
  );

  router.post(
    '/reset-password',
    deps.authRateLimiter,
    validateBody(resetSchema),
    async (req, res) => {
      await deps.credentials.resetPassword(req.body, contextFrom(req));
      res.json({ data: null });
    },
  );

  router.post(
    '/verify-email',
    deps.authRateLimiter,
    validateBody(tokenSchema),
    async (req, res) => {
      await deps.credentials.verifyEmail(req.body.token, contextFrom(req));
      res.json({ data: null });
    },
  );

  router.post('/resend-verification', deps.authRateLimiter, authenticate, async (req, res) => {
    await deps.credentials.resendVerification(req.auth!, contextFrom(req));
    res.json({ data: null });
  });

  router.get('/me', authenticate, async (req, res) => {
    res.json({ data: await deps.auth.me(req.auth!) });
  });

  router.post('/switch-org', authenticate, validateBody(switchOrgSchema), async (req, res) => {
    const outcome = await deps.auth.switchOrganisation(
      req.auth!,
      req.body.organisationId,
      contextFrom(req),
    );
    res.json({ data: outcome.response });
  });

  router.get('/sessions', authenticate, async (req, res) => {
    res.json({ data: await deps.auth.listSessions(req.auth!) });
  });

  router.delete('/sessions/:id', authenticate, async (req, res) => {
    await deps.auth.revokeSession(req.auth!, requireObjectId(String(req.params.id)));
    res.json({ data: null });
  });

  return router;
}
