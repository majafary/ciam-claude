import { v4 as uuidv4 } from 'uuid';
import { Request, Response } from 'express';
import { createMFATransaction, getMFATransaction, verifyOTP, verifyPushResult, getOTPForTesting, approvePushWithNumber } from '../services/mfaService';
import { getUserById } from '../services/userService';
import { createSessionTokens } from '../services/tokenService';
import { generateAccessToken, generateIdToken, getRefreshTokenCookieOptions } from '../utils/jwt';
import { handleMFAError, handleAuthError, handleInternalError, sendErrorResponse, createApiError } from '../utils/errors';
import { logAuthEvent } from '../utils/logger';
import { MFAChallengeRequest, MFAChallengeResponse, MFAVerifyRequest, MFAVerifySuccessResponse, MFAPendingResponse, OTPResponse, MFAApproveRequest, MFAApproveResponse } from '../types';
import { isDeviceTrusted } from './deviceController';
import { withTransaction } from '../database/transactions';
import { repositories } from '../repositories';

/**
 * Initiate MFA challenge (v3 with context_id support)
 * POST /auth/mfa/initiate
 *
 * Transaction Management: Wraps transaction invalidation, creation, and audit logging
 * in a single transaction to ensure atomicity per Scenario 2 Step 2
 */
export const initiateChallenge = async (req: Request, res: Response): Promise<void> => {
  try {
    const { context_id, transaction_id, method, mfa_option_id }: MFAChallengeRequest = req.body;

    // V3: Validate context_id
    if (!context_id) {
      sendErrorResponse(res, 400, createApiError(
        'CIAM_E04_00_010',
        'context_id is required'
      ));
      return;
    }

    // Validate mfa_option_id for OTP methods (sms/voice)
    const isOTPMethod = method === 'sms' || method === 'voice';
    if (isOTPMethod && !mfa_option_id) {
      sendErrorResponse(res, 400, createApiError(
        'CIAM_E01_01_001',
        'mfa_option_id is required when method is sms or voice'
      ));
      return;
    }

    logAuthEvent('mfa_challenge', undefined, {
      method,
      contextId: context_id,
      transactionId: transaction_id,
      mfaOptionId: mfa_option_id,
      ip: req.ip
    });

    // Get the existing transaction to retrieve user info (read-only, outside transaction)
    const existingTransaction = await getMFATransaction(transaction_id);

    if (!existingTransaction) {
      sendErrorResponse(res, 404, createApiError(
        'CIAM_E01_03_001',
        'Transaction not found'
      ));
      return;
    }

    const userId = existingTransaction.userId;

    // Check if user is MFA locked (read-only, outside transaction)
    const user = await getUserById(userId);
    if (user?.mfaLocked) {
      logAuthEvent('mfa_failure', userId, {
        reason: 'mfa_locked',
        method,
        ip: req.ip
      });

      sendErrorResponse(res, 423, createApiError(
        'CIAM_E01_01_005',
        'MFA is locked for this account'
      ));
      return;
    }

    // TRANSACTION: Atomic transaction invalidation, creation, and audit logging
    const transaction = await withTransaction(async (trx) => {
      // Step 1: Expire all pending transactions for this context
      await repositories.authTransaction.expirePendingByContext(context_id, trx);

      // Step 2: Create new MFA transaction
      const transactionId = `mfa-${method}-${userId}-${Date.now()}`;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 2 * 60 * 1000); // 2 minutes
      const displayNumber = method === 'push' ? Math.floor(1 + Math.random() * 9) : undefined;

      const metadata = {
        cupid: userId,
        session_id: existingTransaction.sessionId,
        method,
        challenge_id: isOTPMethod ? `ch-${Date.now()}` : undefined,
        otp: isOTPMethod ? '1234' : undefined, // Mock OTP for testing
        display_number: displayNumber,
        mfa_option_id: mfa_option_id,
      };

      // Get next sequence number for this context
      const sequenceNumber = await repositories.authTransaction.getNextSequenceNumber(context_id, trx);

      const dbTransaction = await repositories.authTransaction.create({
        transaction_id: transactionId,
        context_id: context_id,
        parent_transaction_id: null,
        sequence_number: sequenceNumber,
        phase: 'MFA',
        transaction_status: 'PENDING',
        mfa_method: method.toUpperCase() as any,
        mfa_option_id: mfa_option_id || null,
        display_number: displayNumber || null,
        selected_number: null,
        verification_result: null,
        attempt_number: 1,
        mfa_options: null,
        mobile_approve_status: null,
        esign_document_id: null,
        esign_action: null,
        device_bind_decision: null,
        metadata,
        created_at: now,
        updated_at: now,
        expires_at: expiresAt,
      }, trx);

      // Step 3: Log audit event
      await repositories.auditLog.create({
        audit_id: uuidv4(),
        category: 'MFA',
        action: 'MFA_INITIATED',
        cupid: userId,
        context_id: context_id,
        ip_address: req.ip || null,
        user_agent: req.get('User-Agent') || null,
        details: {
          event_type: 'MFA_CHALLENGE_SENT',
          severity: 'INFO',
          session_id: existingTransaction.sessionId || null,
          method,
          phone_last_four: mfa_option_id ? '****' : null
        },
        created_at: new Date(),
      }, trx);

      return {
        transactionId: dbTransaction.transaction_id,
        expiresAt: dbTransaction.expires_at,
        displayNumber,
      };
    });

    logAuthEvent('mfa_challenge_created', userId, {
      transactionId: transaction.transactionId,
      contextId: context_id,
      method,
      sessionId: existingTransaction.sessionId,
      ip: req.ip
    });

    const response: MFAChallengeResponse = {
      success: true,
      transaction_id: transaction.transactionId, // V3: Returns NEW transaction_id
      expires_at: transaction.expiresAt.toISOString() // V3: Backend-controlled timer
    };

    if (transaction.displayNumber) {
      response.display_number = transaction.displayNumber;
    }

    res.json(response);
  } catch (error) {
    logAuthEvent('mfa_challenge_failure', undefined, {
      method: req.body.method,
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip
    });

    handleInternalError(res, error instanceof Error ? error : new Error('MFA challenge failed'));
  }
};

