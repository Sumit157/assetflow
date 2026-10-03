import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

// Tighten both limiters for this file only. Environment variables are set
// before the app modules load so the config picks them up; they are restored
// afterwards because test files share one worker process.
process.env.RATE_LIMIT_MAX = '10';
process.env.AUTH_RATE_LIMIT_MAX = '3';

const { buildApp } = await import('../test-support/build-app.js');

afterAll(() => {
  process.env.RATE_LIMIT_MAX = '10000';
  process.env.AUTH_RATE_LIMIT_MAX = '1000';
});

describe('rate limiting', () => {
  it('rate limits clients that exceed the general budget', async () => {
    const { app } = buildApp();

    for (let i = 0; i < 10; i += 1) {
      await request(app).get('/api/v1/health/live').expect(200);
    }

    const response = await request(app).get('/api/v1/health/live').expect(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
    expect(response.body.error.requestId).toBeTruthy();
  });

  it('applies a stricter budget to authentication endpoints', async () => {
    const { app } = buildApp();
    const invalid = { name: '', email: 'nope', password: 'x' };

    // The auth limiter runs before validation: three rejected attempts are
    // counted, the fourth trips the auth budget while the general budget
    // (10) still has room.
    for (let i = 0; i < 3; i += 1) {
      await request(app).post('/api/v1/auth/register').send(invalid).expect(400);
    }

    const response = await request(app).post('/api/v1/auth/register').send(invalid).expect(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
  });
});
