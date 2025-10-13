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
      error_code: 'VALIDATION_ERROR',
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

  body('app_id')
    .isString()
    .notEmpty()
    .withMessage('app_id is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('app_id must be between 1 and 100 characters'),

  body('app_version')
    .isString()
    .notEmpty()
    .withMessage('app_version is required')
    .isLength({ min: 1, max: 50 })
    .withMessage('app_version must be between 1 and 50 characters'),

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
  body('context_id')
    .isString()
    .notEmpty()
    .withMessage('context_id is required'),

  body('transaction_id')
    .isString()
    .notEmpty()
    .matches(/^tx-[a-zA-Z0-9-]+$/)
    .withMessage('Valid transaction_id is required'),

  body('method')
    .isString()
    .isIn(['sms', 'voice', 'push'])
    .withMessage('Method must be "sms", "voice", or "push"'),

  body('mfa_option_id')
    .optional()
    .isInt({ min: 1, max: 6 })
    .withMessage('mfa_option_id must be an integer between 1 and 6'),

  handleValidationErrors
];

/**
 * MFA OTP verify request validation (v3 - OTP specific)
 */
export const validateMFAVerifyRequest = [
  body('context_id')
    .isString()
    .notEmpty()
    .withMessage('context_id is required'),

  body('transaction_id')
    .isString()
    .notEmpty()
    .matches(/^mfa-[a-zA-Z0-9-]+$/)
    .withMessage('Valid transaction_id is required'),

  body('code')
    .isString()
    .notEmpty()
    .isLength({ min: 4, max: 10 })
    .isNumeric()
    .withMessage('code must be a 4-10 digit number'),

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
  param('session_id')
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
  param('session_id')
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

/**
 * MFA push approval request validation
 */
export const validateMFAPushApprovalRequest = [
  body('context_id')
    .isString()
    .notEmpty()
    .withMessage('context_id is required'),

  body('selected_number')
    .isInt()
    .notEmpty()
    .withMessage('selected_number is required and must be an integer'),

  handleValidationErrors
];

/**
 * eSign document ID parameter validation
 */
export const validateDocumentIdParam = [
  param('document_id')
    .isString()
    .notEmpty()
    .withMessage('Valid document_id is required'),

  handleValidationErrors
];

/**
 * eSign acceptance request validation
 */
export const validateESignAcceptRequest = [
  body('context_id')
    .isString()
    .notEmpty()
    .withMessage('context_id is required'),

  body('transaction_id')
    .isString()
    .notEmpty()
    .matches(/^tx-[a-zA-Z0-9-]+$/)
    .withMessage('Valid transaction_id is required'),

  body('document_id')
    .isString()
    .notEmpty()
    .withMessage('document_id is required'),

  body('acceptance_ip')
    .optional()
    .isString()
    .withMessage('acceptance_ip must be a string'),

  body('acceptance_timestamp')
    .optional()
    .isISO8601()
    .withMessage('acceptance_timestamp must be a valid ISO 8601 date'),

  handleValidationErrors
];

/**
 * Device bind request validation (v3)
 */
export const validateDeviceBindRequest = [
  body('context_id')
    .isString()
    .notEmpty()
    .withMessage('context_id is required'),

  body('transaction_id')
    .isString()
    .notEmpty()
    .matches(/^tx-[a-zA-Z0-9-]+$/)
    .withMessage('Valid transaction_id is required'),

  body('bind_device')
    .isBoolean()
    .withMessage('bind_device must be a boolean'),

  handleValidationErrors
];

/**
 * MFA push verification request validation (v3 - POST /mfa/transaction/:id)
 */
export const validatePushVerificationRequest = [
  param('transaction_id')
    .isString()
    .matches(/^mfa-[a-zA-Z0-9-]+$/)
    .withMessage('Valid transaction ID is required'),

  body('context_id')
    .isString()
    .notEmpty()
    .withMessage('context_id is required'),

  handleValidationErrors
];