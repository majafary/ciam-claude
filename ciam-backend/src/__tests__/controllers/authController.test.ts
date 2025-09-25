import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { authController } from '../../controllers/authController';
import * as userService from '../../services/userService';
import * as jwtUtils from '../../utils/jwt';

// Mock dependencies
jest.mock('../../services/userService');
jest.mock('../../utils/jwt');

const mockedUserService = userService as jest.Mocked<typeof userService>;
const mockedJwtUtils = jwtUtils as jest.Mocked<typeof jwtUtils>;

describe('AuthController', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Mount auth routes
    app.post('/auth/login', authController.login);
    app.post('/auth/logout', authController.logout);
    app.post('/auth/refresh', authController.refresh);
    app.post('/auth/introspect', authController.introspect);
    app.post('/auth/mfa/verify', authController.verifyMfa);
    app.get('/.well-known/jwks.json', authController.jwks);

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('POST /auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const mockUser = {
        id: 'testuser',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['user']
      };

      mockedUserService.validateUser.mockResolvedValue({
        success: true,
        user: mockUser
      });

      mockedJwtUtils.generateAccessToken.mockReturnValue('mock-access-token');
      mockedJwtUtils.generateRefreshToken.mockReturnValue('mock-refresh-token');

      const response = await request(app)
        .post('/auth/login')
        .send({
          username: 'testuser',
          password: 'password'
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        access_token: 'mock-access-token',
        token_type: 'Bearer',
        expires_in: 900,
        user: mockUser
      });

      expect(response.headers['set-cookie']).toBeDefined();
      expect(mockedUserService.validateUser).toHaveBeenCalledWith('testuser', 'password');
    });

    it('should return 401 for invalid credentials', async () => {
      mockedUserService.validateUser.mockResolvedValue({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password'
      });

      const response = await request(app)
        .post('/auth/login')
        .send({
          username: 'testuser',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password'
      });
    });

    it('should return 423 for locked account', async () => {
      mockedUserService.validateUser.mockResolvedValue({
        success: false,
        error: 'ACCOUNT_LOCKED',
        message: 'Account is temporarily locked'
      });

      const response = await request(app)
        .post('/auth/login')
        .send({
          username: 'lockeduser',
          password: 'password'
        });

      expect(response.status).toBe(423);
      expect(response.body).toEqual({
        success: false,
        error: 'ACCOUNT_LOCKED',
        message: 'Account is temporarily locked'
      });
    });

    it('should return 428 for MFA required', async () => {
      mockedUserService.validateUser.mockResolvedValue({
        success: false,
        error: 'MFA_REQUIRED',
        message: 'Multi-factor authentication required',
        mfaRequired: true,
        availableMethods: ['otp', 'push']
      });

      const response = await request(app)
        .post('/auth/login')
        .send({
          username: 'mfalockeduser',
          password: 'password'
        });

      expect(response.status).toBe(428);
      expect(response.body).toEqual({
        success: false,
        error: 'MFA_REQUIRED',
        message: 'Multi-factor authentication required',
        mfa_required: true,
        available_methods: ['otp', 'push']
      });
    });

    it('should return 400 for missing credentials', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'MISSING_CREDENTIALS',
        message: 'Username and password are required'
      });
    });

    it('should handle rate limiting', async () => {
      mockedUserService.validateUser.mockResolvedValue({
        success: false,
        error: 'RATE_LIMITED',
        message: 'Too many login attempts'
      });

      const response = await request(app)
        .post('/auth/login')
        .send({
          username: 'testuser',
          password: 'password'
        });

      expect(response.status).toBe(429);
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout successfully', async () => {
      const response = await request(app)
        .post('/auth/logout')
        .send();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Logout successful'
      });

      // Should clear refresh token cookie
      const setCookieHeader = response.headers['set-cookie'];
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader[0]).toContain('refresh_token=;');
      expect(setCookieHeader[0]).toContain('Max-Age=0');
    });
  });

  describe('POST /auth/refresh', () => {
    it('should refresh tokens successfully', async () => {
      const mockPayload = {
        sub: 'testuser',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['user'],
        type: 'refresh'
      };

      mockedJwtUtils.verifyToken.mockReturnValue({
        valid: true,
        payload: mockPayload,
        error: undefined
      });

      mockedJwtUtils.generateAccessToken.mockReturnValue('new-access-token');
      mockedJwtUtils.generateRefreshToken.mockReturnValue('new-refresh-token');

      const response = await request(app)
        .post('/auth/refresh')
        .set('Cookie', 'refresh_token=valid-refresh-token')
        .send();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        access_token: 'new-access-token',
        token_type: 'Bearer',
        expires_in: 900
      });
    });

    it('should return 401 for missing refresh token', async () => {
      const response = await request(app)
        .post('/auth/refresh')
        .send();

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: 'MISSING_REFRESH_TOKEN',
        message: 'Refresh token is required'
      });
    });

    it('should return 401 for invalid refresh token', async () => {
      mockedJwtUtils.verifyToken.mockReturnValue({
        valid: false,
        payload: null,
        error: 'Invalid token'
      });

      const response = await request(app)
        .post('/auth/refresh')
        .set('Cookie', 'refresh_token=invalid-token')
        .send();

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid or expired refresh token'
      });
    });
  });

  describe('POST /auth/introspect', () => {
    it('should introspect active token successfully', async () => {
      const mockPayload = {
        sub: 'testuser',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['user'],
        exp: Math.floor(Date.now() / 1000) + 900,
        iat: Math.floor(Date.now() / 1000)
      };

      mockedJwtUtils.verifyToken.mockReturnValue({
        valid: true,
        payload: mockPayload,
        error: undefined
      });

      const response = await request(app)
        .post('/auth/introspect')
        .send({
          token: 'valid-access-token'
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        active: true,
        sub: 'testuser',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['user'],
        exp: mockPayload.exp,
        iat: mockPayload.iat
      });
    });

    it('should return inactive for invalid token', async () => {
      mockedJwtUtils.verifyToken.mockReturnValue({
        valid: false,
        payload: null,
        error: 'Invalid token'
      });

      const response = await request(app)
        .post('/auth/introspect')
        .send({
          token: 'invalid-token'
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        active: false
      });
    });

    it('should return 400 for missing token', async () => {
      const response = await request(app)
        .post('/auth/introspect')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'MISSING_TOKEN',
        message: 'Token is required'
      });
    });
  });

  describe('POST /auth/mfa/verify', () => {
    it('should verify OTP successfully', async () => {
      const response = await request(app)
        .post('/auth/mfa/verify')
        .send({
          method: 'otp',
          code: '1234'
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'MFA verification successful'
      });
    });

    it('should reject invalid OTP', async () => {
      const response = await request(app)
        .post('/auth/mfa/verify')
        .send({
          method: 'otp',
          code: '0000'
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'INVALID_MFA_CODE',
        message: 'Invalid or expired MFA code'
      });
    });

    it('should handle push notification verification', async () => {
      const response = await request(app)
        .post('/auth/mfa/verify')
        .send({
          method: 'push'
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Push notification sent. Please check your device.',
        pending_verification: true
      });
    });

    it('should return 400 for missing method', async () => {
      const response = await request(app)
        .post('/auth/mfa/verify')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'MISSING_MFA_METHOD',
        message: 'MFA method is required'
      });
    });

    it('should return 400 for unsupported method', async () => {
      const response = await request(app)
        .post('/auth/mfa/verify')
        .send({
          method: 'unsupported'
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'UNSUPPORTED_MFA_METHOD',
        message: 'MFA method not supported'
      });
    });
  });

  describe('GET /.well-known/jwks.json', () => {
    it('should return JWKS', async () => {
      const mockJwks = {
        keys: [{
          kty: 'RSA',
          use: 'sig',
          kid: 'test-key-id',
          n: 'test-modulus',
          e: 'AQAB'
        }]
      };

      mockedJwtUtils.generateJWKS.mockReturnValue(mockJwks);

      const response = await request(app)
        .get('/.well-known/jwks.json');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockJwks);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.headers['cache-control']).toBe('public, max-age=3600');
    });
  });
});