import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act, waitFor } from '@testing-library/react';
import { CiamProvider, useAuth } from '../../hooks/useAuth';
import { AuthService } from '../../services/AuthService';
import type { CiamConfig } from '../../types';

// Mock AuthService
jest.mock('../../services/AuthService');
const MockedAuthService = AuthService as jest.MockedClass<typeof AuthService>;

describe('useAuth Hook', () => {
  let mockAuthService: jest.Mocked<AuthService>;
  let config: CiamConfig;

  beforeEach(() => {
    config = {
      baseUrl: 'http://localhost:8080',
      clientId: 'test-client',
      enableDebug: false,
      tokenRefreshThreshold: 300000,
      maxRetries: 3
    };

    mockAuthService = {
      login: jest.fn(),
      logout: jest.fn(),
      refreshToken: jest.fn(),
      introspect: jest.fn(),
      verifyMfa: jest.fn(),
      getJwks: jest.fn(),
    } as any;

    MockedAuthService.mockImplementation(() => mockAuthService);

    // Mock localStorage
    Storage.prototype.getItem = jest.fn();
    Storage.prototype.setItem = jest.fn();
    Storage.prototype.removeItem = jest.fn();

    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <CiamProvider config={config}>{children}</CiamProvider>
  );

  describe('initialization', () => {
    it('should initialize with loading state', () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('should initialize with existing token', async () => {
      const mockToken = 'existing-access-token';
      const mockUser = {
        id: 'testuser',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['user']
      };

      (localStorage.getItem as jest.Mock).mockReturnValue(mockToken);
      mockAuthService.introspect.mockResolvedValue({
        active: true,
        sub: mockUser.id,
        username: mockUser.username,
        email: mockUser.email,
        roles: mockUser.roles,
        exp: Date.now() / 1000 + 900,
        iat: Date.now() / 1000
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toEqual(mockUser);
      expect(mockAuthService.introspect).toHaveBeenCalledWith(mockToken);
    });

    it('should handle invalid existing token', async () => {
      const mockToken = 'invalid-access-token';

      (localStorage.getItem as jest.Mock).mockReturnValue(mockToken);
      mockAuthService.introspect.mockResolvedValue({
        active: false
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
      expect(localStorage.removeItem).toHaveBeenCalledWith('ciam_access_token');
    });
  });

  describe('login', () => {
    it('should login successfully', async () => {
      const mockUser = {
        id: 'testuser',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['user']
      };

      const loginResponse = {
        success: true,
        access_token: 'new-access-token',
        token_type: 'Bearer',
        expires_in: 900,
        user: mockUser
      };

      mockAuthService.login.mockResolvedValue(loginResponse);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        const response = await result.current.login('testuser', 'password');
        expect(response).toEqual(loginResponse);
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.error).toBeNull();
      expect(localStorage.setItem).toHaveBeenCalledWith('ciam_access_token', 'new-access-token');
    });

    it('should handle login failure', async () => {
      const loginResponse = {
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password'
      };

      mockAuthService.login.mockResolvedValue(loginResponse);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        const response = await result.current.login('testuser', 'wrongpassword');
        expect(response).toEqual(loginResponse);
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
      expect(result.current.error).toBe('Invalid username or password');
    });

    it('should handle MFA required', async () => {
      const loginResponse = {
        success: false,
        error: 'MFA_REQUIRED',
        message: 'Multi-factor authentication required',
        mfa_required: true,
        available_methods: ['otp', 'push']
      };

      mockAuthService.login.mockResolvedValue(loginResponse);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        const response = await result.current.login('mfalockeduser', 'password');
        expect(response).toEqual(loginResponse);
      });

      expect(result.current.mfaRequired).toBe(true);
      expect(result.current.mfaMethods).toEqual(['otp', 'push']);
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      const mockUser = {
        id: 'testuser',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['user']
      };

      // First login
      const loginResponse = {
        success: true,
        access_token: 'access-token',
        token_type: 'Bearer',
        expires_in: 900,
        user: mockUser
      };

      mockAuthService.login.mockResolvedValue(loginResponse);
      mockAuthService.logout.mockResolvedValue({
        success: true,
        message: 'Logout successful'
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Login first
      await act(async () => {
        await result.current.login('testuser', 'password');
      });

      expect(result.current.isAuthenticated).toBe(true);

      // Then logout
      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
      expect(localStorage.removeItem).toHaveBeenCalledWith('ciam_access_token');
    });
  });

  describe('token refresh', () => {
    it('should refresh token automatically before expiration', async () => {
      const mockUser = {
        id: 'testuser',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['user']
      };

      // Login with short-lived token
      const loginResponse = {
        success: true,
        access_token: 'initial-token',
        token_type: 'Bearer',
        expires_in: 1, // 1 second
        user: mockUser
      };

      const refreshResponse = {
        success: true,
        access_token: 'refreshed-token',
        token_type: 'Bearer',
        expires_in: 900
      };

      mockAuthService.login.mockResolvedValue(loginResponse);
      mockAuthService.refreshToken.mockResolvedValue(refreshResponse);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.login('testuser', 'password');
      });

      // Fast-forward time to trigger refresh
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        expect(mockAuthService.refreshToken).toHaveBeenCalled();
      });

      expect(localStorage.setItem).toHaveBeenCalledWith('ciam_access_token', 'refreshed-token');
    });

    it('should handle refresh failure by logging out', async () => {
      const mockUser = {
        id: 'testuser',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['user']
      };

      const loginResponse = {
        success: true,
        access_token: 'initial-token',
        token_type: 'Bearer',
        expires_in: 1,
        user: mockUser
      };

      mockAuthService.login.mockResolvedValue(loginResponse);
      mockAuthService.refreshToken.mockResolvedValue({
        success: false,
        error: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid or expired refresh token'
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.login('testuser', 'password');
      });

      expect(result.current.isAuthenticated).toBe(true);

      // Fast-forward time to trigger failed refresh
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(false);
      });

      expect(result.current.user).toBeNull();
      expect(localStorage.removeItem).toHaveBeenCalledWith('ciam_access_token');
    });
  });

  describe('MFA verification', () => {
    it('should verify MFA successfully', async () => {
      mockAuthService.verifyMfa.mockResolvedValue({
        success: true,
        message: 'MFA verification successful'
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Set MFA required state
      act(() => {
        (result.current as any).setMfaRequired(true);
        (result.current as any).setMfaMethods(['otp']);
      });

      await act(async () => {
        const response = await result.current.verifyMfa('otp', '1234');
        expect(response.success).toBe(true);
      });

      expect(result.current.mfaRequired).toBe(false);
      expect(result.current.mfaMethods).toEqual([]);
    });

    it('should handle MFA verification failure', async () => {
      mockAuthService.verifyMfa.mockResolvedValue({
        success: false,
        error: 'INVALID_MFA_CODE',
        message: 'Invalid or expired MFA code'
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        const response = await result.current.verifyMfa('otp', '0000');
        expect(response.success).toBe(false);
      });

      expect(result.current.error).toBe('Invalid or expired MFA code');
    });
  });

  describe('error handling', () => {
    it('should clear errors on successful operations', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      // Set an error first
      act(() => {
        (result.current as any).setError('Previous error');
      });

      expect(result.current.error).toBe('Previous error');

      // Successful login should clear error
      mockAuthService.login.mockResolvedValue({
        success: true,
        access_token: 'token',
        token_type: 'Bearer',
        expires_in: 900,
        user: { id: 'test', username: 'test', email: 'test@test.com', roles: [] }
      });

      await act(async () => {
        await result.current.login('testuser', 'password');
      });

      expect(result.current.error).toBeNull();
    });

    it('should provide clearError function', () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      act(() => {
        (result.current as any).setError('Test error');
      });

      expect(result.current.error).toBe('Test error');

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });
});