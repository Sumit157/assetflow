import { Router } from 'express';
import type { HealthService } from '../services/health-service.js';

export function createHealthRouter(health: HealthService): Router {
  const router = Router();

  router.get('/live', (_req, res) => {
    res.json({ data: health.live() });
  });

  router.get('/ready', async (_req, res, next) => {
    try {
      const report = await health.ready();
      res.status(report.status === 'ready' ? 200 : 503).json({ data: report });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
