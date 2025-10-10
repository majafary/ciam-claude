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
app.post('/auth/introspect', authController.introspect);
app.post('/auth/mfa/verify', authController.verifyMfa);
app.post('/auth/mfa/initiate', authController.initiateMfaChallenge);
app.post('/mfa/transactions/:transaction_id', authController.verifyPushChallenge);
app.post('/auth/post-mfa-check', authController.postMfaCheck);
app.post('/auth/post-login-check', authController.postLoginCheck);

// eSign routes
app.get('/esign/documents/:documentId', authController.getESignDocument);
app.post('/esign/accept', authController.acceptESign);
app.post('/esign/decline', authController.declineESign);

// User info routes
app.get('/userinfo', authController.userinfo);

// Device management routes
app.post('/device/bind', authController.bindDevice);

// OIDC routes
app.get('/.well-known/jwks.json', authController.jwks);

// Default route
app.get('/', (req, res) => {
  res.json({
    message: 'CIAM Backend API',
    version: '2.0.0',
    endpoints: {
      health: '/health',
      auth: {
        login: 'POST /auth/login',
        logout: 'POST /auth/logout',
        refresh: 'POST /auth/refresh',
        introspect: 'POST /auth/introspect',
        post_mfa_check: 'POST /auth/post-mfa-check',
        post_login_check: 'POST /auth/post-login-check'
      },
      mfa: {
        initiate: 'POST /auth/mfa/initiate',
        verify: 'POST /auth/mfa/verify',
        push_verify_poll: 'POST /mfa/transactions/:transaction_id'
      },
      esign: {
        get_document: 'GET /esign/documents/:documentId',
        accept: 'POST /esign/accept',
        decline: 'POST /esign/decline'
      },
      user: {
        info: 'GET /userinfo'
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