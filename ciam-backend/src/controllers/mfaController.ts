import { Request, Response } from 'express';
import { createMFATransaction, getMFATransaction, verifyOTP, verifyPushResult, getOTPForTesting } from '../services/mfaService';
import { getUserById } from '../services/userService';
import { createRefreshToken } from '../services/tokenService';
import { generateAccessToken, generateIdToken, getRefreshTokenCookieOptions } from '../utils/jwt';
import { handleMFAError, handleAuthError, handleInternalError, sendErrorResponse, createApiError } from '../utils/errors';
import { logAuthEvent } from '../utils/logger';
import { MFAChallengeRequest, MFAChallengeResponse, MFAVerifyRequest, MFAVerifyResponse, MFATransactionStatusResponse, OTPResponse } from '../types';

/**
 * Initiate MFA challenge
 * POST /mfa/challenge
 */
export const initiateChallenge = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, method, sessionId, transactionId: existingTransactionId }: MFAChallengeRequest = req.body;

    // TODO: Replace with proper user identification
    let userId: string;
    if (username === 'testuser') {
      userId = 'user-123';
    } else if (username === 'mfalockeduser') {
      userId = 'user-mfa-locked';
    } else {
      handleAuthError(res, 'invalid_credentials');
      return;
    }

    logAuthEvent('mfa_challenge', userId, {
      method,
      sessionId,
      existingTransactionId,
      ip: req.ip
    });

    // Check if user is MFA locked
    const user = await getUserById(userId);
    if (user?.mfaLocked) {
      logAuthEvent('mfa_failure', userId, {
        reason: 'mfa_locked',
        method,
        ip: req.ip
      });

      handleAuthError(res, 'mfa_locked');
      return;
    }

    // Create MFA transaction
    const transaction = await createMFATransaction(userId, method, sessionId);

    logAuthEvent('mfa_challenge_created', userId, {
      transactionId: transaction.transactionId,
      method,
      sessionId,
      ip: req.ip
    });

    const response: MFAChallengeResponse = {
      transactionId: transaction.transactionId,
      challengeStatus: transaction.status,
      expiresAt: transaction.expiresAt.toISOString(),
      message: method === 'otp'
        ? 'OTP has been sent. Please enter the code to continue.'
        : 'Push notification has been sent. Please approve on your device.'
    };

    if (transaction.challengeId) {
      response.challengeId = transaction.challengeId;
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
 * POST /mfa/verify
 */
export const verifyChallenge = async (req: Request, res: Response): Promise<void> => {
  try {
    const { transactionId, otp, pushResult }: MFAVerifyRequest = req.body;

    logAuthEvent('mfa_verify', undefined, {
      transactionId,
      hasOtp: !!otp,
      pushResult,
      ip: req.ip
    });

    // Get MFA transaction
    const transaction = await getMFATransaction(transactionId);

    if (!transaction) {
      logAuthEvent('mfa_failure', undefined, {
        reason: 'transaction_not_found',
        transactionId,
        ip: req.ip
      });

      handleMFAError(res, 'transaction_not_found', { transactionId });
      return;
    }

    if (transaction.status !== 'PENDING') {
      logAuthEvent('mfa_failure', transaction.userId, {
        reason: 'transaction_not_pending',
        transactionId,
        status: transaction.status,
        ip: req.ip
      });

      handleMFAError(res, 'transaction_expired', {
        transactionId,
        status: transaction.status
      });
      return;
    }

    // Check if transaction is for mfa locked user
    if (transactionId.includes('mfalocked') || transaction.userId === 'user-mfa-locked') {
      logAuthEvent('mfa_failure', transaction.userId, {
        reason: 'mfa_locked',
        transactionId,
        ip: req.ip
      });

      handleAuthError(res, 'mfa_locked');
      return;
    }

    let verificationResult;

    // Verify based on method
    if (transaction.method === 'otp' && otp) {
      verificationResult = await verifyOTP(transactionId, otp);
    } else if (transaction.method === 'push' && pushResult) {
      verificationResult = await verifyPushResult(transactionId, pushResult);
    } else {
      // For push without explicit result, check transaction status
      if (transaction.method === 'push') {
        const updatedTransaction = await getMFATransaction(transactionId);
        if (updatedTransaction?.status === 'APPROVED') {
          verificationResult = { success: true, transaction: updatedTransaction };
        } else if (updatedTransaction?.status === 'REJECTED') {
          verificationResult = { success: false, transaction: updatedTransaction, error: 'Push rejected' };
        } else {
          verificationResult = { success: false, transaction, error: 'Push result not available yet' };
        }
      } else {
        sendErrorResponse(res, 400, createApiError(
          'BAD_REQUEST',
          'OTP is required for OTP method'
        ));
        return;
      }
    }

    if (!verificationResult.success || !verificationResult.transaction) {
      logAuthEvent('mfa_failure', transaction.userId, {
        reason: verificationResult.error || 'verification_failed',
        transactionId,
        method: transaction.method,
        ip: req.ip
      });

      if (verificationResult.error === 'Invalid OTP') {
        handleMFAError(res, 'invalid_otp', { transactionId });
      } else if (verificationResult.error === 'Push rejected') {
        handleMFAError(res, 'challenge_rejected', { transactionId });
      } else {
        handleMFAError(res, 'transaction_expired', {
          transactionId,
          error: verificationResult.error
        });
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

    logAuthEvent('mfa_success', user.id, {
      transactionId,
      sessionId,
      method: transaction.method,
      ip: req.ip
    });

    // Set refresh token cookie
    res.cookie('refresh_token', refreshToken.token, getRefreshTokenCookieOptions());

    const response: MFAVerifyResponse = {
      id_token: idToken,
      access_token: accessToken,
      sessionId,
      transactionId,
      message: 'MFA verified successfully.'
    };

    res.json(response);
  } catch (error) {
    logAuthEvent('mfa_verify_failure', undefined, {
      transactionId: req.body.transactionId,
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip
    });

    handleInternalError(res, error instanceof Error ? error : new Error('MFA verification failed'));
  }
};

/**
 * Get MFA transaction status (for polling)
 * GET /mfa/transaction/:transactionId
 */
export const getTransactionStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { transactionId } = req.params;

    const transaction = await getMFATransaction(transactionId);

    if (!transaction) {
      handleMFAError(res, 'transaction_not_found', { transactionId });
      return;
    }

    const response: MFATransactionStatusResponse = {
      transactionId: transaction.transactionId,
      challengeStatus: transaction.status,
      updatedAt: transaction.updatedAt.toISOString(),
      expiresAt: transaction.expiresAt.toISOString(),
      message: getStatusMessage(transaction.status)
    };

    res.json(response);
  } catch (error) {
    handleInternalError(res, error instanceof Error ? error : new Error('Failed to get transaction status'));
  }
};

/**
 * Get OTP for testing purposes (mock endpoint)
 * GET /mfa/transaction/:transactionId/otp
 */
export const getOTPForTestEndpoint = async (req: Request, res: Response): Promise<void> => {
  try {
    const { transactionId } = req.params;

    // Only allow in development/test environments
    if (process.env.NODE_ENV === 'production') {
      sendErrorResponse(res, 404, createApiError(
        'NOT_FOUND',
        'Endpoint not available in production'
      ));
      return;
    }

    const otp = await getOTPForTesting(transactionId);

    if (!otp) {
      handleMFAError(res, 'transaction_not_found', { transactionId });
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

/**
 * Helper function to get status message
 */
const getStatusMessage = (status: string): string => {
  switch (status) {
    case 'PENDING':
      return 'Waiting for user action';
    case 'APPROVED':
      return 'User approved the request';
    case 'REJECTED':
      return 'User rejected the request';
    case 'EXPIRED':
      return 'Request has expired';
    default:
      return 'Unknown status';
  }
};