import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, extractBearerToken } from '../utils/jwt';
import { handleAuthError } from '../utils/errors';
import { logAuthEvent } from '../utils/logger';
import { AuthenticatedRequest, JWTPayload } from '../types';

/**
 * Middleware to authenticate JWT tokens
 */
export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.get('Authorization');
  const token = extractBearerToken(authHeader);

  if (!token) {
    logAuthEvent('unauthorized_access', undefined, {
      url: req.url,
      method: req.method,
      ip: req.ip,
      reason: 'missing_token'
    });

    handleAuthError(res, 'unauthorized', {
      reason: 'Missing or invalid Authorization header'
    });
    return;
  }

  const decoded = verifyAccessToken(token);
  if (!decoded) {
    logAuthEvent('unauthorized_access', undefined, {
      url: req.url,
      method: req.method,
      ip: req.ip,
      reason: 'invalid_token'
    });

    handleAuthError(res, 'invalid_token', {
      reason: 'Token verification failed'
    });
    return;
  }

  // Check token expiration
  const now = Math.floor(Date.now() / 1000);
  if (decoded.exp < now) {
    logAuthEvent('unauthorized_access', decoded.sub, {
      url: req.url,
      method: req.method,
      ip: req.ip,
      reason: 'token_expired'
    });

    handleAuthError(res, 'token_expired', {
      reason: 'Token has expired'
    });
    return;
  }

  // Attach user info to request
  req.user = decoded;
  req.sessionId = decoded.sessionId;

  next();
};

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
export const optionalAuthenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.get('Authorization');
  const token = extractBearerToken(authHeader);

  if (token) {
    const decoded = verifyAccessToken(token);
    if (decoded && decoded.exp > Math.floor(Date.now() / 1000)) {
      req.user = decoded;
      req.sessionId = decoded.sessionId;
    }
  }

  next();
};

/**
 * Middleware to check user roles
 */
export const requireRole = (...roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      handleAuthError(res, 'unauthorized', {
        reason: 'Authentication required for role check'
      });
      return;
    }

    const userRoles = req.user.roles || [];
    const hasRequiredRole = roles.some(role => userRoles.includes(role));

    if (!hasRequiredRole) {
      logAuthEvent('authorization_failure', req.user.sub, {
        url: req.url,
        method: req.method,
        requiredRoles: roles,
        userRoles,
        ip: req.ip
      });

      handleAuthError(res, 'unauthorized', {
        reason: 'Insufficient permissions',
        required: roles,
        current: userRoles
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to validate session ID matches token
 */
export const validateSession = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const { sessionId } = req.query;

  if (sessionId && req.sessionId && sessionId !== req.sessionId) {
    logAuthEvent('session_mismatch', req.user?.sub, {
      providedSessionId: sessionId,
      tokenSessionId: req.sessionId,
      ip: req.ip
    });

    handleAuthError(res, 'invalid_token', {
      reason: 'Session ID mismatch'
    });
    return;
  }

  next();
};

/**
 * Middleware to check if refresh token is present in cookies
 */
export const requireRefreshToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const refreshToken = req.cookies?.refresh_token;

  if (!refreshToken) {
    logAuthEvent('refresh_token_missing', undefined, {
      url: req.url,
      method: req.method,
      ip: req.ip
    });

    handleAuthError(res, 'unauthorized', {
      reason: 'Refresh token required'
    });
    return;
  }

  // Store refresh token in request for use by controller
  req.body.refresh_token = refreshToken;
  next();
};

/**
 * Middleware to extract user ID from various sources
 */
export const extractUserId = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let userId: string | undefined;

  // Try to get user ID from JWT token
  if (req.user) {
    userId = req.user.sub;
  }

  // Try to get user ID from request body
  if (!userId && req.body.username) {
    // TODO: Replace with actual user lookup in production
    userId = req.body.username === 'testuser' ? 'user-123' : undefined;
  }

  // Store user ID in request
  if (userId) {
    (req as any).userId = userId;
  }

  next();
};