import { Request, Response } from 'express';
import { createMFATransaction, getMFATransaction, verifyOTP, verifyPushResult, getOTPForTesting, approvePushWithNumber } from '../services/mfaService';
import { getUserById } from '../services/userService';
import { createRefreshToken } from '../services/tokenService';
import { generateAccessToken, generateIdToken, getRefreshTokenCookieOptions } from '../utils/jwt';
import { handleMFAError, handleAuthError, handleInternalError, sendErrorResponse, createApiError } from '../utils/errors';
import { logAuthEvent } from '../utils/logger';
import { MFAChallengeRequest, MFAChallengeResponse, MFAVerifyRequest, MFAVerifySuccessResponse, MFATransactionStatusResponse, OTPResponse, MFAApproveRequest, MFAApproveResponse } from '../types';
import { isDeviceTrusted } from './deviceController';

/**
 * Initiate MFA challenge
 * POST /auth/mfa/initiate
 */
export const initiateChallenge = async (req: Request, res: Response): Promise<void> => {
  try {
    const { transaction_id, method, mfa_option_id }: MFAChallengeRequest = req.body;

    // Validate mfa_option_id for OTP method
    if (method === 'otp' && !mfa_option_id) {
      sendErrorResponse(res, 400, createApiError(
        'CIAM_E01_01_001',
        'mfa_option_id is required when method is otp'
      ));
      return;
    }

    logAuthEvent('mfa_challenge', undefined, {
      method,
      transactionId: transaction_id,
      mfaOptionId: mfa_option_id,
      ip: req.ip
    });

    // Get the transaction to retrieve user info
    const existingTransaction = await getMFATransaction(transaction_id);

    if (!existingTransaction) {
      sendErrorResponse(res, 404, createApiError(
        'CIAM_E01_01_001',
        'Transaction not found'
      ));
      return;
    }

    const userId = existingTransaction.userId;

    // Check if user is MFA locked
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

    // Create MFA transaction
    const transaction = await createMFATransaction(userId, method, existingTransaction.sessionId, mfa_option_id);

    logAuthEvent('mfa_challenge_created', userId, {
      transactionId: transaction.transactionId,
      method,
      sessionId: existingTransaction.sessionId,
      ip: req.ip
    });

    const response: MFAChallengeResponse = {
      success: true,
      transaction_id: transaction.transactionId,
      challenge_status: transaction.status,
      expires_at: transaction.expiresAt.toISOString()
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
 * Verify MFA challenge
 * POST /auth/mfa/verify
 */
export const verifyChallenge = async (req: Request, res: Response): Promise<void> => {
  try {
    const { transaction_id, method, code }: MFAVerifyRequest = req.body;

    logAuthEvent('mfa_verify', undefined, {
      transactionId: transaction_id,
      method,
      hasCode: !!code,
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

    let verificationResult;

    // Verify based on method
    if (method === 'otp' && code) {
      verificationResult = await verifyOTP(transaction_id, code);
    } else if (method === 'push') {
      // For push, check if transaction is already approved
      const updatedTransaction = await getMFATransaction(transaction_id);
      if (updatedTransaction?.status === 'APPROVED') {
        verificationResult = { success: true, transaction: updatedTransaction };
      } else if (updatedTransaction?.status === 'REJECTED') {
        verificationResult = { success: false, transaction: updatedTransaction, error: 'Push rejected' };
      } else {
        sendErrorResponse(res, 400, createApiError(
          'CIAM_E01_01_001',
          'Push notification not yet approved'
        ));
        return;
      }
    } else {
      sendErrorResponse(res, 400, createApiError(
        'CIAM_E01_01_001',
        method === 'otp' ? 'code is required for OTP method' : 'Invalid method'
      ));
      return;
    }

    if (!verificationResult.success || !verificationResult.transaction) {
      logAuthEvent('mfa_failure', transaction.userId, {
        reason: verificationResult.error || 'verification_failed',
        transactionId: transaction_id,
        method: transaction.method,
        ip: req.ip
      });

      if (verificationResult.error === 'Invalid OTP') {
        sendErrorResponse(res, 400, createApiError(
          'CIAM_E01_01_001',
          'Invalid OTP code'
        ));
      } else if (verificationResult.error === 'Push rejected') {
        sendErrorResponse(res, 400, createApiError(
          'CIAM_E01_01_001',
          'Push notification was rejected'
        ));
      } else {
        sendErrorResponse(res, 400, createApiError(
          'CIAM_E01_01_001',
          verificationResult.error || 'MFA verification failed'
        ));
      }
      return;
    }

    // MFA verification successful - generate tokens
    const user = await getUserById(transaction.userId);
    if (!user) {
      handleInternalError(res, new Error('User not found after successful MFA'));
      return;
    }

    // Generate tokens
    const sessionId = transaction.sessionId || `sess-${Date.now()}`;
    const accessToken = generateAccessToken(user.id, sessionId, user.roles);
    const idToken = generateIdToken(user.id, sessionId, {
      preferred_username: user.username,
      email: user.email,
      email_verified: true,
      given_name: user.given_name,
      family_name: user.family_name
    });

    // Create refresh token
    const refreshToken = await createRefreshToken(user.id, sessionId);

    // Check device trust status
    const deviceBound = await isDeviceTrusted(user.id, transaction_id);

    logAuthEvent('mfa_success', user.id, {
      transactionId: transaction_id,
      sessionId,
      method: transaction.method,
      ip: req.ip
    });

    // Set refresh token cookie
    res.cookie('refresh_token', refreshToken.token, getRefreshTokenCookieOptions());

    const response: MFAVerifySuccessResponse = {
      success: true,
      access_token: accessToken,
      id_token: idToken,
      refresh_token: refreshToken.token,
      token_type: 'Bearer',
      expires_in: 900, // 15 minutes
      session_id: sessionId,
      transaction_id: transaction_id,
      device_bound: deviceBound
    };

    res.json(response);
  } catch (error) {
    logAuthEvent('mfa_verify_failure', undefined, {
      transactionId: req.body.transaction_id,
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip
    });

    handleInternalError(res, error instanceof Error ? error : new Error('MFA verification failed'));
  }
};

/**
 * Get MFA transaction status (for polling)
 * GET /mfa/transaction/:transaction_id
 */
export const getTransactionStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { transaction_id } = req.params;

    const transaction = await getMFATransaction(transaction_id);

    if (!transaction) {
      sendErrorResponse(res, 404, createApiError(
        'CIAM_E01_01_001',
        'Transaction not found'
      ));
      return;
    }

    const response: MFATransactionStatusResponse = {
      transaction_id: transaction.transactionId,
      challenge_status: transaction.status,
      updated_at: transaction.updatedAt.toISOString(),
      expires_at: transaction.expiresAt.toISOString()
    };

    res.json(response);
  } catch (error) {
    handleInternalError(res, error instanceof Error ? error : new Error('Failed to get transaction status'));
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
      transaction_id: transaction_id,
      challenge_status: 'APPROVED'
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
