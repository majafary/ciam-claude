/**
 * Auth Controller (New - Service-based)
 * HTTP layer for authentication operations
 * Business logic delegated to authService
 */

import { Request, Response } from 'express';
import { authService } from '../services/authService';
import { esignServiceNew } from '../services/esignServiceNew';

/**
 * User login endpoint
 * POST /auth/login
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password, drs_action_token, app_id, app_version } = req.body;

    // Delegate to service
    const result = await authService.login({
      username,
      password,
      drs_action_token,
      app_id,
      app_version
    });

    // Handle service response
    if (!result.success) {
      const statusCode = result.error_code === 'CIAM_E01_01_002' ? 423 :
                        result.error_code === 'CIAM_E01_01_005' ? 423 :
                        result.error_code === 'CIAM_E01_01_001' ? 401 : 400;

      res.status(statusCode).json({
        error_code: result.error_code,
        context_id: result.context_id
      });
      return;
    }

    // Handle different response types
    switch (result.responseTypeCode) {
      case 'SUCCESS':
        // Set refresh token cookie if present
        if ((result as any).refresh_token) {
          res.cookie('refresh_token', (result as any).refresh_token, {
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
        break;

      case 'MFA_REQUIRED':
        res.status(200).json({
          response_type_code: 'MFA_REQUIRED',
          otp_methods: result.otp_methods,
          mobile_approve_status: result.mobile_approve_status,
          context_id: result.context_id,
          transaction_id: result.transaction_id
        });
        break;

      case 'ESIGN_REQUIRED':
        res.status(200).json({
          response_type_code: 'ESIGN_REQUIRED',
          context_id: result.context_id,
          transaction_id: result.transaction_id,
          esign_document_id: result.esign_document_id,
          esign_url: result.esign_url,
          is_mandatory: result.is_mandatory
        });
        break;

      default:
        res.status(503).json({
          error_code: 'CIAM_E05_00_001',
          context_id: result.context_id
        });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error_code: 'INTERNAL_ERROR',
      message: 'An internal error occurred'
    });
  }
};

/**
 * Logout endpoint
 * POST /auth/logout
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    res.clearCookie('refresh_token');
    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error_code: 'INTERNAL_ERROR',
      message: 'An internal error occurred'
    });
  }
};

/**
 * Token refresh endpoint
 * POST /auth/refresh
 */
export const refresh = async (req: Request, res: Response): Promise<void> => {
  try {
    const refreshToken = req.cookies?.refresh_token;
    const context_id = 'refresh-' + Date.now();

    if (!refreshToken) {
      res.status(401).json({
        error_code: 'CIAM_E01_02_001',
        context_id
      });
      return;
    }

    // For now, just return error - full implementation would verify token
    res.status(401).json({
      error_code: 'CIAM_E01_02_002',
      context_id
    });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({
      error_code: 'INTERNAL_ERROR',
      message: 'An internal error occurred'
    });
  }
};

/**
 * Get eSign document
 * GET /auth/esign/documents/:documentId
 */
export const getESignDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const { documentId } = req.params;
    const context_id = 'esign-get-' + Date.now();

    const document = await esignServiceNew.getDocument(documentId);

    if (!document) {
      res.status(404).json({
        error_code: 'DOCUMENT_NOT_FOUND',
        context_id
      });
      return;
    }

    res.json(document);
  } catch (error) {
    console.error('Get eSign document error:', error);
    res.status(500).json({
      error_code: 'INTERNAL_ERROR',
      message: 'An internal error occurred'
    });
  }
};

/**
 * Accept eSign document
 * POST /auth/esign/accept
 */
export const acceptESign = async (req: Request, res: Response): Promise<void> => {
  try {
    const { transaction_id, document_id, acceptance_ip, acceptance_timestamp, context_id, drs_action_token } = req.body;

    if (!transaction_id || !document_id) {
      res.status(400).json({
        error_code: 'MISSING_REQUIRED_FIELDS',
        context_id: context_id || ''
      });
      return;
    }

    // Delegate to service
    const result = await esignServiceNew.acceptDocument({
      transaction_id,
      document_id,
      acceptance_ip: acceptance_ip || req.ip,
      acceptance_timestamp,
      context_id,
      drs_action_token
    });

    if (!result.success) {
      res.status(400).json({
        error_code: result.error_code,
        context_id: result.context_id
      });
      return;
    }

    // Handle different response types
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
    console.error('Accept eSign error:', error);
    res.status(500).json({
      error_code: 'INTERNAL_ERROR',
      message: 'An internal error occurred'
    });
  }
};

/**
 * JWKS endpoint
 * GET /.well-known/jwks.json
 */
export const jwks = async (req: Request, res: Response): Promise<void> => {
  try {
    // Import JWKS generator
    const { generateJWKS } = await import('../utils/jwt');

    res.set({
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': 'application/json'
    });

    res.json(generateJWKS());
  } catch (error) {
    console.error('JWKS error:', error);
    res.status(500).json({
      error_code: 'INTERNAL_ERROR',
      message: 'An internal error occurred'
    });
  }
};
