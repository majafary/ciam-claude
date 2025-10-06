import {
  LoginResponse,
  MFAChallengeResponse,
  MFAVerifyResponse,
  MFATransactionStatusResponse,
  TokenRefreshResponse,
  UserInfoResponse,
  ApiError,
  ServiceConfig,
  ESignDocument,
  ESignResponse,
  PostMFACheckResponse,
  PostLoginCheckResponse
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
      'MISSING_CREDENTIALS': 'Username and password are required',
      'ESIGN_REQUIRED': 'Electronic signature required for terms and conditions',
      'ESIGN_DECLINED': 'Terms and conditions were declined'
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
            'INVALID_CREDENTIALS', 'MISSING_CREDENTIALS',
            'ESIGN_REQUIRED', 'ESIGN_DECLINED'
          ].includes(responseTypeCode)) {
            return responseData;
          }

          const apiError: ApiError = {
            code: responseData?.error_code || responseData?.error || 'HTTP_ERROR',
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
        const apiError = JSON.parse(error.message) as any;
        if (apiError.error_code && apiError.message) {
          return {
            code: apiError.error_code,
            message: apiError.message,
            timestamp: apiError.timestamp,
          };
        }
        // Handle old format for backward compatibility
        if (apiError.code && apiError.message) {
          return {
            code: apiError.code,
            message: apiError.message,
            timestamp: apiError.timestamp,
          };
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
   * Generate mock actionToken for device fingerprinting (simulates Transmit Security DRS UI SDK)
   */
  private generateActionToken(): string {
    // In production, this would come from Transmit Security DRS UI SDK
    // For demo: generate deterministic token based on browser characteristics
    const browserInfo = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      timestamp: Date.now().toString(36),
      random: Math.random().toString(36).substr(2, 8)
    };

    const combined = Object.values(browserInfo).join('|');
    return `action_${btoa(combined).replace(/[^a-zA-Z0-9]/g, '').substr(0, 32)}`;
  }

  /**
   * User login (v2 API)
   */
  async login(username: string, password: string, drsActionToken?: string, appId: string = 'ciam-ui-sdk', appVersion: string = '2.0.0'): Promise<LoginResponse> {
    try {
      // Generate actionToken for device fingerprinting if not provided
      const actionToken = drsActionToken || this.generateActionToken();

      const response = await this.apiCall<any>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username,
          password,
          drs_action_token: actionToken,
          app_id: appId,
          app_version: appVersion,
        }),
      });

      // Handle all error response types
      if (response.responseTypeCode && response.responseTypeCode !== 'SUCCESS') {
        return {
          responseTypeCode: response.responseTypeCode,
          message: response.message || this.getDefaultErrorMessage(response.responseTypeCode),
          session_id: response.session_id || '',
          transaction_id: response.transaction_id || '',
          otp_methods: response.otp_methods,
          mobile_approve_status: response.mobile_approve_status,
          esign_document_id: response.esign_document_id,
          esign_url: response.esign_url,
          is_mandatory: response.is_mandatory,
        };
      }

      // Store access token if login was successful
      if (response.access_token) {
        this.setStoredAccessToken(response.access_token);
      }

      // For successful login (201), convert to expected LoginResponse format
      return {
        responseTypeCode: 'SUCCESS',
        message: response.message,
        id_token: response.id_token,
        access_token: response.access_token,
        refresh_token: response.refresh_token,
        session_id: response.session_id || '',
        transaction_id: response.transaction_id,
        device_bound: response.device_bound,
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
              session_id: '', // Backend doesn't provide session_id for MFA case
              otp_methods: [], // Provide default empty array
              mobile_approve_status: 'NOT_REGISTERED',
            };
          }

          // Check if this is actually an MFA_LOCKED response that came through error path
          if (errorData.code === 'MFA_LOCKED') {
            return {
              responseTypeCode: 'MFA_LOCKED',
              message: errorData.message || 'Your MFA has been locked due to too many failed attempts. Please call our call center at 1-800-SUPPORT to reset your MFA setup.',
              session_id: '',
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
   * Parse JWT token to get user information (v2 - replaces /userinfo endpoint)
   */
  parseIdToken(idToken: string): UserInfoResponse {
    try {
      const base64Url = idToken.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (error) {
      throw new Error('Failed to parse ID token');
    }
  }

  /**
   * Get user information from ID token (v2 API)
   */
  async getUserInfo(): Promise<UserInfoResponse> {
    const accessToken = this.getStoredAccessToken();
    if (!accessToken) {
      throw new Error('No access token available');
    }
    return this.parseIdToken(accessToken);
  }

  /**
   * Store device fingerprint for session
   */
  private setDeviceFingerprint(fingerprint: string | null): void {
    if (fingerprint) {
      (globalThis as any).__CIAM_DEVICE_FINGERPRINT__ = fingerprint;
    } else {
      delete (globalThis as any).__CIAM_DEVICE_FINGERPRINT__;
    }
  }

  /**
   * Get stored device fingerprint
   */
  getDeviceFingerprint(): string | null {
    return (globalThis as any).__CIAM_DEVICE_FINGERPRINT__ || null;
  }

  /**
   * Initiate MFA challenge (v2 API)
   */
  async initiateMFAChallenge(
    transactionId: string,
    method: 'otp' | 'push',
    mfaOptionId?: number
  ): Promise<MFAChallengeResponse> {
    console.log('🔍 AuthService.initiateMFAChallenge called with:', { transactionId, method, mfaOptionId });

    const requestBody: any = {
      transaction_id: transactionId,
      method,
    };

    // Add mfa_option_id for OTP method
    if (method === 'otp' && mfaOptionId !== undefined) {
      requestBody.mfa_option_id = mfaOptionId;
    }

    console.log('🔍 AuthService MFA initiate request body:', JSON.stringify(requestBody, null, 2));

    return this.apiCall<MFAChallengeResponse>('/auth/mfa/initiate', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });
  }

  /**
   * Verify MFA challenge (v2 API)
   */
  async verifyMFAChallenge(
    transactionId: string,
    method: 'otp' | 'push',
    otp?: string
  ): Promise<MFAVerifyResponse> {
    const requestBody: any = {
      transaction_id: transactionId,
      method,
    };

    // Add OTP code if provided
    if (method === 'otp' && otp) {
      requestBody.code = otp;
    }

    const response = await this.apiCall<MFAVerifyResponse>('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    // Store access token if MFA was successful
    if (response.access_token) {
      this.setStoredAccessToken(response.access_token);
    }

    return response;
  }

  /**
   * Approve push MFA transaction (mobile app) (v2 API)
   */
  async approvePushMFA(transactionId: string, selectedNumber: number): Promise<{ success: boolean; transaction_id: string; challenge_status: string }> {
    return this.apiCall(`/mfa/transaction/${encodeURIComponent(transactionId)}/approve`, {
      method: 'POST',
      body: JSON.stringify({
        selected_number: selectedNumber,
      }),
    });
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

  /**
   * Get eSign document by ID (v2 API)
   */
  async getESignDocument(documentId: string): Promise<ESignDocument> {
    return this.apiCall<ESignDocument>(`/esign/document/${encodeURIComponent(documentId)}`);
  }

  /**
   * Accept eSign document (v2 API)
   */
  async acceptESign(
    transactionId: string,
    documentId: string,
    acceptanceIp?: string
  ): Promise<ESignResponse> {
    const response = await this.apiCall<ESignResponse>('/esign/accept', {
      method: 'POST',
      body: JSON.stringify({
        transaction_id: transactionId,
        document_id: documentId,
        acceptance_ip: acceptanceIp,
        acceptance_timestamp: new Date().toISOString(),
      }),
    });

    // Store access token if eSign acceptance was successful
    if (response.access_token) {
      this.setStoredAccessToken(response.access_token);
    }

    return response;
  }

  /**
   * Decline eSign document (v2 API)
   */
  async declineESign(
    transactionId: string,
    documentId: string,
    reason?: string
  ): Promise<void> {
    await this.apiCall<void>('/esign/decline', {
      method: 'POST',
      body: JSON.stringify({
        transaction_id: transactionId,
        document_id: documentId,
        reason: reason || 'User declined',
      }),
    });
  }

  /**
   * Bind device (trust device for future logins) (v2 API)
   * Backend handles device fingerprint internally via transaction_id
   */
  async bindDevice(transactionId: string): Promise<{ success: boolean; transaction_id: string; trusted_at: string; already_trusted: boolean }> {
    return this.apiCall<{ success: boolean; transaction_id: string; trusted_at: string; already_trusted: boolean }>('/device/bind', {
      method: 'POST',
      body: JSON.stringify({
        transaction_id: transactionId,
      }),
    });
  }

}