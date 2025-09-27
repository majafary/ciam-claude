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

  private getDefaultErrorMessage(responseTypeCode: string): string {
    const messages: Record<string, string> = {
      'MFA_REQUIRED': 'Multi-factor authentication required',
      'MFA_LOCKED': 'Your MFA has been locked due to too many failed attempts. Please call our call center at 1-800-SUPPORT to reset your MFA setup.',
      'ACCOUNT_LOCKED': 'Account is temporarily locked',
      'INVALID_CREDENTIALS': 'Invalid username or password',
      'MISSING_CREDENTIALS': 'Username and password are required'
    };
    return messages[responseTypeCode] || 'An error occurred during authentication';
  }

  private async fetchWithRetry(url: string, options: RequestInit): Promise<any> {
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

        const responseData = await response.json().catch(() => null);

        if (!response.ok) {
          // Special handling for all non-success responseTypeCodes
          // These should be returned normally instead of throwing errors
          const responseTypeCode = responseData?.responseTypeCode;
          if (responseTypeCode && [
            'MFA_REQUIRED', 'MFA_LOCKED', 'ACCOUNT_LOCKED',
            'INVALID_CREDENTIALS', 'MISSING_CREDENTIALS'
          ].includes(responseTypeCode)) {
            return responseData;
          }

          const apiError: ApiError = {
            code: responseData?.error || 'HTTP_ERROR',
            message: responseData?.message || `HTTP ${response.status}: ${response.statusText}`,
            timestamp: new Date().toISOString(),
          };
          throw new Error(JSON.stringify(apiError));
        }

        this.log(`Success: ${response.status}`);
        return responseData;
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
      const responseData = await this.fetchWithRetry(url, mergedOptions);
      return responseData;
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
    try {
      const response = await this.apiCall<any>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username,
          password,
          drs_action_token: drsActionToken,
        }),
      });

      // Handle all error response types
      if (response.responseTypeCode && response.responseTypeCode !== 'SUCCESS') {
        return {
          responseTypeCode: response.responseTypeCode,
          message: response.message || this.getDefaultErrorMessage(response.responseTypeCode),
          sessionId: response.sessionId || '',
          available_methods: response.available_methods,
          mfa_required: response.mfa_required,
        };
      }

      // Store access token if login was successful
      if (response.access_token) {
        this.setStoredAccessToken(response.access_token);
      }

      // For successful login, convert to expected LoginResponse format
      return {
        responseTypeCode: 'SUCCESS',
        message: response.message,
        id_token: response.id_token,
        access_token: response.access_token,
        refresh_token: response.refresh_token,
        sessionId: response.sessionId || '',
        transactionId: response.transactionId,
        deviceId: response.deviceId,
      };
    } catch (error) {
      // Handle regular error cases
      if (error instanceof Error) {
        try {
          const errorData = JSON.parse(error.message) as ApiError;

          // Check if this is actually an MFA required response that came through error path
          if (errorData.code === 'MFA_REQUIRED') {
            // Return as successful MFA response instead of throwing error
            return {
              responseTypeCode: 'MFA_REQUIRED',
              message: errorData.message || 'Multi-factor authentication required',
              sessionId: '', // Backend doesn't provide sessionId for MFA case
              available_methods: ['otp', 'push'], // Provide default methods
              mfa_required: true,
            };
          }

          // Check if this is actually an MFA_LOCKED response that came through error path
          if (errorData.code === 'MFA_LOCKED') {
            return {
              responseTypeCode: 'MFA_LOCKED',
              message: errorData.message || 'Your MFA has been locked due to too many failed attempts. Please call our call center at 1-800-SUPPORT to reset your MFA setup.',
              sessionId: '',
            };
          }
        } catch {
          // Not a JSON error, fall through to normal error handling
        }
      }

      // Re-throw for all other errors
      throw error;
    }
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
    console.log('🔍 AuthService.initiateMFAChallenge called with:', { method, username, sessionId, transactionId });

    const requestBody = {
      username,
      method,
      sessionId,
      transactionId,
    };
    console.log('🔍 AuthService MFA initiate request body:', JSON.stringify(requestBody, null, 2));

    return this.apiCall<MFAChallengeResponse>('/auth/mfa/initiate', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });
  }

  /**
   * Verify MFA challenge
   */
  async verifyMFAChallenge(
    transactionId: string,
    otp?: string,
    pushResult?: 'APPROVED' | 'REJECTED',
    selectedNumber?: number
  ): Promise<MFAVerifyResponse> {
    // Determine method from transaction ID
    const method = transactionId.includes('otp') ? 'otp' : 'push';

    const response = await this.apiCall<MFAVerifyResponse>('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({
        transactionId,
        method,
        code: otp,
        pushResult,
        selectedNumber,
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