/**
 * Verify MFA OTP challenge (v3 - OTP specific)
 * POST /auth/mfa/otp/verify
 *
 * Transaction Management: Wraps transaction validation, consumption, context completion,
 * session/token creation, and audit logging in a single transaction per Scenario 2 Step 3
 */
export const verifyOTPChallenge = async (req: Request, res: Response): Promise<void> => {
  try {
    const { context_id, transaction_id, code }: MFAVerifyRequest = req.body;

    // V3: Validate context_id
    if (!context_id) {
      sendErrorResponse(res, 400, createApiError(
        'CIAM_E04_00_010',
        'context_id is required'
      ));
      return;
    }

    logAuthEvent('mfa_verify_otp', undefined, {
      contextId: context_id,
      transactionId: transaction_id,
      hasCode: !!code,
      ip: req.ip
    });

    // Get MFA transaction (read-only, outside transaction)
    const transaction = await getMFATransaction(transaction_id);

    if (!transaction) {
      logAuthEvent('mfa_failure', undefined, {
        reason: 'transaction_not_found',
        transactionId: transaction_id,
        ip: req.ip
      });

      sendErrorResponse(res, 404, createApiError(
        'CIAM_E01_01_001',
        'Transaction not found'
      ));
      return;
    }

    if (transaction.status !== 'PENDING' && transaction.status !== 'APPROVED') {
      logAuthEvent('mfa_failure', transaction.userId, {
        reason: 'transaction_not_pending',
        transactionId: transaction_id,
        status: transaction.status,
        ip: req.ip
      });

      sendErrorResponse(res, 410, createApiError(
        'CIAM_E01_01_001',
        'Transaction has expired or been rejected'
      ));
      return;
    }

    // Check if transaction is for mfa locked user
    if (transaction.userId === 'user-mfa-locked') {
      logAuthEvent('mfa_failure', transaction.userId, {
        reason: 'mfa_locked',
        transactionId: transaction_id,
        ip: req.ip
      });

      sendErrorResponse(res, 423, createApiError(
        'CIAM_E01_01_005',
        'MFA is locked for this account'
      ));
      return;
    }

    // V3: OTP verification only - code is required
    if (!code) {
      sendErrorResponse(res, 400, createApiError(
        'CIAM_E01_01_001',
        'code is required for OTP verification'
      ));
      return;
    }

    // Verify OTP (application logic - outside transaction)
    const isValidOTP = code === '1234'; // Mock validation for testing

    if (!isValidOTP) {
      logAuthEvent('mfa_failure', transaction.userId, {
        reason: 'invalid_otp',
        transactionId: transaction_id,
        method: transaction.method,
        ip: req.ip
      });

      sendErrorResponse(res, 400, createApiError(
        'CIAM_E01_01_001',
        'Invalid OTP code'
      ));
      return;
    }

    // Get user information (read-only, outside transaction)
    const user = await getUserById(transaction.userId);
    if (!user) {
      handleInternalError(res, new Error('User not found after successful MFA'));
      return;
    }

    // TRANSACTION: Atomic transaction consumption, context completion, session/token creation, and audit
    const result = await withTransaction(async (trx) => {
      // Step 1: Consume MFA transaction (mark as approved)
      await repositories.authTransaction.approve(transaction_id, trx);

      // Step 2: Mark auth context as complete
      await repositories.authContext.update(context_id, {
        cupid: user.cupid,
        updated_at: new Date(),
      }, trx);

      // Step 3: Create session
      const sessionId = transaction.sessionId || `sess-${Date.now()}`;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

      const session = await repositories.session.create({
        session_id: sessionId,
        cupid: user.cupid,
        context_id: context_id,
        device_id: `device-${Date.now()}`,
        created_at: now,
        last_seen_at: now,
        expires_at: expiresAt,
        ip_address: req.ip || null,
        user_agent: req.get('User-Agent') || null,
        status: 'ACTIVE',
      }, trx);

      // Step 4: Create all tokens (ACCESS, REFRESH, ID) atomically
      const tokens = await createSessionTokens(
        sessionId,
        user.cupid,  // cupid for JWT payload
        user.roles,
        {
          preferred_username: user.cupid,
          email: user.email,
          email_verified: true,
          given_name: user.given_name,
          family_name: user.family_name
        },
        trx
      );

      // Step 5: Log audit events
      await repositories.auditLog.create({
        audit_id: uuidv4(),
        category: 'MFA',
        action: 'MFA_SUCCESS',
        cupid: user.cupid,
        context_id: context_id,
        ip_address: req.ip || null,
        user_agent: req.get('User-Agent') || null,
        details: {
          event_type: 'MFA_VERIFY_SUCCESS',
          severity: 'INFO',
          session_id: sessionId,
          method: transaction.method,
          attempt: 1
        },
        created_at: new Date(),
      }, trx);

      await repositories.auditLog.create({
        audit_id: uuidv4(),
        category: 'AUTH',
        action: 'LOGIN_SUCCESS',
        cupid: user.cupid,
        context_id: context_id,
        ip_address: req.ip || null,
        user_agent: req.get('User-Agent') || null,
        details: {
          event_type: 'LOGIN_SUCCESS',
          severity: 'INFO',
          session_id: sessionId
        },
        created_at: new Date(),
      }, trx);

      return {
        sessionId,
        tokens,
      };
    });

    logAuthEvent('mfa_success', user.cupid, {
      transactionId: transaction_id,
      sessionId: result.sessionId,
      method: transaction.method,
      ip: req.ip
    });

    // Set refresh token cookie
    res.cookie('refresh_token', result.tokens.refreshToken, getRefreshTokenCookieOptions());

    const response: MFAVerifySuccessResponse = {
      response_type_code: 'SUCCESS',
      access_token: result.tokens.accessToken,
      id_token: result.tokens.idToken,
      token_type: 'Bearer',
      expires_in: result.tokens.expiresIn,
      transaction_id: transaction_id
    };

    res.json(response);
  } catch (error) {
    logAuthEvent('mfa_verify_otp_failure', undefined, {
      contextId: req.body.context_id,
      transactionId: req.body.transaction_id,
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip
    });

    handleInternalError(res, error instanceof Error ? error : new Error('MFA OTP verification failed'));
  }
};

