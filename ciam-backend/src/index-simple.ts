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
app.get('/mfa/transaction/:transactionId', authController.checkMfaStatus);
app.get('/userinfo', authController.userinfo);
app.get('/.well-known/jwks.json', authController.jwks);

// Default route
app.get('/', (req, res) => {
  res.json({
    message: 'CIAM Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      login: '/auth/login',
      logout: '/auth/logout',
      refresh: '/auth/refresh',
      introspect: '/auth/introspect',
      mfa_verify: '/auth/mfa/verify',
      jwks: '/.well-known/jwks.json'
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