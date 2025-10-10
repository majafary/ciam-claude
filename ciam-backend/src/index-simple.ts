import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { authController } from './controllers/auth-simple';

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(helmet());
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://localhost:6006'
  ],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Auth routes
app.post('/auth/login', authController.login);
app.post('/auth/logout', authController.logout);
app.post('/auth/refresh', authController.refresh);
app.post('/auth/mfa/verify', authController.verifyMfa);
app.post('/auth/mfa/initiate', authController.initiateMfaChallenge);
app.post('/auth/mfa/transactions/:transaction_id', authController.verifyPushChallenge);

// eSign routes
app.get('/auth/esign/documents/:documentId', authController.getESignDocument);
app.post('/auth/esign/accept', authController.acceptESign);

// Device management routes
app.post('/auth/device/bind', authController.bindDevice);

// OIDC routes
app.get('/.well-known/jwks.json', authController.jwks);

// Default route
app.get('/', (req, res) => {
  res.json({
    message: 'CIAM Backend API',
    version: '3.0.0',
    endpoints: {
      health: '/health',
      auth: {
        login: 'POST /auth/login',
        logout: 'POST /auth/logout',
        refresh: 'POST /auth/refresh'
      },
      mfa: {
        initiate: 'POST /auth/mfa/initiate',
        verify: 'POST /auth/mfa/verify',
        push_verify_poll: 'POST /auth/mfa/transactions/:transaction_id'
      },
      esign: {
        get_document: 'GET /auth/esign/documents/:documentId',
        accept: 'POST /auth/esign/accept'
      },
      device: {
        bind: 'POST /auth/device/bind'
      },
      oidc: {
        jwks: 'GET /.well-known/jwks.json'
      }
    }
  });
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: 'INTERNAL_ERROR',
    message: 'An internal error occurred'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: 'Endpoint not found'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 CIAM Backend running on port ${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
  console.log(`🔑 JWKS endpoint: http://localhost:${PORT}/.well-known/jwks.json`);
});