/**
 * Verify MFA Push challenge (v3 - Push specific)
 * POST /mfa/transaction/:transaction_id
 */
export const verifyPushChallenge = async (req: Request, res: Response): Promise<void> => {
  try {
    const { transaction_id } = req.params;
    const { context_id } = req.body;

    // V3: Validate context_id
    if (!context_id) {
      sendErrorResponse(res, 400, createApiError(
        'CIAM_E04_00_010',
        'context_id is required'
      ));
      return;
    }

    logAuthEvent('mfa_verify_push', undefined, {
      contextId: context_id,
      transactionId: transaction_id,
      ip: req.ip
    });

    // Get MFA transaction
    const transaction = await getMFATransaction(transaction_id);

    if (!transaction) {
      logAuthEvent('mfa_failure', undefined, {
        reason: 'transaction_not_found',
        transactionId: transaction_id,
        ip: req.ip
      });

      sendErrorResponse(res, 404, createApiError(
        'CIAM_E01_01_001',
        'Transaction not found'
      ));
      return;
    }

    // V3: Validate this is a push transaction
    if (transaction.method !== 'push') {
      sendErrorResponse(res, 400, createApiError(
        'CIAM_E01_01_001',
        'Transaction is not a push transaction'
      ));
      return;
    }

    // V3: Check transaction status - return MFA_PENDING for polling
    if (transaction.status === 'PENDING') {
      const response: MFAPendingResponse = {
        response_type_code: 'MFA_PENDING',
        transaction_id: transaction_id,
        message: 'Awaiting mobile device approval',
        expires_at: transaction.expiresAt.toISOString(),
        retry_after: 1000
      };

      logAuthEvent('mfa_pending', transaction.userId, {
        transactionId: transaction_id,
        method: 'push',
        ip: req.ip
      });

      res.status(200).json(response);
      return;
    }

    if (transaction.status === 'REJECTED') {
      logAuthEvent('mfa_failure', transaction.userId, {
        reason: 'push_rejected',
        transactionId: transaction_id,
        ip: req.ip
      });

      sendErrorResponse(res, 400, createApiError(
        'CIAM_E01_01_001',
        'Push notification was rejected'
      ));
      return;
    }

    if (transaction.status === 'EXPIRED') {
      logAuthEvent('mfa_failure', transaction.userId, {
        reason: 'transaction_expired',
        transactionId: transaction_id,
        ip: req.ip
      });

      sendErrorResponse(res, 410, createApiError(
        'CIAM_E01_01_001',
        'Transaction has expired or been rejected'
      ));
      return;
    }

    // Transaction must be APPROVED to reach here
    if (transaction.status !== 'APPROVED') {
      sendErrorResponse(res, 400, createApiError(
        'CIAM_E01_01_001',
        'Invalid transaction status'
      ));
      return;
    }

    // MFA verification successful - get user information
    const user = await getUserById(transaction.userId);
    if (!user) {
      handleInternalError(res, new Error('User not found after successful MFA'));
      return;
    }

    // TRANSACTION: Atomic session/token creation and audit logging
    const result = await withTransaction(async (trx) => {
      // Step 1: Mark auth context as complete
      await repositories.authContext.update(context_id, {
        cupid: user.cupid,
        updated_at: new Date(),
      }, trx);

      // Step 2: Create session
      const sessionId = transaction.sessionId || `sess-${Date.now()}`;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

      await repositories.session.create({
        session_id: sessionId,
        cupid: user.cupid,
        context_id: context_id,
        device_id: `device-${Date.now()}`,
        created_at: now,
        last_seen_at: now,
        expires_at: expiresAt,
        ip_address: req.ip || null,
        user_agent: req.get('User-Agent') || null,
        status: 'ACTIVE',
      }, trx);

      // Step 3: Create all tokens (ACCESS, REFRESH, ID) atomically
      const tokens = await createSessionTokens(
        sessionId,
        user.cupid,  // cupid for JWT payload
        user.roles,
        {
          preferred_username: user.cupid,
          email: user.email,
          email_verified: true,
          given_name: user.given_name,
          family_name: user.family_name
        },
        trx
      );

      // Step 4: Log audit events
      await repositories.auditLog.create({
        audit_id: uuidv4(),
        category: 'MFA',
        action: 'MFA_SUCCESS',
        cupid: user.cupid,
        context_id: context_id,
        ip_address: req.ip || null,
        user_agent: req.get('User-Agent') || null,
        details: {
          event_type: 'MFA_VERIFY_SUCCESS',
          severity: 'INFO',
          session_id: sessionId,
          method: 'push',
          attempt: 1
        },
        created_at: new Date(),
      }, trx);

      await repositories.auditLog.create({
        audit_id: uuidv4(),
        category: 'AUTH',
        action: 'LOGIN_SUCCESS',
        cupid: user.cupid,
        context_id: context_id,
        ip_address: req.ip || null,
        user_agent: req.get('User-Agent') || null,
        details: {
          event_type: 'LOGIN_SUCCESS',
          severity: 'INFO',
          session_id: sessionId
        },
        created_at: new Date(),
      }, trx);

      return {
        sessionId,
        tokens,
      };
    });

    logAuthEvent('mfa_success', user.cupid, {
      transactionId: transaction_id,
      sessionId: result.sessionId,
      method: 'push',
      ip: req.ip
    });

    // Set refresh token cookie
    res.cookie('refresh_token', result.tokens.refreshToken, getRefreshTokenCookieOptions());

    const response: MFAVerifySuccessResponse = {
      response_type_code: 'SUCCESS',
      access_token: result.tokens.accessToken,
      id_token: result.tokens.idToken,
      token_type: 'Bearer',
      expires_in: result.tokens.expiresIn,
      transaction_id: transaction_id
    };

    res.json(response);
  } catch (error) {
    logAuthEvent('mfa_verify_push_failure', undefined, {
      contextId: req.body.context_id,
      transactionId: req.params.transaction_id,
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip
    });

    handleInternalError(res, error instanceof Error ? error : new Error('MFA push verification failed'));
  }
};

