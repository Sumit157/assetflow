import type { Request, RequestHandler } from 'express';
import { logger } from '../lib/logger.js';

export const accessLog: RequestHandler = (req: Request, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    logger.info('request', {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10,
    });
  });
  next();
};
