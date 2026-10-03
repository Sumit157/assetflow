import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../test-support/build-app.js';

describe('GET /api/v1/health/live', () => {
  it('returns process health in a success envelope', async () => {
    const app = buildApp().app;
    const response = await request(app).get('/api/v1/health/live').expect(200);

    expect(response.body.data.status).toBe('ok');
    expect(response.headers['x-request-id']).toBeTruthy();
  });
});

describe('GET /api/v1/health/ready', () => {
  it('returns 200 when every dependency is up', async () => {
    const app = buildApp().app;
    const response = await request(app).get('/api/v1/health/ready').expect(200);

    expect(response.body.data.status).toBe('ready');
    expect(response.body.data.dependencies).toEqual({ mongo: 'up', redis: 'up' });
  });

  it('returns 503 with a degraded report when mongo is down', async () => {
    const { app } = buildApp({
      mongo: async () => {
        throw new Error('mongo down');
      },
    });
    const response = await request(app).get('/api/v1/health/ready').expect(503);

    expect(response.body.data.status).toBe('degraded');
    expect(response.body.data.dependencies.mongo).toBe('down');
  });
});
