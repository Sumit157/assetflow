import { envSchema, type Env } from './env-schema.js';

if (process.env.NODE_ENV !== 'test' && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file present; rely on process environment.
  }
}

// Development/test fallback so the API runs without secrets configuration.
// Production startup fails unless JWT_SECRET is explicitly provided.
if (!process.env.JWT_SECRET && process.env.NODE_ENV !== 'production') {
  process.env.JWT_SECRET = 'assetflow-development-jwt-secret-not-for-production';
}

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const issues = result.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  console.error(`Invalid API environment configuration:\n${issues}`);
  process.exit(1);
}

export const env: Env & { corsOrigins: string[] } = {
  ...result.data,
  corsOrigins: result.data.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};
