import { describe, expect, it } from 'vitest';
import { createHealthService } from './health-service.js';

const never = async () => undefined;
const failing = async () => {
  throw new Error('dependency down');
};

describe('health service', () => {
  it('reports live status with uptime and timestamp', () => {
    const service = createHealthService({ pingMongo: never, pingRedis: never });
    const live = service.live();
    expect(live.status).toBe('ok');
    expect(live.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(live.timestamp))).toBe(false);
  });

  it('reports ready when all dependencies respond', async () => {
    const service = createHealthService({ pingMongo: never, pingRedis: never });
    const report = await service.ready();
    expect(report).toEqual({
      status: 'ready',
      dependencies: { mongo: 'up', redis: 'up' },
    });
  });

  it('reports degraded when mongo is down', async () => {
    const service = createHealthService({ pingMongo: failing, pingRedis: never });
    const report = await service.ready();
    expect(report.status).toBe('degraded');
    expect(report.dependencies.mongo).toBe('down');
    expect(report.dependencies.redis).toBe('up');
  });

  it('reports degraded when redis is down', async () => {
    const service = createHealthService({ pingMongo: never, pingRedis: failing });
    const report = await service.ready();
    expect(report.status).toBe('degraded');
    expect(report.dependencies.redis).toBe('down');
  });
});
