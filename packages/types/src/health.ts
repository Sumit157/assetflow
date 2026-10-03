export interface HealthLive {
  status: 'ok';
  timestamp: string;
  uptimeSeconds: number;
}

export type DependencyStatus = 'up' | 'down';

export interface HealthReady {
  status: 'ready' | 'degraded';
  dependencies: {
    mongo: DependencyStatus;
    redis: DependencyStatus;
  };
}
