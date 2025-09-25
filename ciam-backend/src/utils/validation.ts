import { body, query, param, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../types';

/**
 * Handle validation errors middleware
 */
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const error: ApiError = {
      code: 'VALIDATION_ERROR',
      message: 'Invalid input data',
      timestamp: new Date().toISOString(),
      details: {
        errors: errors.array().map(err => ({
          field: err.type === 'field' ? err.path : 'unknown',
          message: err.msg,
          value: err.type === 'field' ? err.value : undefined
        }))
      }
    };

    res.status(400).json(error);
    return;
  }

  next();
};

/**
 * Login request validation
 */
export const validateLoginRequest = [
  body('username')
    .isString()
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Username must be between 1 and 100 characters'),

  body('password')
    .isString()
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 1, max: 200 })
    .withMessage('Password must be between 1 and 200 characters'),

  body('drs_action_token')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('DRS action token must be less than 500 characters'),

  handleValidationErrors
];

/**
 * MFA challenge request validation
 */
export const validateMFAChallengeRequest = [
  body('username')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Username must be between 1 and 100 characters'),

  body('method')
    .isString()
    .isIn(['otp', 'push'])
    .withMessage('Method must be either "otp" or "push"'),

  body('sessionId')
    .optional()
    .isString()
    .matches(/^sess-[a-zA-Z0-9-]+$/)
    .withMessage('Invalid session ID format'),

  body('transactionId')
    .optional()
    .isString()
    .matches(/^tx-[a-zA-Z0-9-]+$/)
    .withMessage('Invalid transaction ID format'),

  handleValidationErrors
];

/**
 * MFA verify request validation
 */
export const validateMFAVerifyRequest = [
  body('transactionId')
    .isString()
    .notEmpty()
    .matches(/^tx-[a-zA-Z0-9-]+$/)
    .withMessage('Valid transaction ID is required'),

  body('otp')
    .optional()
    .isString()
    .isLength({ min: 4, max: 10 })
    .isNumeric()
    .withMessage('OTP must be a 4-10 digit number'),

  body('pushResult')
    .optional()
    .isString()
    .isIn(['APPROVED', 'REJECTED'])
    .withMessage('Push result must be either "APPROVED" or "REJECTED"'),

  handleValidationErrors
];

/**
 * Token refresh request validation
 */
export const validateTokenRefreshRequest = [
  body('refresh_token')
    .optional()
    .isString()
    .notEmpty()
    .withMessage('Refresh token must be a non-empty string'),

  handleValidationErrors
];

/**
 * Session verify request validation
 */
export const validateSessionVerifyRequest = [
  query('sessionId')
    .isString()
    .notEmpty()
    .matches(/^sess-[a-zA-Z0-9-]+$/)
    .withMessage('Valid session ID is required'),

  handleValidationErrors
];

/**
 * Transaction ID parameter validation
 */
export const validateTransactionIdParam = [
  param('transactionId')
    .isString()
    .matches(/^tx-[a-zA-Z0-9-]+$/)
    .withMessage('Valid transaction ID is required'),

  handleValidationErrors
];

/**
 * Session ID parameter validation
 */
export const validateSessionIdParam = [
  param('sessionId')
    .isString()
    .matches(/^sess-[a-zA-Z0-9-]+$/)
    .withMessage('Valid session ID is required'),

  handleValidationErrors
];

/**
 * Token revocation request validation
 */
export const validateTokenRevocationRequest = [
  body('token')
    .isString()
    .notEmpty()
    .withMessage('Token is required'),

  body('token_type_hint')
    .optional()
    .isString()
    .isIn(['access_token', 'refresh_token'])
    .withMessage('Token type hint must be either "access_token" or "refresh_token"'),

  handleValidationErrors
];

/**
 * Token introspection request validation
 */
export const validateTokenIntrospectionRequest = [
  body('token')
    .isString()
    .notEmpty()
    .withMessage('Token is required'),

  body('token_type_hint')
    .optional()
    .isString()
    .isIn(['access_token', 'refresh_token'])
    .withMessage('Token type hint must be either "access_token" or "refresh_token"'),

  handleValidationErrors
];

/**
 * Validate JWT token format
 */
export const isValidJWTFormat = (token: string): boolean => {
  const parts = token.split('.');
  return parts.length === 3 && parts.every(part => part.length > 0);
};

/**
 * Validate email format
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate password strength (basic)
 */
export const isValidPassword = (password: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (password.length > 200) {
    errors.push('Password must be less than 200 characters');
  }

  // Add more password validation rules as needed for production
  // if (!/[A-Z]/.test(password)) {
  //   errors.push('Password must contain at least one uppercase letter');
  // }
  //
  // if (!/[a-z]/.test(password)) {
  //   errors.push('Password must contain at least one lowercase letter');
  // }
  //
  // if (!/\d/.test(password)) {
  //   errors.push('Password must contain at least one number');
  // }
  //
  // if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
  //   errors.push('Password must contain at least one special character');
  // }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Sanitize user input to prevent XSS
 */
export const sanitizeInput = (input: string): string => {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

/**
 * Validate session ID format
 */
export const isValidSessionId = (sessionId: string): boolean => {
  return /^sess-[a-zA-Z0-9-]+$/.test(sessionId);
};

/**
 * Validate transaction ID format
 */
export const isValidTransactionId = (transactionId: string): boolean => {
  return /^tx-[a-zA-Z0-9-]+$/.test(transactionId);
};