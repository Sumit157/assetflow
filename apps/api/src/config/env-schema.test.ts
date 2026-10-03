import { describe, expect, it } from 'vitest';
import { envSchema } from './env-schema.js';

const DEV_SECRET = 'assetflow-development-jwt-secret-not-for-production';

describe('envSchema', () => {
  it('applies development defaults', () => {
    const parsed = envSchema.parse({ JWT_SECRET: DEV_SECRET });
    expect(parsed.NODE_ENV).toBe('development');
    expect(parsed.PORT).toBe(4000);
    expect(parsed.MONGODB_URI).toBe('mongodb://localhost:27018/assetflow');
    expect(parsed.REDIS_URL).toBe('redis://localhost:6379');
    expect(parsed.CORS_ORIGINS).toBe('http://localhost:5175');
    expect(parsed.WEB_URL).toBe('http://localhost:5175');
    expect(parsed.ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(parsed.REFRESH_TOKEN_TTL_DAYS).toBe(30);
    expect(parsed.AUTH_RATE_LIMIT_MAX).toBe(15);
    expect(parsed.EMAIL_TRANSPORT).toBe('log');
    expect(parsed.JWT_SECRET).toBe(DEV_SECRET);
  });

  it('coerces numeric values from strings', () => {
    const parsed = envSchema.parse({
      JWT_SECRET: DEV_SECRET,
      PORT: '5000',
      TRUST_PROXY_HOPS: '2',
      AUTH_RATE_LIMIT_MAX: '1000',
    });
    expect(parsed.PORT).toBe(5000);
    expect(parsed.TRUST_PROXY_HOPS).toBe(2);
    expect(parsed.AUTH_RATE_LIMIT_MAX).toBe(1000);
  });

  it('rejects a missing jwt secret', () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['JWT_SECRET']);
    }
  });

  it('rejects a jwt secret below the minimum length', () => {
    const result = envSchema.safeParse({ JWT_SECRET: 'too-short' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid email transport', () => {
    const result = envSchema.safeParse({ JWT_SECRET: DEV_SECRET, EMAIL_TRANSPORT: 'smtp' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid web url', () => {
    const result = envSchema.safeParse({ JWT_SECRET: DEV_SECRET, WEB_URL: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-numeric port', () => {
    const result = envSchema.safeParse({ JWT_SECRET: DEV_SECRET, PORT: 'not-a-number' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid log level', () => {
    const result = envSchema.safeParse({ JWT_SECRET: DEV_SECRET, LOG_LEVEL: 'verbose' });
    expect(result.success).toBe(false);
  });

  it('rejects negative trust proxy hops', () => {
    const result = envSchema.safeParse({ JWT_SECRET: DEV_SECRET, TRUST_PROXY_HOPS: '-1' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty mongo uri', () => {
    const result = envSchema.safeParse({ JWT_SECRET: DEV_SECRET, MONGODB_URI: '' });
    expect(result.success).toBe(false);
  });
});
