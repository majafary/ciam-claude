import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import middleware
import { requestLogger, securityHeaders, requestId, handlePreflight } from './middleware/logging';
import { authenticateToken, requireRefreshToken } from './middleware/auth';
import { generalRateLimit, authRateLimit, mfaRateLimit, tokenRefreshRateLimit, sessionRateLimit, mfaVerificationRateLimit } from './middleware/rateLimiter';
import { errorHandler } from './utils/errors';

// Import validation
import {
  validateLoginRequest,
  validateMFAChallengeRequest,
  validateMFAVerifyRequest,
  validateTokenRefreshRequest,
  validateSessionVerifyRequest,
  validateTransactionIdParam,
  validateSessionIdParam,
  validateTokenRevocationRequest,
  validateTokenIntrospectionRequest
} from './utils/validation';

// Import controllers
import { login, logout, refreshToken, revokeToken, introspectToken } from './controllers/authController';
import { initiateChallenge, verifyChallenge, getTransactionStatus, getOTPForTestEndpoint } from './controllers/mfaController';
import { verifySessionEndpoint, listUserSessions, revokeSessionEndpoint } from './controllers/sessionController';
import { getUserInfo } from './controllers/userController';
import { getOIDCConfiguration, getJWKS, healthCheck } from './controllers/oidcController';

// Import logger
import logger from './utils/logger';

const app = express();
const PORT = process.env.PORT || 8080;

// Trust proxy for proper IP detection
app.set('trust proxy', true);

// Basic middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false, // Required for Swagger UI
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(requestId);
app.use(securityHeaders);
app.use(requestLogger);

// CORS configuration
const corsOptions = {
  origin: (origin: string | undefined, callback: Function) => {
    const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002'
    ];

    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-ID']
};

app.use(cors(corsOptions));
app.use(handlePreflight);

// Apply rate limiting
app.use(generalRateLimit);

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Customer Authentication API',
      version: '1.0.0',
      description: 'API for user authentication and multi-factor authentication (MFA) using OIDC and OpenAPI standards.',
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Development server',
      },
    ],
  },
  apis: ['./src/index.ts'], // Path to the API files
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health check endpoint (no rate limiting)
app.get('/health', healthCheck);

// OIDC Discovery endpoints (minimal rate limiting)
app.get('/.well-known/openid-configuration', getOIDCConfiguration);
app.get('/jwks.json', getJWKS);

// Authentication endpoints
app.post('/login', authRateLimit, validateLoginRequest, login);
app.post('/logout', authenticateToken, logout);
app.post('/token/refresh', tokenRefreshRateLimit, requireRefreshToken, validateTokenRefreshRequest, refreshToken);
app.post('/revoke', validateTokenRevocationRequest, revokeToken);
app.post('/introspect', validateTokenIntrospectionRequest, introspectToken);

// MFA endpoints
app.post('/mfa/challenge', mfaRateLimit, validateMFAChallengeRequest, initiateChallenge);
app.post('/mfa/verify', mfaVerificationRateLimit, validateMFAVerifyRequest, verifyChallenge);
app.get('/mfa/transaction/:transactionId', validateTransactionIdParam, getTransactionStatus);

// Test-only endpoint for OTP retrieval
if (process.env.NODE_ENV !== 'production') {
  app.get('/mfa/transaction/:transactionId/otp', validateTransactionIdParam, getOTPForTestEndpoint);
}

// Session management endpoints
app.get('/session/verify', validateSessionVerifyRequest, verifySessionEndpoint);
app.get('/sessions', sessionRateLimit, authenticateToken, listUserSessions);
app.delete('/sessions/:sessionId', sessionRateLimit, authenticateToken, validateSessionIdParam, revokeSessionEndpoint);

// User information endpoints
app.get('/userinfo', authenticateToken, getUserInfo);

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    code: 'NOT_FOUND',
    message: 'Endpoint not found',
    timestamp: new Date().toISOString()
  });
});

// Start server
const server = app.listen(PORT, () => {
  logger.info(`CIAM Backend server running on port ${PORT}`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002']
  });

  logger.info('Available endpoints:', {
    endpoints: [
      'POST /login',
      'POST /logout',
      'POST /token/refresh',
      'POST /revoke',
      'POST /introspect',
      'POST /mfa/challenge',
      'POST /mfa/verify',
      'GET /mfa/transaction/:transactionId',
      'GET /session/verify',
      'GET /sessions',
      'DELETE /sessions/:sessionId',
      'GET /userinfo',
      'GET /.well-known/openid-configuration',
      'GET /jwks.json',
      'GET /health',
      'GET /api-docs'
    ]
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

export default app;