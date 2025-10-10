import winston from 'winston';

const isDevelopment = process.env.NODE_ENV === 'development';

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  isDevelopment
    ? winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, stack }) => {
          return `${timestamp} [${level}]: ${stack || message}`;
        })
      )
    : winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'ciam-backend' },
  transports: [
    new winston.transports.Console({
      silent: process.env.NODE_ENV === 'test'
    })
  ]
});

// Add file transport for production
if (!isDevelopment) {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    })
  );

  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    })
  );
}

// Request logging middleware-compatible function
export const logRequest = (
  method: string,
  url: string,
  statusCode: number,
  duration: number,
  userAgent?: string,
  ip?: string
) => {
  const logData = {
    method,
    url,
    statusCode,
    duration: `${duration}ms`,
    userAgent,
    ip
  };

  if (statusCode >= 400) {
    logger.warn('HTTP Request Failed', logData);
  } else {
    logger.info('HTTP Request', logData);
  }
};

// Security event logging
export const logSecurityEvent = (
  event: string,
  details: Record<string, unknown>,
  severity: 'low' | 'medium' | 'high' = 'medium'
) => {
  logger.warn('Security Event', {
    event,
    severity,
    timestamp: new Date().toISOString(),
    ...details
  });
};

// Authentication event type
export type AuthEventType =
  | 'login_attempt' | 'login_success' | 'login_failure'
  | 'login_esign_required' | 'login_mfa_required'
  | 'logout' | 'logout_failure'
  | 'token_refresh' | 'token_refresh_success' | 'token_refresh_failure'
  | 'token_revoked'
  | 'mfa_challenge' | 'mfa_challenge_created' | 'mfa_challenge_failure'
  | 'mfa_success' | 'mfa_failure'
  | 'mfa_verify_otp' | 'mfa_verify_otp_failure'
  | 'mfa_verify_push' | 'mfa_verify_push_failure'
  | 'mfa_pending'
  | 'push_approve_attempt' | 'push_approved' | 'push_approve_failure'
  | 'esign_accept_attempt' | 'esign_accepted' | 'esign_accept_failure'
  | 'device_bind_attempt' | 'device_bound' | 'device_bind_failure' | 'device_already_trusted'
  | 'session_verify' | 'session_revoked' | 'session_revoke_failure'
  | 'session_mismatch'
  | 'sessions_listed' | 'sessions_list_failure'
  | 'userinfo_accessed' | 'userinfo_failure'
  | 'unauthorized_access' | 'authorization_failure'
  | 'refresh_token_missing';

// Authentication event logging
export const logAuthEvent = (
  event: AuthEventType,
  userId?: string,
  details?: Record<string, unknown>
) => {
  logger.info('Auth Event', {
    event,
    userId: userId || 'anonymous',
    timestamp: new Date().toISOString(),
    ...details
  });
};

// Rate limiting event logging
export const logRateLimitEvent = (
  ip: string,
  endpoint: string,
  limit: number,
  remaining: number
) => {
  logger.warn('Rate Limit', {
    ip,
    endpoint,
    limit,
    remaining,
    timestamp: new Date().toISOString()
  });
};

export default logger;