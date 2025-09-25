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

// Authentication event logging
export const logAuthEvent = (
  event: 'login_attempt' | 'login_success' | 'login_failure' | 'logout' | 'token_refresh' | 'mfa_challenge' | 'mfa_success' | 'mfa_failure',
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