import { Request, Response, NextFunction } from 'express';
import { logRequest } from '../utils/logger';

/**
 * Request logging middleware
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();

  // Override res.end to capture response time
  const originalEnd = res.end;
  res.end = function(chunk: any, encoding?: any, ...args: any[]) {
    const duration = Date.now() - startTime;

    // Log the request
    logRequest(
      req.method,
      req.originalUrl,
      res.statusCode,
      duration,
      req.get('User-Agent'),
      req.ip
    );

    // Call original end method
    return originalEnd.call(this, chunk, encoding, ...args);
  };

  next();
};

/**
 * Security headers middleware
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // HSTS header (only in production with HTTPS)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // CSP header
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;"
  );

  // Remove server information
  res.removeHeader('X-Powered-By');

  next();
};

/**
 * Request ID middleware for tracing
 */
export const requestId = (req: Request, res: Response, next: NextFunction): void => {
  const requestId = req.get('X-Request-ID') || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Add to request for use in controllers
  (req as any).requestId = requestId;

  // Add to response headers
  res.setHeader('X-Request-ID', requestId);

  next();
};

/**
 * CORS preflight handling middleware
 */
export const handlePreflight = (req: Request, res: Response, next: NextFunction): void => {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
};