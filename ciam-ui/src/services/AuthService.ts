import {
  LoginResponse,
  MFAChallengeResponse,
  MFAVerifyResponse,
  MFATransactionStatusResponse,
  TokenRefreshResponse,
  UserInfoResponse,
  SessionInfo,
  ApiError,
  ServiceConfig
} from '../types';

export class AuthService {
  private baseURL: string;
  private timeout: number;
  private retries: number;
  private debug: boolean;

  constructor(config: ServiceConfig) {
    this.baseURL = config.baseURL.replace(/\/$/, '');
    this.timeout = config.timeout || 10000;
    this.retries = config.retries || 3;
    this.debug = config.debug || false;
  }

  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log('[AuthService]', ...args);
    }
  }

  private async fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.retries; attempt++) {
      try {
        this.log(`Attempt ${attempt}: ${options.method} ${url}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          credentials: 'include', // Important for cookies
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.message || `HTTP ${response.status}: ${response.statusText}`);
        }

        this.log(`Success: ${response.status}`);
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        this.log(`Attempt ${attempt} failed:`, lastError.message);

        if (attempt === this.retries) {
          break;
        }

        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    throw lastError!;
  }

  private async apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;

    const defaultHeaders = {
      'Content-Type': 'application/json',
    };

    // Add authorization header if access token exists
    const accessToken = this.getStoredAccessToken();
    if (accessToken && !options.headers?.['Authorization']) {
      (defaultHeaders as any).Authorization = `Bearer ${accessToken}`;
    }

    const mergedOptions: RequestInit = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    };

    try {
      const response = await this.fetchWithRetry(url, mergedOptions);
      return await response.json();
    } catch (error) {
      this.log('API call failed:', error);
      throw this.handleApiError(error);
    }
  }

  private handleApiError(error: unknown): ApiError {
    if (error instanceof Error) {
      // Try to parse as API error
      try {
        const apiError = JSON.parse(error.message) as ApiError;
        if (apiError.code && apiError.message) {
          return apiError;
        }
      } catch {
        // Not a JSON API error
      }

      return {
        code: 'NETWORK_ERROR',
        message: error.message,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      code: 'UNKNOWN_ERROR',
      message: 'An unknown error occurred',
      timestamp: new Date().toISOString(),
    };
  }

  private getStoredAccessToken(): string | null {
    // Access tokens are stored in memory only for security
    return (globalThis as any).__CIAM_ACCESS_TOKEN__ || null;
  }

  private setStoredAccessToken(token: string | null): void {
    if (token) {
      (globalThis as any).__CIAM_ACCESS_TOKEN__ = token;
    } else {
      delete (globalThis as any).__CIAM_ACCESS_TOKEN__;
    }
  }

  /**
   * User login
   */
  async login(username: string, password: string, drsActionToken?: string): Promise<LoginResponse> {
    const response = await this.apiCall<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username,
        password,
        drs_action_token: drsActionToken,
      }),
    });

    // Store access token if login was successful
    if (response.access_token) {
      this.setStoredAccessToken(response.access_token);
    }

    return response;
  }

  /**
   * User logout
   */
  async logout(): Promise<void> {
    try {
      await this.apiCall('/auth/logout', {
        method: 'POST',
      });
    } finally {
      // Always clear stored token on logout
      this.setStoredAccessToken(null);
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(): Promise<TokenRefreshResponse> {
    const response = await this.apiCall<TokenRefreshResponse>('/auth/refresh', {
      method: 'POST',
    });

    // Update stored access token
    if (response.access_token) {
      this.setStoredAccessToken(response.access_token);
    }

    return response;
  }

  /**
   * Get user information
   */
  async getUserInfo(): Promise<UserInfoResponse> {
    return this.apiCall<UserInfoResponse>('/userinfo');
  }

  /**
   * Verify session
   */
  async verifySession(sessionId: string): Promise<{ isValid: boolean; message?: string; expiresAt?: string }> {
    return this.apiCall(`/session/verify?sessionId=${encodeURIComponent(sessionId)}`);
  }

  /**
   * Get user sessions
   */
  async getSessions(): Promise<{ sessions: SessionInfo[] }> {
    return this.apiCall('/sessions');
  }

  /**
   * Revoke session
   */
  async revokeSession(sessionId: string): Promise<{ message: string }> {
    return this.apiCall(`/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
  }

  /**
   * Initiate MFA challenge
   */
  async initiateMFAChallenge(
    method: 'otp' | 'push',
    username?: string,
    sessionId?: string,
    transactionId?: string
  ): Promise<MFAChallengeResponse> {
    return this.apiCall<MFAChallengeResponse>('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({
        username,
        method,
        sessionId,
        transactionId,
      }),
    });
  }

  /**
   * Verify MFA challenge
   */
  async verifyMFAChallenge(
    transactionId: string,
    otp?: string,
    pushResult?: 'APPROVED' | 'REJECTED'
  ): Promise<MFAVerifyResponse> {
    const response = await this.apiCall<MFAVerifyResponse>('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({
        transactionId,
        otp,
        pushResult,
      }),
    });

    // Store access token if MFA was successful
    if (response.access_token) {
      this.setStoredAccessToken(response.access_token);
    }

    return response;
  }

  /**
   * Get MFA transaction status
   */
  async getMFATransactionStatus(transactionId: string): Promise<MFATransactionStatusResponse> {
    return this.apiCall<MFATransactionStatusResponse>(`/mfa/transaction/${encodeURIComponent(transactionId)}`);
  }

  /**
   * Get OTP for testing (development only)
   */
  async getOTPForTesting(transactionId: string): Promise<{ otp: string; message?: string }> {
    return this.apiCall(`/mfa/transaction/${encodeURIComponent(transactionId)}/otp`);
  }

  /**
   * Clear stored tokens (for logout)
   */
  clearTokens(): void {
    this.setStoredAccessToken(null);
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.getStoredAccessToken();
  }

  /**
   * Get current access token
   */
  getAccessToken(): string | null {
    return this.getStoredAccessToken();
  }

  /**
   * Set access token manually (for external token management)
   */
  setAccessToken(token: string | null): void {
    this.setStoredAccessToken(token);
  }
}