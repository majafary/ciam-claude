/**
 * Device Service
 * Business logic for device binding and trust management
 * Extracted from auth-simple.ts lines 1527-1603
 */

import { mfaTransactionRepository } from '../repositories/mfaTransactionRepository';
import { deviceTrustRepository } from '../repositories/deviceTrustRepository';
import { userRepository } from '../repositories/userRepository';
import { loginTimeRepository } from '../repositories/loginTimeRepository';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt';

export interface DeviceBindRequest {
  transaction_id: string;
  context_id: string;
  bind_device: boolean;
  drs_action_token?: string;
}

export interface DeviceBindResult {
  success: boolean;
  responseTypeCode: 'SUCCESS' | 'ERROR';
  context_id: string;
  transaction_id?: string;

  // SUCCESS fields
  access_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  device_bound?: boolean;
  refresh_token?: string;

  // ERROR fields
  error_code?: string;
}

class DeviceService {
  /**
   * Bind device (trust device) - v3.0.0
   * Extracted from auth-simple.ts lines 1527-1603
   */
  async bindDevice(request: DeviceBindRequest): Promise<DeviceBindResult> {
    const { transaction_id, context_id, bind_device, drs_action_token } = request;

    console.log('🔍 [DEVICE BIND] Request:', {
      transaction_id,
      context_id,
      bind_device
    });

    // v3.0.0: bind_device is required
    if (!transaction_id || bind_device === undefined) {
      return {
        success: false,
        responseTypeCode: 'ERROR',
        context_id,
        error_code: 'MISSING_REQUIRED_FIELDS'
      };
    }

    // Retrieve username from MFA transaction storage
    const mfaTransaction = mfaTransactionRepository.findById(transaction_id);
    if (!mfaTransaction) {
      console.log('❌ [DEVICE BIND] No MFA transaction found for:', transaction_id);
      return {
        success: false,
        responseTypeCode: 'ERROR',
        context_id,
        error_code: 'TRANSACTION_NOT_FOUND'
      };
    }

    const username = mfaTransaction.username;
    console.log('✅ [DEVICE BIND] Retrieved username from transaction:', {
      transaction_id,
      username
    });

    // Verify user exists
    const userScenario = userRepository.findScenarioByUsername(username);
    if (!userScenario) {
      return {
        success: false,
        responseTypeCode: 'ERROR',
        context_id,
        error_code: 'TRANSACTION_NOT_FOUND'
      };
    }

    // Generate device fingerprint from DRS token if available
    const deviceFingerprint = drs_action_token
      ? deviceTrustRepository.convertActionTokenToFingerprint(drs_action_token)
      : `device_${username}_${Date.now()}`;

    // v3.0.0: Handle bind_device parameter
    let device_bound = false;
    if (bind_device === true) {
      // User chose to trust the device
      deviceTrustRepository.trust(deviceFingerprint, username);
      device_bound = true;
      console.log('🔐 Device bound via /auth/device/bind:', {
        username,
        deviceFingerprint
      });
    } else {
      // User declined to trust the device
      console.log('⏭️ Device binding skipped by user:', {
        username,
        deviceFingerprint
      });
    }

    // v3.0.0: Generate and return tokens
    const user = {
      id: username,
      username,
      email: `${username}@example.com`,
      roles: ['user']
    };
    loginTimeRepository.update(username);

    const accessToken = generateAccessToken(user.id, context_id, user.roles);
    const idToken = generateAccessToken(user.id, context_id, user.roles);
    const refreshToken = generateRefreshToken();

    return {
      success: true,
      responseTypeCode: 'SUCCESS',
      access_token: accessToken,
      id_token: idToken,
      token_type: 'Bearer',
      expires_in: 900,
      context_id,
      transaction_id,
      device_bound,
      refresh_token
    };
  }

  /**
   * Check if device is trusted
   */
  async isDeviceTrusted(
    username: string,
    deviceFingerprint?: string
  ): Promise<boolean> {
    if (!deviceFingerprint) {
      return false;
    }

    return deviceTrustRepository.isTrusted(deviceFingerprint, username);
  }

  /**
   * Update device last used timestamp
   */
  async updateDeviceLastUsed(deviceFingerprint: string): Promise<boolean> {
    return deviceTrustRepository.updateLastUsed(deviceFingerprint);
  }

  /**
   * Revoke device trust
   */
  async revokeDevice(deviceFingerprint: string): Promise<boolean> {
    return deviceTrustRepository.revoke(deviceFingerprint);
  }

  /**
   * Revoke all devices for a user
   */
  async revokeAllDevicesForUser(username: string): Promise<number> {
    return deviceTrustRepository.revokeAllForUser(username);
  }

  /**
   * Get all trusted devices for a user
   */
  async getUserDevices(username: string) {
    return deviceTrustRepository.findByUsername(username);
  }
}

// Export singleton instance
export const deviceService = new DeviceService();
