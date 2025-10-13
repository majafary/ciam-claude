/**
 * eSign Service (New - Repository-based)
 * Business logic for electronic signature operations
 * Extracted from auth-simple.ts lines 1238-1399
 */

import { esignDocumentRepository } from '../repositories/esignDocumentRepository';
import { esignAcceptanceRepository } from '../repositories/esignAcceptanceRepository';
import { pendingESignRepository } from '../repositories/pendingESignRepository';
import { mfaTransactionRepository } from '../repositories/mfaTransactionRepository';
import { deviceTrustRepository } from '../repositories/deviceTrustRepository';
import { userRepository } from '../repositories/userRepository';
import { loginTimeRepository } from '../repositories/loginTimeRepository';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt-simple';

export interface ESignAcceptRequest {
  transaction_id: string;
  document_id: string;
  acceptance_ip?: string;
  acceptance_timestamp?: string;
  context_id: string;
  drs_action_token?: string;
}

export interface ESignAcceptResult {
  success: boolean;
  responseTypeCode: 'SUCCESS' | 'DEVICE_BIND_REQUIRED' | 'ERROR';
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

class ESignServiceNew {
  /**
   * Get eSign document by ID
   * Extracted from auth-simple.ts lines 1238-1258
   */
  async getDocument(documentId: string) {
    const document = esignDocumentRepository.findById(documentId);

    if (!document) {
      return null;
    }

    return {
      document_id: document.documentId,
      title: document.title,
      content: document.content,
      version: document.version,
      mandatory: document.mandatory
    };
  }

  /**
   * Accept eSign document
   * Extracted from auth-simple.ts lines 1264-1359
   */
  async acceptDocument(request: ESignAcceptRequest): Promise<ESignAcceptResult> {
    const { transaction_id, document_id, acceptance_ip, context_id, drs_action_token } = request;

    console.log('🔍 [ESIGN ACCEPT] Request:', { transaction_id, document_id, context_id });

    if (!transaction_id || !document_id) {
      return {
        success: false,
        responseTypeCode: 'ERROR',
        context_id,
        error_code: 'MISSING_REQUIRED_FIELDS'
      };
    }

    // Extract username from pending eSigns
    let username: string | null = null;
    const allPending = pendingESignRepository.getAll();
    for (const pending of allPending) {
      if (pending.documentId === document_id) {
        username = pending.username;
        break;
      }
    }

    if (!username) {
      return {
        success: false,
        responseTypeCode: 'ERROR',
        context_id,
        error_code: 'NO_PENDING_ESIGN'
      };
    }

    // Mark as accepted
    esignAcceptanceRepository.create(username, document_id, acceptance_ip);
    pendingESignRepository.delete(username);

    // v3.0.0: Check if device binding is needed (extract deviceFingerprint from context)
    const deviceFingerprint = drs_action_token
      ? deviceTrustRepository.convertActionTokenToFingerprint(drs_action_token)
      : undefined;
    const device_bound = deviceFingerprint
      ? deviceTrustRepository.isTrusted(deviceFingerprint, username)
      : false;

    // v3.0.0: If device is not bound, return DEVICE_BIND_REQUIRED
    if (!device_bound) {
      console.log('📱 [ESIGN ACCEPT] Device not bound, returning DEVICE_BIND_REQUIRED:', {
        username,
        deviceFingerprint
      });

      // Invalidate the old eSign transaction_id (one-time use)
      mfaTransactionRepository.delete(transaction_id);
      console.log('🗑️ [ESIGN ACCEPT] Invalidated eSign transaction_id:', transaction_id);

      // Generate NEW transaction_id for device binding step
      const newTransactionId = 'txn-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

      // Store username context with NEW transaction_id for device binding step
      mfaTransactionRepository.create(newTransactionId, username);
      console.log('📝 [ESIGN ACCEPT] Created new transaction_id for device binding:', {
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

    // v3.0.0: Device already bound, return SUCCESS with tokens
    console.log('✅ [ESIGN ACCEPT] Device already bound, returning tokens:', {
      username,
      deviceFingerprint
    });

    // Invalidate the eSign transaction_id on success (one-time use)
    mfaTransactionRepository.delete(transaction_id);
    console.log('🗑️ [ESIGN ACCEPT] Invalidated eSign transaction_id on success:', transaction_id);

    // Generate tokens
    const user = { id: username, username, email: `${username}@example.com`, roles: ['user'] };
    loginTimeRepository.update(username);

    const accessToken = generateAccessToken(user);
    const idToken = generateAccessToken(user);
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
      refresh_token
    };
  }

  /**
   * Decline eSign document
   * Extracted from auth-simple.ts lines 1365-1399
   */
  async declineDocument(
    transactionId: string,
    documentId: string,
    reason?: string,
    context_id?: string
  ): Promise<{
    success: boolean;
    error_code: string;
    context_id: string;
    transaction_id: string;
    can_retry: boolean;
  }> {
    console.log('🔍 [ESIGN DECLINE] Request:', { transactionId, documentId, context_id });

    if (!transactionId || !documentId) {
      return {
        success: false,
        error_code: 'MISSING_REQUIRED_FIELDS',
        context_id: context_id || '',
        transaction_id: transactionId,
        can_retry: false
      };
    }

    // Extract username from pending eSigns
    let username: string | null = null;
    const allPending = pendingESignRepository.getAll();
    for (const pending of allPending) {
      if (pending.documentId === documentId) {
        username = pending.username;
        break;
      }
    }

    console.log('❌ eSign declined:', { username, documentId, reason });

    // Remove from pending (user must re-authenticate to try again)
    if (username) {
      pendingESignRepository.delete(username);
    }

    return {
      success: false,
      error_code: 'ESIGN_DECLINED',
      context_id: context_id || '',
      transaction_id: transactionId,
      can_retry: true
    };
  }

  /**
   * Check if user needs eSign
   */
  async needsESign(username: string): Promise<{
    required: boolean;
    documentId?: string;
    isMandatory?: boolean;
  }> {
    const pendingESign = pendingESignRepository.findByUsername(username);

    if (!pendingESign) {
      return { required: false };
    }

    return {
      required: true,
      documentId: pendingESign.documentId,
      isMandatory: pendingESign.mandatory
    };
  }

  /**
   * Check if user has accepted a specific document
   */
  async hasAcceptedDocument(username: string, documentId: string): Promise<boolean> {
    return esignAcceptanceRepository.hasAccepted(username, documentId);
  }

  /**
   * Get all documents
   */
  async getAllDocuments() {
    return esignDocumentRepository.getAll();
  }

  /**
   * Get user's eSign acceptances
   */
  async getUserAcceptances(username: string) {
    return esignAcceptanceRepository.findByUsername(username);
  }
}

// Export singleton instance
export const esignServiceNew = new ESignServiceNew();
