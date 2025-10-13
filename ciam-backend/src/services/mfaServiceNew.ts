/**
 * MFA Service (New - Repository-based)
 * Business logic for Multi-Factor Authentication operations
 * Extracted from auth-simple.ts lines 719-1232
 * Replaces old mfaService.ts with repository pattern
 */

import { mfaTransactionRepository } from '../repositories/mfaTransactionRepository';
import { pushChallengeRepository } from '../repositories/pushChallengeRepository';
import { userRepository } from '../repositories/userRepository';
import { deviceTrustRepository } from '../repositories/deviceTrustRepository';
import { pendingESignRepository } from '../repositories/pendingESignRepository';
import { loginTimeRepository } from '../repositories/loginTimeRepository';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt';

export interface MFAInitiateRequest {
  method: 'sms' | 'voice' | 'push';
  transaction_id: string;
  mfa_option_id?: number;
  context_id: string;
}

export interface MFAInitiateResult {
  success: boolean;
  transaction_id: string;
  expires_at: string;
  display_number?: number;
  error_code?: string;
}

export interface MFAVerifyOTPRequest {
  transaction_id: string;
  code: string;
  context_id: string;
}

export interface MFAVerifyPushRequest {
  transaction_id: string;
  context_id: string;
}

export interface MFAVerifyResult {
  success: boolean;
  responseTypeCode: 'SUCCESS' | 'MFA_PENDING' | 'ESIGN_REQUIRED' | 'DEVICE_BIND_REQUIRED' | 'ERROR';
  context_id: string;
  transaction_id: string;

  // SUCCESS fields
  access_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  device_bound?: boolean;
  refresh_token?: string;

  // MFA_PENDING fields
  expires_at?: string;
  retry_after?: number;
  message?: string;

  // ESIGN_REQUIRED fields
  esign_document_id?: string;
  esign_url?: string;
  is_mandatory?: boolean;

  // ERROR fields
  error_code?: string;
}

class MFAServiceNew {
  /**
   * Initiate MFA challenge
   * Extracted from auth-simple.ts lines 719-817
   */
  async initiateChallenge(request: MFAInitiateRequest): Promise<MFAInitiateResult> {
    const { method, transaction_id, mfa_option_id, context_id } = request;

    console.log('🔍 MFA Challenge Request:', { method, transaction_id, mfa_option_id, context_id });

    if (!transaction_id) {
      return {
        success: false,
        transaction_id: '',
        expires_at: '',
        error_code: 'MISSING_TRANSACTION_ID'
      };
    }

    // v3.0.0: Accept 'sms', 'voice', or 'push' methods
    if (!method || !['sms', 'voice', 'push'].includes(method)) {
      return {
        success: false,
        transaction_id: '',
        expires_at: '',
        error_code: 'INVALID_MFA_METHOD'
      };
    }

    // v3.0.0: mfa_option_id is required for OTP methods (sms/voice)
    if ((method === 'sms' || method === 'voice') && !mfa_option_id) {
      return {
        success: false,
        transaction_id: '',
        expires_at: '',
        error_code: 'MISSING_MFA_OPTION_ID'
      };
    }

    // Retrieve username from MFA transaction storage
    const mfaTransaction = mfaTransactionRepository.findById(transaction_id);
    if (!mfaTransaction) {
      console.log('❌ [MFA INITIATE] No MFA transaction found for:', transaction_id);
      return {
        success: false,
        transaction_id: '',
        expires_at: '',
        error_code: 'INVALID_TRANSACTION'
      };
    }

    const username = mfaTransaction.username;
    console.log('✅ [MFA INITIATE] Retrieved username from transaction:', { transaction_id, username });

    // Invalidate the old login transaction_id (one-time use)
    mfaTransactionRepository.delete(transaction_id);
    console.log('🗑️ [MFA INITIATE] Invalidated login transaction_id:', transaction_id);

    // Generate NEW transaction_id for MFA challenge step
    const newTransactionId = 'txn-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    // Store username context with NEW transaction_id for MFA challenge
    // Preserve deviceFingerprint from previous transaction
    mfaTransactionRepository.create(
      newTransactionId,
      username,
      method,
      mfaTransaction.deviceFingerprint // Carry forward device fingerprint
    );
    console.log('📝 [MFA INITIATE] Created new transaction_id for MFA challenge:', {
      oldTxn: transaction_id,
      newTxn: newTransactionId,
      method,
      deviceFingerprint: mfaTransaction.deviceFingerprint
    });

    const expires_at = new Date(Date.now() + 10 * 1000).toISOString();

    // v3.0.0: Handle OTP methods (sms/voice) - both work the same way
    if (method === 'sms' || method === 'voice') {
      return {
        success: true,
        transaction_id: newTransactionId,
        expires_at
      };
    }

    if (method === 'push') {
      const pushChallenge = pushChallengeRepository.create(newTransactionId, username);

      return {
        success: true,
        transaction_id: newTransactionId,
        expires_at,
        display_number: pushChallenge.correctNumber
      };
    }

    // Fallback (should never reach here due to validation above)
    return {
      success: false,
      transaction_id: '',
      expires_at: '',
      error_code: 'INVALID_MFA_METHOD'
    };
  }

