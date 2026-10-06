import cors from 'cors';
import express, { type Application } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { ERROR_CODES } from '@assetflow/shared';
import { env } from './config/env.js';
import { HttpError } from './lib/http-error.js';
import { accessLog } from './middleware/access-log.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestId } from './middleware/request-id.js';
import { createApiRouter } from './routes/index.js';
import type { AssetCategoryService } from './services/asset-category-service.js';
import type { AssetService } from './services/asset-service.js';
import type { AuthService } from './services/auth-service.js';
import type { CredentialService } from './services/credential-service.js';
import type { HealthService } from './services/health-service.js';
import type { InvitationService } from './services/invitation-service.js';
import type { LocationService } from './services/location-service.js';
import type { MemberService } from './services/member-service.js';
import type { OrganisationService } from './services/organisation-service.js';

export interface AppServices {
  healthService: HealthService;
  auth: AuthService;
  credentials: CredentialService;
  organisations: OrganisationService;
  members: MemberService;
  invitations: InvitationService;
  assetCategories: AssetCategoryService;
  locations: LocationService;
  assets: AssetService;
}

function createRateLimiter(limit: number, windowMs: number, message: string) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new HttpError(429, ERROR_CODES.RATE_LIMITED, message));
    },
  });
}

export function createApp(services: AppServices): Application {
  const app = express();

  app.disable('x-powered-by');
  if (env.TRUST_PROXY_HOPS > 0) {
    app.set('trust proxy', env.TRUST_PROXY_HOPS);
  }

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(requestId);
  app.use(express.json({ limit: '100kb' }));
  app.use(accessLog);
  app.use(
    '/api/v1',
    createRateLimiter(
      env.RATE_LIMIT_MAX,
      env.RATE_LIMIT_WINDOW_MS,
      'Too many requests, please try again later.',
    ),
  );
  app.use(
    '/api/v1',
    createApiRouter({
      ...services,
      authRateLimiter: createRateLimiter(
        env.AUTH_RATE_LIMIT_MAX,
        env.AUTH_RATE_LIMIT_WINDOW_MS,
        'Too many attempts. Please wait a few minutes and try again.',
      ),
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
