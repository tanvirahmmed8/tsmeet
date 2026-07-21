import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { httpRequestDuration } from '../services/metrics';

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const requestId = String(req.headers['x-request-id'] || randomUUID());
  res.setHeader('x-request-id', requestId);
  const startedAt = Date.now();

  res.on('finish', () => {
    httpRequestDuration.observe(
      { method: req.method, route: req.route?.path || req.path, status: String(res.statusCode) },
      (Date.now() - startedAt) / 1000
    );
    console.log(JSON.stringify({
      type: 'http_request',
      requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    }));
  });
  next();
}
