import { Response } from 'express';
import { ApiError } from '../types';
import logger from './logger';

/**
 * Standard error codes
 */
export const ErrorCodes = {
  // Authentication errors
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  MFA_REQUIRED: 'MFA_REQUIRED',
  MFA_LOCKED: 'MFA_LOCKED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',

  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',

  // MFA errors
  MFA_TRANSACTION_NOT_FOUND: 'MFA_TRANSACTION_NOT_FOUND',
  MFA_TRANSACTION_EXPIRED: 'MFA_TRANSACTION_EXPIRED',
  INVALID_OTP: 'INVALID_OTP',
  MFA_CHALLENGE_REJECTED: 'MFA_CHALLENGE_REJECTED',

  // Session errors
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  INVALID_SESSION: 'INVALID_SESSION',

  // Rate limiting
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // Server errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  NOT_FOUND: 'NOT_FOUND',

  // Generic
  FORBIDDEN: 'FORBIDDEN',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED'
} as const;

/**
 * Create standardized API error
 */
export const createApiError = (
  error_code: string,
  message: string,
  details?: Record<string, unknown>
): ApiError => ({
  error_code,
  message,
  timestamp: new Date().toISOString(),
  details
});

/**
 * Send error response with proper logging
 */
export const sendErrorResponse = (
  res: Response,
  statusCode: number,
  error: ApiError,
  logDetails?: Record<string, unknown>
): void => {
  // Log error details
  logger.error('API Error', {
    statusCode,
    error,
    ...logDetails
  });

  // Send response
  res.status(statusCode).json(error);
};

/**
 * Handle authentication errors
 */
export const handleAuthError = (
  res: Response,
  errorType: 'invalid_credentials' | 'account_locked' | 'mfa_locked' | 'unauthorized' | 'token_expired' | 'invalid_token',
  details?: Record<string, unknown>
): void => {
  switch (errorType) {
    case 'invalid_credentials':
      sendErrorResponse(
        res,
        401,
        createApiError(
          ErrorCodes.INVALID_CREDENTIALS,
          'Username or password incorrect.',
          details
        ),
        details
      );
      break;

    case 'account_locked':
      sendErrorResponse(
        res,
        423,
        createApiError(
          ErrorCodes.ACCOUNT_LOCKED,
          'Account has been locked due to security reasons. Contact support.',
          details
        ),
        details
      );
      break;

    case 'mfa_locked':
      sendErrorResponse(
        res,
        423,
        createApiError(
          ErrorCodes.MFA_LOCKED,
          'MFA has been locked due to too many failed attempts.',
          details
        ),
        details
      );
      break;

    case 'unauthorized':
      sendErrorResponse(
        res,
        401,
        createApiError(
          ErrorCodes.UNAUTHORIZED,
          'Invalid or missing credentials.',
          details
        ),
        details
      );
      break;

    case 'token_expired':
      sendErrorResponse(
        res,
        401,
        createApiError(
          ErrorCodes.TOKEN_EXPIRED,
          'Token has expired.',
          details
        ),
        details
      );
      break;

    case 'invalid_token':
      sendErrorResponse(
        res,
        401,
        createApiError(
          ErrorCodes.INVALID_TOKEN,
          'Invalid token provided.',
          details
        ),
        details
      );
      break;
  }
};

/**
 * Handle MFA-related errors
 */
export const handleMFAError = (
  res: Response,
  errorType: 'transaction_not_found' | 'transaction_expired' | 'invalid_otp' | 'challenge_rejected',
  details?: Record<string, unknown>
): void => {
  switch (errorType) {
    case 'transaction_not_found':
      sendErrorResponse(
        res,
        404,
        createApiError(
          ErrorCodes.MFA_TRANSACTION_NOT_FOUND,
          'MFA transaction not found.',
          details
        ),
        details
      );
      break;

    case 'transaction_expired':
      sendErrorResponse(
        res,
        403,
        createApiError(
          ErrorCodes.MFA_TRANSACTION_EXPIRED,
          'MFA transaction has expired.',
          details
        ),
        details
      );
      break;

    case 'invalid_otp':
      sendErrorResponse(
        res,
        403,
        createApiError(
          ErrorCodes.INVALID_OTP,
          'Invalid or expired OTP.',
          details
        ),
        details
      );
      break;

    case 'challenge_rejected':
      sendErrorResponse(
        res,
        403,
        createApiError(
          ErrorCodes.MFA_CHALLENGE_REJECTED,
          'MFA challenge was rejected.',
          details
        ),
        details
      );
      break;
  }
};

/**
 * Handle session-related errors
 */
export const handleSessionError = (
  res: Response,
  errorType: 'not_found' | 'expired' | 'invalid',
  details?: Record<string, unknown>
): void => {
  switch (errorType) {
    case 'not_found':
      sendErrorResponse(
        res,
        404,
        createApiError(
          ErrorCodes.SESSION_NOT_FOUND,
          'Session not found.',
          details
        ),
        details
      );
      break;

    case 'expired':
      sendErrorResponse(
        res,
        401,
        createApiError(
          ErrorCodes.SESSION_EXPIRED,
          'Session has expired.',
          details
        ),
        details
      );
      break;

    case 'invalid':
      sendErrorResponse(
        res,
        401,
        createApiError(
          ErrorCodes.INVALID_SESSION,
          'Invalid session.',
          details
        ),
        details
      );
      break;
  }
};

/**
 * Handle rate limiting errors
 */
export const handleRateLimitError = (
  res: Response,
  details?: Record<string, unknown>
): void => {
  sendErrorResponse(
    res,
    429,
    createApiError(
      ErrorCodes.TOO_MANY_REQUESTS,
      'Too many requests. Please try again later.',
      details
    ),
    details
  );
};

/**
 * Handle generic client errors
 */
export const handleClientError = (
  res: Response,
  statusCode: 400 | 403 | 404 | 405,
  message: string,
  details?: Record<string, unknown>
): void => {
  const errorCodeMap = {
    400: ErrorCodes.BAD_REQUEST,
    403: ErrorCodes.FORBIDDEN,
    404: ErrorCodes.NOT_FOUND,
    405: ErrorCodes.METHOD_NOT_ALLOWED
  };

  sendErrorResponse(
    res,
    statusCode,
    createApiError(errorCodeMap[statusCode], message, details),
    details
  );
};

/**
 * Handle internal server errors
 */
export const handleInternalError = (
  res: Response,
  error?: Error,
  details?: Record<string, unknown>
): void => {
  const isDevelopment = process.env.NODE_ENV === 'development';

  sendErrorResponse(
    res,
    500,
    createApiError(
      ErrorCodes.INTERNAL_ERROR,
      'Internal server error occurred.',
      isDevelopment && error ? { error: error.message, stack: error.stack } : undefined
    ),
    {
      ...details,
      error: error?.message,
      stack: error?.stack
    }
  );
};

/**
 * Express error handler middleware
 */
export const errorHandler = (
  error: Error,
  req: Express.Request,
  res: Response,
  next: Express.NextFunction
): void => {
  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  if (!res.headersSent) {
    handleInternalError(res, error, {
      url: req.url,
      method: req.method
    });
  }
};