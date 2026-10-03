import type { HealthLive, HealthReady } from '@assetflow/types';

export interface HealthCheckDeps {
  pingMongo: () => Promise<void>;
  pingRedis: () => Promise<void>;
}

export interface HealthService {
  live(): HealthLive;
  ready(): Promise<HealthReady>;
}

async function probe(check: () => Promise<void>): Promise<'up' | 'down'> {
  try {
    await check();
    return 'up';
  } catch {
    return 'down';
  }
}

export function createHealthService(deps: HealthCheckDeps): HealthService {
  return {
    live(): HealthLive {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
      };
    },
    async ready(): Promise<HealthReady> {
      const [mongo, redis] = await Promise.all([probe(deps.pingMongo), probe(deps.pingRedis)]);
      return {
        status: mongo === 'up' && redis === 'up' ? 'ready' : 'degraded',
        dependencies: { mongo, redis },
      };
    },
  };
}
