/**
 * Authentication Service
 * Business logic for authentication operations
 * Extracted from auth-simple.ts lines 354-618
 */

import { userRepository } from '../repositories/userRepository';
import { mfaTransactionRepository } from '../repositories/mfaTransactionRepository';
import { deviceTrustRepository } from '../repositories/deviceTrustRepository';
import { pendingESignRepository } from '../repositories/pendingESignRepository';
import { esignAcceptanceRepository } from '../repositories/esignAcceptanceRepository';
import { loginTimeRepository } from '../repositories/loginTimeRepository';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt-simple';

export interface LoginRequest {
  username: string;
  password: string;
  drs_action_token?: string;
  app_id: string;
  app_version: string;
}

export interface LoginResult {
  success: boolean;
  responseTypeCode: 'SUCCESS' | 'MFA_REQUIRED' | 'ESIGN_REQUIRED' | 'ERROR';
  context_id: string;
  transaction_id: string;

  // SUCCESS fields
  access_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  device_bound?: boolean;

  // MFA_REQUIRED fields
  otp_methods?: Array<{ value: string; mfa_option_id: number }>;
  mobile_approve_status?: 'NOT_REGISTERED' | 'ENABLED' | 'DISABLED';

  // ESIGN_REQUIRED fields
  esign_document_id?: string;
  esign_url?: string;
  is_mandatory?: boolean;

  // ERROR fields
  error_code?: string;
}

