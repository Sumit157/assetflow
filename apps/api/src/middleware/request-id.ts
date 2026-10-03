import type { Request, RequestHandler, Response } from 'express';
import { randomUUID } from 'node:crypto';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const requestId: RequestHandler = (req: Request, res: Response, next) => {
  const incoming = req.header('x-request-id');
  req.id = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
};
