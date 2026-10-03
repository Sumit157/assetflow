import { z } from 'zod';

const positiveInt = z.coerce.number().int().positive();

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: positiveInt.default(4000),
  MONGODB_URI: z.string().min(1).default('mongodb://localhost:27018/assetflow'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  CORS_ORIGINS: z.string().min(1).default('http://localhost:5175'),
  WEB_URL: z.url().default('http://localhost:5175'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  RATE_LIMIT_WINDOW_MS: positiveInt.default(60_000),
  RATE_LIMIT_MAX: positiveInt.default(300),
  AUTH_RATE_LIMIT_WINDOW_MS: positiveInt.default(900_000),
  AUTH_RATE_LIMIT_MAX: positiveInt.default(15),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: positiveInt.default(900),
  REFRESH_TOKEN_TTL_DAYS: positiveInt.default(30),
  EMAIL_TRANSPORT: z.enum(['log']).default('log'),
});

export type Env = z.infer<typeof envSchema>;
