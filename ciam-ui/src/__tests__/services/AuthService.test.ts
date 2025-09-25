import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { AuthService } from '../../services/AuthService';
import type { CiamConfig } from '../../types';

// Mock fetch
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('AuthService', () => {
  let authService: AuthService;
  let config: CiamConfig;

  beforeEach(() => {
    config = {
      baseUrl: 'http://localhost:8080',
      clientId: 'test-client',
      enableDebug: false,
      tokenRefreshThreshold: 300000,
      maxRetries: 3
    };

    authService = new AuthService(config);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      expect(authService).toBeDefined();
      expect(authService['config']).toEqual(config);
    });
  });

  describe('login', () => {
    it('should login successfully with valid credentials', async () => {
      const mockResponse = {
        success: true,
        access_token: 'mock-access-token',
        token_type: 'Bearer',
        expires_in: 900,
        user: {
          id: 'testuser',
          username: 'testuser',
          email: 'test@example.com',
          roles: ['user']
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers({
          'set-cookie': 'refresh_token=mock-refresh-token; HttpOnly; Secure'
        })
      } as Response);

      const result = await authService.login('testuser', 'password');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/auth/login',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            username: 'testuser',
            password: 'password'
          })
        })
      );
    });

    it('should handle authentication failure', async () => {
      const mockResponse = {
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password'
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => mockResponse
      } as Response);

      const result = await authService.login('testuser', 'wrongpassword');

      expect(result).toEqual(mockResponse);
    });

    it('should handle MFA required', async () => {
      const mockResponse = {
        success: false,
        error: 'MFA_REQUIRED',
        message: 'Multi-factor authentication required',
        mfa_required: true,
        available_methods: ['otp', 'push']
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 428,
        json: async () => mockResponse
      } as Response);

      const result = await authService.login('mfalockeduser', 'password');

      expect(result).toEqual(mockResponse);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await authService.login('testuser', 'password');

      expect(result).toEqual({
        success: false,
        error: 'NETWORK_ERROR',
        message: 'Unable to connect to authentication service'
      });
    });

    it('should retry on failure', async () => {
      // First two calls fail, third succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            access_token: 'mock-token',
            token_type: 'Bearer',
            expires_in: 900,
            user: { id: 'testuser', username: 'testuser' }
          }),
          headers: new Headers()
        } as Response);

      const result = await authService.login('testuser', 'password');

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      const mockResponse = {
        success: true,
        message: 'Logout successful'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse
      } as Response);

      const result = await authService.logout();

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/auth/logout',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include'
        })
      );
    });

    it('should handle logout errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await authService.logout();

      expect(result).toEqual({
        success: false,
        error: 'NETWORK_ERROR',
        message: 'Unable to connect to authentication service'
      });
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      const mockResponse = {
        success: true,
        access_token: 'new-access-token',
        token_type: 'Bearer',
        expires_in: 900
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse
      } as Response);

      const result = await authService.refreshToken();

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/auth/refresh',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include'
        })
      );
    });

    it('should handle refresh failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: 'INVALID_REFRESH_TOKEN',
          message: 'Invalid or expired refresh token'
        })
      } as Response);

      const result = await authService.refreshToken();

      expect(result.success).toBe(false);
    });
  });

  describe('introspect', () => {
    it('should introspect token successfully', async () => {
      const mockResponse = {
        active: true,
        sub: 'testuser',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['user'],
        exp: Date.now() / 1000 + 900,
        iat: Date.now() / 1000
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse
      } as Response);

      const result = await authService.introspect('mock-token');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/auth/introspect',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token: 'mock-token'
          })
        })
      );
    });

    it('should handle inactive token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          active: false
        })
      } as Response);

      const result = await authService.introspect('invalid-token');

      expect(result).toEqual({
        active: false
      });
    });
  });

  describe('verifyMfa', () => {
    it('should verify OTP successfully', async () => {
      const mockResponse = {
        success: true,
        message: 'MFA verification successful'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse
      } as Response);

      const result = await authService.verifyMfa('otp', '1234');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/auth/mfa/verify',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            method: 'otp',
            code: '1234'
          })
        })
      );
    });

    it('should handle invalid MFA code', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          error: 'INVALID_MFA_CODE',
          message: 'Invalid or expired MFA code'
        })
      } as Response);

      const result = await authService.verifyMfa('otp', '0000');

      expect(result.success).toBe(false);
    });

    it('should handle push notification method', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          message: 'Push notification sent. Please check your device.',
          pending_verification: true
        })
      } as Response);

      const result = await authService.verifyMfa('push');

      expect(result.success).toBe(true);
      expect(result.pending_verification).toBe(true);
    });
  });

  describe('getJwks', () => {
    it('should fetch JWKS successfully', async () => {
      const mockJwks = {
        keys: [{
          kty: 'RSA',
          use: 'sig',
          kid: 'test-key-id',
          n: 'test-modulus',
          e: 'AQAB'
        }]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockJwks
      } as Response);

      const result = await authService.getJwks();

      expect(result).toEqual(mockJwks);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/.well-known/jwks.json'
      );
    });

    it('should handle JWKS fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(authService.getJwks()).rejects.toThrow('Network error');
    });
  });
});