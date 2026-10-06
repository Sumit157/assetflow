import type { Server } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { connectMongo, disconnectMongo, pingMongo } from './lib/mongo.js';
import { createRedisClient } from './lib/redis.js';
import { createAuditService } from './services/audit-service.js';
import { createAssetCategoryService } from './services/asset-category-service.js';
import { createAssetService } from './services/asset-service.js';
import { createAuthService } from './services/auth-service.js';
import { createCredentialService } from './services/credential-service.js';
import { createEmailService } from './services/email/email-service.js';
import { createEmailTransport } from './services/email/transport.js';
import { createHealthService } from './services/health-service.js';
import { createInvitationService } from './services/invitation-service.js';
import { createLocationService } from './services/location-service.js';
import { createMemberService } from './services/member-service.js';
import { createOrganisationService } from './services/organisation-service.js';

async function main(): Promise<void> {
  await connectMongo();

  const redis = createRedisClient(env.REDIS_URL);
  redis.on('error', (error) => logger.warn('Redis client error', { error }));
  await redis.connect();

  const email = createEmailService(createEmailTransport(env.EMAIL_TRANSPORT));
  const audit = createAuditService();

  const app = createApp({
    healthService: createHealthService({
      pingMongo,
      pingRedis: async () => {
        await redis.ping();
      },
    }),
    auth: createAuthService({ email, audit }),
    credentials: createCredentialService({ email, audit }),
    organisations: createOrganisationService({ audit }),
    members: createMemberService({ audit }),
    invitations: createInvitationService({ email, audit }),
    assetCategories: createAssetCategoryService({ audit }),
    locations: createLocationService({ audit }),
    assets: createAssetService({ audit }),
  });

  const server: Server = app.listen(env.PORT, () => {
    logger.info(`AssetFlow API listening on port ${env.PORT}`, { env: env.NODE_ENV });
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down`);

    server.close(() => {
      void (async () => {
        await redis.quit().catch(() => undefined);
        await disconnectMongo();
        logger.info('Shutdown complete');
        process.exit(0);
      })();
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.error('API failed to start', { error });
  process.exit(1);
});
