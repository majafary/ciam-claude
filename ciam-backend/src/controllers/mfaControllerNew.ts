/**
 * MFA Controller (New - Service-based)
 * HTTP layer for MFA operations
 * Business logic delegated to mfaServiceNew
 */

import { Request, Response } from 'express';
import { mfaServiceNew } from '../services/mfaServiceNew';

/**
 * Initiate MFA challenge (v3 with context_id support)
 * POST /auth/mfa/initiate
 */
export const initiateChallenge = async (req: Request, res: Response): Promise<void> => {
  try {
    const { context_id, transaction_id, method, mfa_option_id } = req.body;

    // V3: Validate context_id
    if (!context_id) {
      res.status(400).json({
        error_code: 'CIAM_E04_00_010',
        message: 'context_id is required'
      });
      return;
    }

    // Validate mfa_option_id for OTP methods (sms/voice)
    const isOTPMethod = method === 'sms' || method === 'voice';
    if (isOTPMethod && !mfa_option_id) {
      res.status(400).json({
        error_code: 'CIAM_E01_01_001',
        message: 'mfa_option_id is required when method is sms or voice'
      });
      return;
    }

    // Delegate to service
    const result = await mfaServiceNew.initiateChallenge({
      method,
      transaction_id,
      mfa_option_id,
      context_id
    });

    if (!result.success) {
      res.status(400).json({
        error_code: result.error_code,
        context_id
      });
      return;
    }

    // Return success response
    const response: any = {
      success: true,
      transaction_id: result.transaction_id,
      expires_at: result.expires_at
    };

    if (result.display_number) {
      response.display_number = result.display_number;
    }

    res.json(response);
  } catch (error) {
    console.error('MFA initiate error:', error);
    res.status(500).json({
      error_code: 'INTERNAL_ERROR',
      message: 'An internal error occurred'
    });
  }
};

/**
 * Verify MFA OTP challenge (v3 - OTP specific)
 * POST /auth/mfa/otp/verify
 */
export const verifyOTPChallenge = async (req: Request, res: Response): Promise<void> => {
  try {
    const { context_id, transaction_id, code } = req.body;

    // V3: Validate context_id
    if (!context_id) {
      res.status(400).json({
        error_code: 'CIAM_E04_00_010',
        message: 'context_id is required'
      });
      return;
    }

    // Delegate to service
    const result = await mfaServiceNew.verifyOTP({
      transaction_id,
      code,
      context_id
    });

    if (!result.success) {
      res.status(400).json({
        error_code: result.error_code,
        context_id: result.context_id
      });
      return;
    }

    // Handle different response types
    if (result.responseTypeCode === 'ESIGN_REQUIRED') {
      res.status(200).json({
        response_type_code: 'ESIGN_REQUIRED',
        context_id: result.context_id,
        transaction_id: result.transaction_id,
        esign_document_id: result.esign_document_id,
        esign_url: result.esign_url,
        is_mandatory: result.is_mandatory
      });
      return;
    }

    if (result.responseTypeCode === 'DEVICE_BIND_REQUIRED') {
      res.status(200).json({
        response_type_code: 'DEVICE_BIND_REQUIRED',
        context_id: result.context_id,
        transaction_id: result.transaction_id
      });
      return;
    }

    // SUCCESS - set cookie and return tokens
    if (result.refresh_token) {
      res.cookie('refresh_token', result.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: 'strict'
      });
    }

    res.status(201).json({
      response_type_code: 'SUCCESS',
      access_token: result.access_token,
      id_token: result.id_token,
      token_type: result.token_type,
      expires_in: result.expires_in,
      context_id: result.context_id,
      device_bound: result.device_bound
    });
  } catch (error) {
    console.error('MFA OTP verify error:', error);
    res.status(500).json({
      error_code: 'INTERNAL_ERROR',
      message: 'An internal error occurred'
    });
  }
};

/**
 * Verify MFA Push challenge (v3 - Push specific)
 * POST /auth/mfa/transactions/:transaction_id
 */
export const verifyPushChallenge = async (req: Request, res: Response): Promise<void> => {
  try {
    const { transaction_id } = req.params;
    const { context_id } = req.body;

    // V3: Validate context_id
    if (!context_id) {
      res.status(400).json({
        error_code: 'CIAM_E04_00_010',
        message: 'context_id is required'
      });
      return;
    }

    // Delegate to service
    const result = await mfaServiceNew.verifyPush({
      transaction_id,
      context_id
    });

    if (!result.success) {
      const statusCode = result.error_code === 'TRANSACTION_NOT_FOUND' ? 404 :
                        result.error_code === 'TRANSACTION_EXPIRED' ? 410 : 400;

      res.status(statusCode).json({
        error_code: result.error_code,
        context_id: result.context_id
      });
      return;
    }

    // Handle different response types
    if (result.responseTypeCode === 'MFA_PENDING') {
      res.status(200).json({
        response_type_code: 'MFA_PENDING',
        transaction_id: result.transaction_id,
        context_id: result.context_id,
        message: result.message || 'Awaiting mobile device approval',
        expires_at: result.expires_at,
        retry_after: result.retry_after
      });
      return;
    }

    if (result.responseTypeCode === 'ESIGN_REQUIRED') {
      res.status(200).json({
        response_type_code: 'ESIGN_REQUIRED',
        context_id: result.context_id,
        transaction_id: result.transaction_id,
        esign_document_id: result.esign_document_id,
        esign_url: result.esign_url,
        is_mandatory: result.is_mandatory
      });
      return;
    }

    if (result.responseTypeCode === 'DEVICE_BIND_REQUIRED') {
      res.status(200).json({
        response_type_code: 'DEVICE_BIND_REQUIRED',
        context_id: result.context_id,
        transaction_id: result.transaction_id
      });
      return;
    }

    // SUCCESS - set cookie and return tokens
    if (result.refresh_token) {
      res.cookie('refresh_token', result.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: 'strict'
      });
    }

    res.status(201).json({
      response_type_code: 'SUCCESS',
      access_token: result.access_token,
      id_token: result.id_token,
      token_type: result.token_type,
      expires_in: result.expires_in,
      context_id: result.context_id,
      transaction_id: result.transaction_id,
      device_bound: result.device_bound
    });
  } catch (error) {
    console.error('MFA push verify error:', error);
    res.status(500).json({
      error_code: 'INTERNAL_ERROR',
      message: 'An internal error occurred'
    });
  }
};