  /**
   * Verify OTP Challenge (v3.0.0 - OTP-specific endpoint)
   * Extracted from auth-simple.ts lines 1099-1232
   */
  async verifyOTP(request: MFAVerifyOTPRequest): Promise<MFAVerifyResult> {
    const { transaction_id, code, context_id } = request;

    console.log('🔍 [OTP VERIFY] Request:', { transaction_id, context_id });

    if (!transaction_id) {
      return {
        success: false,
        responseTypeCode: 'ERROR',
        context_id,
        transaction_id,
        error_code: 'MISSING_TRANSACTION_ID'
      };
    }

    if (!code) {
      return {
        success: false,
        responseTypeCode: 'ERROR',
        context_id,
        transaction_id,
        error_code: 'MISSING_CODE'
      };
    }

    // Retrieve username from MFA transaction storage
    const mfaTransaction = mfaTransactionRepository.findById(transaction_id);
    if (!mfaTransaction) {
      console.log('❌ [OTP VERIFY] No MFA transaction found for:', transaction_id);
      return {
        success: false,
        responseTypeCode: 'ERROR',
        context_id,
        transaction_id,
        error_code: 'INVALID_TRANSACTION'
      };
    }

    const username = mfaTransaction.username;
    console.log('✅ [OTP VERIFY] Retrieved username from transaction:', { transaction_id, username });

    // Verify OTP code
    if (code === '1234') {
      const user = { id: username, username, email: `${username}@example.com`, roles: ['user'] };
      loginTimeRepository.update(username);

      // PRIORITY 1: Check if eSign is required FIRST (before device binding)
      console.log('🔍 [OTP VERIFY] Checking for pending eSign:', { username, transaction_id });
      const pendingESign = pendingESignRepository.findByUsername(username);
      console.log('🔍 [OTP VERIFY] Pending eSign result:', pendingESign);
      if (pendingESign) {
        // Invalidate the old MFA transaction_id (one-time use)
        mfaTransactionRepository.delete(transaction_id);
        console.log('🗑️ [OTP VERIFY] Invalidated MFA transaction_id:', transaction_id);

        // Generate NEW transaction_id for eSign step
        const newTransactionId = 'txn-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

        // Store username context with NEW transaction_id for eSign step
        mfaTransactionRepository.create(newTransactionId, username);
        console.log('📝 [OTP VERIFY] Created new transaction_id for eSign:', {
          oldTxn: transaction_id,
          newTxn: newTransactionId
        });

        return {
          success: true,
          responseTypeCode: 'ESIGN_REQUIRED',
          context_id,
          transaction_id: newTransactionId,
          esign_document_id: pendingESign.documentId,
          esign_url: `/auth/esign/documents/${pendingESign.documentId}`,
          is_mandatory: pendingESign.mandatory
        };
      }

      // PRIORITY 2: Check device trust status (after eSign check)
      const deviceFingerprint = mfaTransaction.deviceFingerprint;
      const deviceBound = deviceFingerprint
        ? deviceTrustRepository.isTrusted(deviceFingerprint, username)
        : false;
      console.log('🔍 [OTP VERIFY] Device trust check:', { deviceFingerprint, deviceBound });

      // V3: If device is NOT trusted, return DEVICE_BIND_REQUIRED (200)
      if (!deviceBound) {
        console.log('📱 [OTP VERIFY] Device not bound, returning DEVICE_BIND_REQUIRED:', {
          username,
          deviceFingerprint
        });

        // Invalidate the old MFA transaction_id (one-time use)
        mfaTransactionRepository.delete(transaction_id);
        console.log('🗑️ [OTP VERIFY] Invalidated MFA transaction_id:', transaction_id);

        // Generate NEW transaction_id for device binding step
        const newTransactionId = 'txn-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

        // Store username context with NEW transaction_id
        mfaTransactionRepository.create(newTransactionId, username);
        console.log('📝 [OTP VERIFY] Created new transaction_id for device binding:', {
          oldTxn: transaction_id,
          newTxn: newTransactionId
        });

        return {
          success: true,
          responseTypeCode: 'DEVICE_BIND_REQUIRED',
          context_id,
          transaction_id: newTransactionId
        };
      }

      // PRIORITY 3: No eSign, device is trusted - SUCCESS with tokens
      const accessToken = generateAccessToken(user.id, context_id, user.roles);
      const idToken = generateAccessToken(user.id, context_id, user.roles);
      const refreshToken = generateRefreshToken();

      // Invalidate the MFA transaction_id on success (one-time use)
      mfaTransactionRepository.delete(transaction_id);
      console.log('🗑️ [OTP VERIFY] Invalidated MFA transaction_id on success:', transaction_id);

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
        refresh_token
      };
    } else {
      // Invalid OTP - delete MFA transaction (single-use security)
      mfaTransactionRepository.delete(transaction_id);
      return {
        success: false,
        responseTypeCode: 'ERROR',
        context_id,
        transaction_id,
        error_code: 'INVALID_MFA_CODE'
      };
    }
  }

  /**
   * Verify Push MFA challenge (v3 - POST-based polling)
   * Extracted from auth-simple.ts lines 899-1093
   */
  async verifyPush(request: MFAVerifyPushRequest): Promise<MFAVerifyResult> {
    const { transaction_id, context_id } = request;

    console.log('🔍 [PUSH VERIFY] Request:', { transaction_id, context_id });

    if (!transaction_id) {
      return {
        success: false,
        responseTypeCode: 'ERROR',
        context_id,
        transaction_id,
        error_code: 'MISSING_TRANSACTION_ID'
      };
    }

    if (!context_id) {
      return {
        success: false,
        responseTypeCode: 'ERROR',
        context_id: '',
        transaction_id,
        error_code: 'MISSING_CONTEXT_ID'
      };
    }

    // Retrieve username from MFA transaction storage
    const mfaTransaction = mfaTransactionRepository.findById(transaction_id);
    if (!mfaTransaction) {
      console.log('❌ [PUSH VERIFY] No MFA transaction found for:', transaction_id);
      return {
        success: false,
        responseTypeCode: 'ERROR',
        context_id,
        transaction_id,
        error_code: 'TRANSACTION_NOT_FOUND'
      };
    }

    const username = mfaTransaction.username;
    console.log('✅ [PUSH VERIFY] Retrieved username from transaction:', { transaction_id, username });

    // Check if this is a Push challenge
    const challenge = pushChallengeRepository.findById(transaction_id);
    if (!challenge) {
      console.log('❌ [PUSH VERIFY] No push challenge found for:', transaction_id);
      return {
        success: false,
        responseTypeCode: 'ERROR',
        context_id,
        transaction_id,
        error_code: 'CHALLENGE_NOT_FOUND'
      };
    }

    // Determine current challenge status based on elapsed time and user scenario
    const timeElapsed = Date.now() - challenge.createdAt;
    let challenge_status = 'PENDING';

    if (challenge.username === 'pushfail') {
      if (timeElapsed > 7000) {
        challenge_status = 'REJECTED';
      }
    } else if (challenge.username === 'pushexpired') {
      if (timeElapsed > 10000) {
        challenge_status = 'EXPIRED';
      } else {
        challenge_status = 'PENDING';
      }
    } else {
      // Normal mfauser - auto-approve after 5 seconds
      if (timeElapsed > 5000) {
        challenge_status = 'APPROVED';
      }
    }

    console.log('📊 [PUSH VERIFY] Challenge status:', { challenge_status, timeElapsed });

    // V3: Return MFA_PENDING for polling when still pending
    if (challenge_status === 'PENDING') {
      return {
        success: true,
        responseTypeCode: 'MFA_PENDING',
        transaction_id,
        context_id,
        expires_at: new Date(challenge.createdAt + 10 * 1000).toISOString(),
        retry_after: 1000
      };
    }

    // Handle REJECTED status
    if (challenge_status === 'REJECTED') {
      console.log('❌ [PUSH VERIFY] Push notification rejected');
      pushChallengeRepository.delete(transaction_id);
      mfaTransactionRepository.delete(transaction_id);
      return {
        success: false,
        responseTypeCode: 'ERROR',
        context_id,
        transaction_id,
        error_code: 'PUSH_REJECTED'
      };
    }

    // Handle EXPIRED status
    if (challenge_status === 'EXPIRED') {
      console.log('⏰ [PUSH VERIFY] Push notification expired');
      pushChallengeRepository.delete(transaction_id);
      return {
        success: false,
        responseTypeCode: 'ERROR',
        context_id,
        transaction_id,
        error_code: 'TRANSACTION_EXPIRED'
      };
    }

    // Transaction is APPROVED - generate tokens
    console.log('✅ [PUSH VERIFY] Push approved, generating tokens');
    pushChallengeRepository.delete(transaction_id);

    const user = { id: username, username, email: `${username}@example.com`, roles: ['user'] };
    loginTimeRepository.update(username);

    // PRIORITY 1: Check if eSign is required FIRST
    console.log('🔍 [PUSH VERIFY] Checking for pending eSign:', { username, transaction_id });
    const pendingESign = pendingESignRepository.findByUsername(username);
    console.log('🔍 [PUSH VERIFY] Pending eSign result:', pendingESign);
    if (pendingESign) {
      mfaTransactionRepository.delete(transaction_id);
      console.log('🗑️ [PUSH VERIFY] Invalidated push transaction_id:', transaction_id);

      const newTransactionId = 'txn-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      mfaTransactionRepository.create(newTransactionId, username);
      console.log('📝 [PUSH VERIFY] Created new transaction_id for eSign:', {
        oldTxn: transaction_id,
        newTxn: newTransactionId
      });

      return {
        success: true,
        responseTypeCode: 'ESIGN_REQUIRED',
        context_id,
        transaction_id: newTransactionId,
        esign_document_id: pendingESign.documentId,
        esign_url: `/auth/esign/documents/${pendingESign.documentId}`,
        is_mandatory: pendingESign.mandatory
      };
    }

    // PRIORITY 2: Check device trust status
    const deviceFingerprint = mfaTransaction.deviceFingerprint;
    const deviceBound = deviceFingerprint
      ? deviceTrustRepository.isTrusted(deviceFingerprint, username)
      : false;
    console.log('🔍 [PUSH VERIFY] Device trust check:', { deviceFingerprint, deviceBound });

    if (!deviceBound) {
      console.log('📱 [PUSH VERIFY] Device not bound, returning DEVICE_BIND_REQUIRED:', {
        username,
        deviceFingerprint
      });

      mfaTransactionRepository.delete(transaction_id);
      console.log('🗑️ [PUSH VERIFY] Invalidated push transaction_id:', transaction_id);

      const newTransactionId = 'txn-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      mfaTransactionRepository.create(newTransactionId, username);
      console.log('📝 [PUSH VERIFY] Created new transaction_id for device binding:', {
        oldTxn: transaction_id,
        newTxn: newTransactionId
      });

      return {
        success: true,
        responseTypeCode: 'DEVICE_BIND_REQUIRED',
        context_id,
        transaction_id: newTransactionId
      };
    }

    // PRIORITY 3: No eSign, device is trusted - SUCCESS with tokens
    const accessToken = generateAccessToken(user.id, context_id, user.roles);
    const idToken = generateAccessToken(user.id, context_id, user.roles);
    const refreshToken = generateRefreshToken();

    mfaTransactionRepository.delete(transaction_id);
    console.log('🗑️ [PUSH VERIFY] Invalidated push transaction_id on success:', transaction_id);

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
      refresh_token
    };
  }
}

// Export singleton instance
export const mfaServiceNew = new MFAServiceNew();