/**
 * Approve push notification (mobile device endpoint)
 * POST /mfa/transaction/:transaction_id/approve
 */
export const approvePushNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    const { transaction_id } = req.params;
    const { selected_number }: MFAApproveRequest = req.body;

    if (!selected_number) {
      sendErrorResponse(res, 400, createApiError(
        'CIAM_E01_01_001',
        'selected_number is required'
      ));
      return;
    }

    logAuthEvent('push_approve_attempt', undefined, {
      transactionId: transaction_id,
      selectedNumber: selected_number,
      ip: req.ip
    });

    const result = await approvePushWithNumber(transaction_id, selected_number);

    if (!result.success) {
      logAuthEvent('push_approve_failure', undefined, {
        transactionId: transaction_id,
        error: result.error,
        ip: req.ip
      });

      if (result.error === 'Transaction not found') {
        sendErrorResponse(res, 404, createApiError(
          'CIAM_E01_01_001',
          'Transaction not found'
        ));
      } else if (result.error === 'Transaction has expired') {
        sendErrorResponse(res, 410, createApiError(
          'CIAM_E01_01_001',
          'Transaction has expired'
        ));
      } else {
        sendErrorResponse(res, 400, createApiError(
          'CIAM_E01_01_001',
          result.error || 'Push approval failed'
        ));
      }
      return;
    }

    logAuthEvent('push_approved', result.transaction?.userId, {
      transactionId: transaction_id,
      ip: req.ip
    });

    const response: MFAApproveResponse = {
      success: true,
      transaction_id: transaction_id
    };

    res.json(response);
  } catch (error) {
    logAuthEvent('push_approve_failure', undefined, {
      transactionId: req.params.transaction_id,
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip
    });

    handleInternalError(res, error instanceof Error ? error : new Error('Push approval failed'));
  }
};

/**
 * Get OTP for testing purposes (mock endpoint)
 * GET /mfa/transaction/:transaction_id/otp
 */
export const getOTPForTestEndpoint = async (req: Request, res: Response): Promise<void> => {
  try {
    const { transaction_id } = req.params;

    // Only allow in development/test environments
    if (process.env.NODE_ENV === 'production') {
      sendErrorResponse(res, 404, createApiError(
        'CIAM_E01_01_001',
        'Endpoint not available in production'
      ));
      return;
    }

    const otp = await getOTPForTesting(transaction_id);

    if (!otp) {
      sendErrorResponse(res, 404, createApiError(
        'CIAM_E01_01_001',
        'Transaction not found or not an OTP transaction'
      ));
      return;
    }

    const response: OTPResponse = {
      otp,
      message: 'OTP retrieved successfully (test environment only).'
    };

    res.json(response);
  } catch (error) {
    handleInternalError(res, error instanceof Error ? error : new Error('Failed to get OTP'));
  }
};
