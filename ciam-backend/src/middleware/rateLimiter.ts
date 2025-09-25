import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { handleRateLimitError } from '../utils/errors';
import { logRateLimitEvent } from '../utils/logger';

/**
 * Rate limiter configuration
 */
const getRateLimitConfig = (windowMs: number, max: number, message?: string) => ({
  windowMs,
  max,
  message,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    const remaining = res.getHeader('X-RateLimit-Remaining') as number;

    logRateLimitEvent(
      req.ip || 'unknown',
      req.path,
      max,
      remaining
    );

    handleRateLimitError(res, {
      ip: req.ip,
      endpoint: req.path,
      limit: max,
      windowMs,
      userAgent: req.get('User-Agent')
    });
  },
  skip: (req: Request) => {
    // Skip rate limiting in test environment
    return process.env.NODE_ENV === 'test';
  },
  keyGenerator: (req: Request) => {
    // Use IP address + endpoint for key generation
    return `${req.ip}:${req.path}`;
  }
});

/**
 * General API rate limiter (100 requests per 15 minutes)
 */
export const generalRateLimit = rateLimit(
  getRateLimitConfig(
    15 * 60 * 1000, // 15 minutes
    parseInt(process.env.RATE_LIMIT_MAX || '100'),
    'Too many requests from this IP, please try again later.'
  )
);

/**
 * Authentication rate limiter (5 attempts per 5 minutes per IP)
 */
export const authRateLimit = rateLimit(
  getRateLimitConfig(
    5 * 60 * 1000, // 5 minutes
    5,
    'Too many authentication attempts, please try again later.'
  )
);

/**
 * MFA rate limiter (10 attempts per 5 minutes per IP)
 */
export const mfaRateLimit = rateLimit(
  getRateLimitConfig(
    5 * 60 * 1000, // 5 minutes
    10,
    'Too many MFA attempts, please try again later.'
  )
);

/**
 * Token refresh rate limiter (30 attempts per hour)
 */
export const tokenRefreshRateLimit = rateLimit(
  getRateLimitConfig(
    60 * 60 * 1000, // 1 hour
    30,
    'Too many token refresh attempts, please try again later.'
  )
);

/**
 * Password reset rate limiter (3 attempts per hour per IP)
 */
export const passwordResetRateLimit = rateLimit(
  getRateLimitConfig(
    60 * 60 * 1000, // 1 hour
    3,
    'Too many password reset attempts, please try again later.'
  )
);

/**
 * Session management rate limiter (20 requests per 15 minutes)
 */
export const sessionRateLimit = rateLimit(
  getRateLimitConfig(
    15 * 60 * 1000, // 15 minutes
    20,
    'Too many session management requests, please try again later.'
  )
);

/**
 * Strict rate limiter for sensitive operations (1 attempt per minute)
 */
export const strictRateLimit = rateLimit(
  getRateLimitConfig(
    60 * 1000, // 1 minute
    1,
    'This operation is strictly rate limited. Please wait before trying again.'
  )
);

/**
 * User-specific rate limiter (based on user ID instead of IP)
 */
export const createUserRateLimit = (windowMs: number, max: number) => {
  return rateLimit({
    ...getRateLimitConfig(windowMs, max),
    keyGenerator: (req: Request) => {
      // Use user ID if authenticated, otherwise fall back to IP
      const userId = req.user?.sub;
      return userId ? `user:${userId}` : `ip:${req.ip}`;
    }
  });
};

/**
 * MFA verification rate limiter per transaction
 */
export const mfaVerificationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per transaction
  keyGenerator: (req: Request) => {
    const transactionId = req.body.transactionId || req.params.transactionId;
    return `mfa:${transactionId}`;
  },
  handler: (req: Request, res: Response) => {
    logRateLimitEvent(
      req.ip || 'unknown',
      `${req.path}:${req.body.transactionId}`,
      5,
      0
    );

    handleRateLimitError(res, {
      ip: req.ip,
      transactionId: req.body.transactionId,
      reason: 'Too many MFA verification attempts for this transaction'
    });
  },
  skip: (req: Request) => process.env.NODE_ENV === 'test'
});

/**
 * Account lockout prevention rate limiter
 * Applies stricter limits based on failed authentication attempts
 */
export const createAccountLockoutPrevention = () => {
  const failedAttempts = new Map<string, { count: number; lastAttempt: Date }>();

  return (req: Request, res: Response, next: Function) => {
    const key = `${req.ip}:${req.body.username || 'unknown'}`;
    const now = new Date();
    const attempts = failedAttempts.get(key);

    // Clean up old entries (older than 1 hour)
    if (attempts && now.getTime() - attempts.lastAttempt.getTime() > 60 * 60 * 1000) {
      failedAttempts.delete(key);
    }

    const currentAttempts = failedAttempts.get(key);
    if (currentAttempts && currentAttempts.count >= 10) {
      logRateLimitEvent(
        req.ip || 'unknown',
        req.path,
        10,
        0
      );

      handleRateLimitError(res, {
        reason: 'Account temporarily locked due to too many failed attempts',
        lockoutDuration: '1 hour'
      });
      return;
    }

    next();
  };
};