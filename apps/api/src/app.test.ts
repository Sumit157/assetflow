import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp } from './test-support/build-app.js';

describe('API middleware and error handling', () => {
  it('returns a structured 404 envelope for unknown routes', async () => {
    const { app } = buildApp();
    const response = await request(app).get('/api/v1/does-not-exist').expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.message).toContain('/api/v1/does-not-exist');
    expect(response.body.error.requestId).toBeTruthy();
    expect(response.headers['x-request-id']).toBe(response.body.error.requestId);
  });

  it('honours a well-formed incoming x-request-id', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .get('/api/v1/health/live')
      .set('x-request-id', 'client-abc-123')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('client-abc-123');
  });

  it('replaces a malformed incoming x-request-id with a generated one', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .get('/api/v1/health/live')
      .set('x-request-id', 'not a valid id!!')
      .expect(200);

    expect(response.headers['x-request-id']).not.toBe('not a valid id!!');
    expect(response.headers['x-request-id']).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects malformed JSON bodies with a structured 400', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post('/api/v1/health/live')
      .set('content-type', 'application/json')
      .send('{"broken":')
      .expect(400);

    expect(response.body.error.code).toBe('BAD_REQUEST');
    expect(response.body.error.requestId).toBeTruthy();
  });

  it('rejects payloads above the body size limit with 413', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post('/api/v1/health/live')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ padding: 'x'.repeat(200_000) }))
      .expect(413);

    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