class AuthService {
  /**
   * Handle user login with all scenarios
   * Extracted from auth-simple.ts lines 354-618
   */
  async login(request: LoginRequest): Promise<LoginResult> {
    const { username, password, drs_action_token, app_id, app_version } = request;

    const context_id = 'session-' + Date.now();
    const transaction_id = 'txn-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    // Validate required fields
    if (!username || !password) {
      return {
        success: false,
        responseTypeCode: 'ERROR',
        context_id,
        transaction_id,
        error_code: 'MISSING_CREDENTIALS'
      };
    }

    if (!app_id || !app_version) {
      return {
        success: false,
        responseTypeCode: 'ERROR',
        context_id,
        transaction_id,
        error_code: 'MISSING_APP_INFO'
      };
    }

    // Process device fingerprint if provided
    let deviceFingerprint: string | undefined;
    if (drs_action_token) {
      deviceFingerprint = deviceTrustRepository.convertActionTokenToFingerprint(drs_action_token);
      console.log('🔍 Device fingerprint generated:', {
        actionToken: drs_action_token,
        deviceFingerprint
      });
    }

    // Validate credentials
    const validation = userRepository.validateCredentials(username, password);
    if (!validation.valid || !validation.scenario) {
      return {
        success: false,
        responseTypeCode: 'ERROR',
        context_id,
        transaction_id,
        error_code: 'CIAM_E01_01_001' // Invalid credentials
      };
    }

    const userScenario = validation.scenario;

    // Pre-trust devices for specific test scenarios (simulating returning users with trusted devices)
    if (deviceFingerprint && ['trusted', 'esign_required'].includes(userScenario.scenario)) {
      if (!deviceTrustRepository.isTrusted(deviceFingerprint, username)) {
        deviceTrustRepository.trust(deviceFingerprint, username); // Use default duration (non-expiring)
        console.log('🔐 Pre-trusted device for test scenario:', { username, deviceFingerprint });
      }
    }

    // Handle locked scenarios
    if (userScenario.scenario === 'locked') {
      return {
        success: false,
        responseTypeCode: 'ERROR',
        context_id,
        transaction_id,
        error_code: 'CIAM_E01_01_002' // Account locked
      };
    }

    if (userScenario.scenario === 'mfa_locked') {
      return {
        success: false,
        responseTypeCode: 'ERROR',
        context_id,
        transaction_id,
        error_code: 'CIAM_E01_01_005' // MFA locked
      };
    }

    // Check device trust for trusted users
    if (userScenario.scenario === 'trusted' && deviceFingerprint &&
        deviceTrustRepository.isTrusted(deviceFingerprint, username)) {
      console.log('🚀 Trusted device - instant login:', { username, deviceFingerprint });

      // Update device last used
      deviceTrustRepository.updateLastUsed(deviceFingerprint);

      const user = {
        id: username,
        username,
        email: `${username}@example.com`,
        roles: ['user']
      };
      loginTimeRepository.update(username);

      const accessToken = generateAccessToken(user);
      const idToken = generateAccessToken(user); // In production, this would be different
      const refreshToken = generateRefreshToken(user);

      return {
        success: true,
        responseTypeCode: 'SUCCESS',
        access_token: accessToken,
        id_token: idToken,
        token_type: 'Bearer',
        expires_in: 900,
        context_id,
        transaction_id,
        device_bound: true,
        refresh_token: refreshToken
      } as any;
    }

    // Handle eSign required scenarios (trusted device but needs eSign)
    if (userScenario.scenario === 'esign_required' && deviceFingerprint &&
        deviceTrustRepository.isTrusted(deviceFingerprint, username)) {
      console.log('📝 eSign required for trusted user:', { username });

      // Add to pending eSigns
      pendingESignRepository.create(username, 'terms-v1-2025', true, 'policy_update');

      return {
        success: true,
        responseTypeCode: 'ESIGN_REQUIRED',
        context_id,
        transaction_id,
        esign_document_id: 'terms-v1-2025',
        esign_url: '/auth/esign/documents/terms-v1-2025',
        is_mandatory: true
      };
    }

    // Handle MFA required and success scenarios
    if (userScenario.scenario === 'mfa_required') {
      // Check if device is trusted and can bypass MFA
      if (deviceFingerprint && deviceTrustRepository.isTrusted(deviceFingerprint, username)) {
        console.log('🚀 MFA Skip - Device trusted:', { username, deviceFingerprint });

        deviceTrustRepository.updateLastUsed(deviceFingerprint);

        const user = {
          id: username,
          username,
          email: `${username}@example.com`,
          roles: ['user']
        };
        loginTimeRepository.update(username);

        const accessToken = generateAccessToken(user);
        const idToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        // Check for pending eSign (compliance scenario)
        if (userScenario.esignBehavior === 'compliance' &&
            !esignAcceptanceRepository.hasAccepted(username, 'terms-v1-2025')) {
          pendingESignRepository.create(username, 'terms-v1-2025', true, 'compliance');
          return {
            success: true,
            responseTypeCode: 'ESIGN_REQUIRED',
            context_id,
            transaction_id,
            esign_document_id: 'terms-v1-2025',
            esign_url: '/auth/esign/documents/terms-v1-2025',
            is_mandatory: true
          };
        }

        return {
          success: true,
          responseTypeCode: 'SUCCESS',
          access_token: accessToken,
          id_token: idToken,
          token_type: 'Bearer',
          expires_in: 900,
          context_id,
          transaction_id,
          device_bound: true,
          refresh_token: refreshToken
        } as any;
      }

      // Check for eSign scenarios after MFA
      if (userScenario.esignBehavior && ['accept', 'decline'].includes(userScenario.esignBehavior)) {
        console.log('📝 [LOGIN] Setting pending eSign for user after MFA:', {
          username,
          esignBehavior: userScenario.esignBehavior
        });
        pendingESignRepository.create(username, 'terms-v1-2025', true, 'policy_update');
        console.log('📝 [LOGIN] Pending eSign set:', pendingESignRepository.findByUsername(username));
      }

      // Determine available MFA methods based on user scenario (v3.0.0)
      const availableMethods = userScenario.availableMethods || ['sms', 'push'];

      // Build otp_methods array (simulate multiple phone numbers) - v3.0.0: includes both sms and voice
      const otp_methods = (availableMethods.includes('sms') || availableMethods.includes('voice')) ? [
        { value: '1234', mfa_option_id: 1 },
        { value: '5678', mfa_option_id: 2 }
      ] : [];

      // Determine mobile approve status
      let mobile_approve_status: 'NOT_REGISTERED' | 'ENABLED' | 'DISABLED';
      if (!availableMethods.includes('push')) {
        mobile_approve_status = 'NOT_REGISTERED';
      } else if (username === 'pushonlyuser') {
        mobile_approve_status = 'ENABLED';
      } else {
        mobile_approve_status = 'ENABLED';
      }

      // Store MFA transaction for username retrieval during verify
      mfaTransactionRepository.create(
        transaction_id,
        username,
        undefined,
        deviceFingerprint // Store device fingerprint for device trust check during MFA verify
      );
      console.log('📝 [LOGIN] Stored MFA transaction:', {
        transaction_id,
        username,
        deviceFingerprint
      });

      // Standard MFA required
      return {
        success: true,
        responseTypeCode: 'MFA_REQUIRED',
        otp_methods,
        mobile_approve_status,
        context_id,
        transaction_id
      };
    }

    // Handle success scenario (users with no pending eSign)
    if (userScenario.scenario === 'success') {
      const user = {
        id: username,
        username,
        email: `${username}@example.com`,
        roles: ['user']
      };
      loginTimeRepository.update(username);

      const accessToken = generateAccessToken(user);
      const idToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      // Check for compliance pending
      if (userScenario.esignBehavior === 'compliance' &&
          !esignAcceptanceRepository.hasAccepted(username, 'terms-v1-2025')) {
        pendingESignRepository.create(username, 'terms-v1-2025', true, 'compliance');
        return {
          success: true,
          responseTypeCode: 'ESIGN_REQUIRED',
          context_id,
          transaction_id,
          esign_document_id: 'terms-v1-2025',
          esign_url: '/auth/esign/documents/terms-v1-2025',
          is_mandatory: true
        };
      }

      return {
        success: true,
        responseTypeCode: 'SUCCESS',
        access_token: accessToken,
        id_token: idToken,
        token_type: 'Bearer',
        expires_in: 900,
        context_id,
        transaction_id,
        device_bound: deviceFingerprint ? deviceTrustRepository.isTrusted(deviceFingerprint, username) : false,
        refresh_token: refreshToken
      } as any;
    }

    // Fallback - should not reach here
    return {
      success: false,
      responseTypeCode: 'ERROR',
      context_id,
      transaction_id,
      error_code: 'CIAM_E05_00_001' // Service unavailable
    };
  }

  /**
   * Detect risk based on user behavior
   * Extracted from auth-simple.ts lines 183-191
   */
  detectRisk(username: string, deviceFingerprint?: string): boolean {
    // For other users, could check:
    // - New device
    // - New location (would come from IP geolocation)
    // - Unusual time of day
    // - Multiple failed attempts recently

    return false;
  }
}

// Export singleton instance
export const authService = new AuthService();
