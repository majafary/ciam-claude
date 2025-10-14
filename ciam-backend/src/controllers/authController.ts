import { v4 as uuidv4 } from 'uuid';
import { Request, Response } from 'express';
import { validateCredentials, getUserById } from '../services/userService';
import { createSession, revokeSession } from '../services/sessionService';
import { createSessionTokens, validateRefreshToken, rotateRefreshToken, revokeByCupid, revokeSessionTokens } from '../services/tokenService';
import { generateAccessToken, generateIdToken, getRefreshTokenCookieOptions, verifyAccessToken, decodeToken } from '../utils/jwt';
import { handleAuthError, handleInternalError, sendErrorResponse, createApiError } from '../utils/errors';
import { logAuthEvent, logSecurityEvent } from '../utils/logger';
import { LoginRequest, LoginSuccessResponse, MFARequiredResponse, ESignRequiredResponse, AuthenticatedRequest, IntrospectionResponse, ESignAcceptanceRequest, ESignAcceptResponse } from '../types';
import { getESignDocumentById, needsESign, recordESignAcceptance } from '../services/esignService';
import { getMFATransaction } from '../services/mfaService';
import { isDeviceTrusted } from './deviceController';
import { withTransaction } from '../database/transactions';
import { repositories } from '../repositories';

/**
 * User login endpoint
 * POST /auth/login
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password, app_id, app_version, drs_action_token }: LoginRequest = req.body;

    logAuthEvent('login_attempt', undefined, {
      username,
      appId: app_id,
      appVersion: app_version,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      hasDrsToken: !!drs_action_token
    });

    // Validate credentials and get user scenario
    const scenario = await validateCredentials(username, password);

    switch (scenario.type) {
      case 'ACCOUNT_LOCKED':
        logAuthEvent('login_failure', scenario.user?.cupid, {
          username,
          reason: 'account_locked',
          ip: req.ip
        });

        logSecurityEvent('account_locked_login_attempt', {
          username,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        }, 'medium');

        sendErrorResponse(res, 423, createApiError(
          'CIAM_E01_01_002',
          'Account has been locked. Please contact support.'
        ));
        return;

      case 'INVALID_CREDENTIALS':
        logAuthEvent('login_failure', undefined, {
          username,
          reason: 'invalid_credentials',
          ip: req.ip
        });

        logSecurityEvent('invalid_credentials_attempt', {
          username,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        }, 'low');

        sendErrorResponse(res, 401, createApiError(
          'CIAM_E01_01_001',
          'Invalid credentials'
        ));
        return;

      case 'SUCCESS':
      case 'MFA_LOCKED':
        if (!scenario.user) {
          handleInternalError(res, new Error('User data missing for successful login'));
          return;
        }

        // Create session
        const session = await createSession(
          scenario.user.cupid,
          req.ip,
          req.get('User-Agent')
        );

        const transactionId = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Check device trust status
        const deviceBound = await isDeviceTrusted(scenario.user.cupid, drs_action_token || '');

        // If device is trusted, skip MFA
        if (deviceBound) {
          // Check if eSign is required
          const esignCheck = await needsESign(scenario.user.cupid);

          if (esignCheck.required && esignCheck.documentId) {
            // Return eSign required response
            const esignResponse: ESignRequiredResponse = {
              responseTypeCode: 'ESIGN_REQUIRED',
              context_id: session.sessionId,
              transaction_id: transactionId,
              esign_document_id: esignCheck.documentId,
              esign_url: `/auth/esign/documents/${esignCheck.documentId}`,
              is_mandatory: esignCheck.isMandatory || false
            };

            logAuthEvent('login_esign_required', scenario.user.cupid, {
              username,
              sessionId: session.sessionId,
              transactionId,
              documentId: esignCheck.documentId,
              ip: req.ip
            });

            res.status(200).json(esignResponse);
            return;
          }

          // Generate all tokens atomically
          const tokens = await createSessionTokens(
            session.sessionId,
            scenario.user.cupid,
            scenario.user.roles,
            {
              preferred_username: scenario.user.cupid,
              email: scenario.user.email,
              email_verified: true,
              given_name: scenario.user.given_name,
              family_name: scenario.user.family_name
            }
          );

          logAuthEvent('login_success', scenario.user.cupid, {
            username,
            sessionId: session.sessionId,
            deviceTrusted: true,
            ip: req.ip
          });

          // Set refresh token cookie
          res.cookie('refresh_token', tokens.refreshToken, getRefreshTokenCookieOptions());

          const successResponse: LoginSuccessResponse = {
            responseTypeCode: 'SUCCESS',
            access_token: tokens.accessToken,
            id_token: tokens.idToken,
            token_type: 'Bearer',
            expires_in: tokens.expiresIn,
            context_id: session.sessionId,
            device_bound: true
          };

          res.status(200).json(successResponse);
          return;
        }

        // MFA required - build MFA response
        logAuthEvent('login_mfa_required', scenario.user.cupid, {
          username,
          sessionId: session.sessionId,
          transactionId,
          ip: req.ip
        });

        // Mock MFA methods - in production, fetch from user profile
        const mfaResponse: MFARequiredResponse = {
          responseTypeCode: 'MFA_REQUIRED',
          otp_methods: [
            { value: '1234', mfa_option_id: 1 },
            { value: '5678', mfa_option_id: 2 }
          ],
          mobile_approve_status: 'ENABLED',
          context_id: session.sessionId,
          transaction_id: transactionId
        };

        // Store user ID and scenario type for MFA controller
        (req.session as any) = {
          userId: scenario.user.cupid,
          sessionId: session.sessionId,
          scenario: scenario.type
        };

        res.status(200).json(mfaResponse);
        return;

      default:
        handleInternalError(res, new Error(`Unknown login scenario: ${scenario.type}`));
        return;
    }
  } catch (error) {
    logAuthEvent('login_failure', undefined, {
      username: req.body.username,
      reason: 'internal_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip
    });

    handleInternalError(res, error instanceof Error ? error : new Error('Login failed'));
  }
};

/**
 * Get eSign document
 * GET /auth/esign/documents/:document_id
 */
export const getESignDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const { document_id } = req.params;

    const document = await getESignDocumentById(document_id);

    if (!document) {
      sendErrorResponse(res, 404, createApiError(
        'CIAM_E01_01_001',
        'Document not found'
      ));
      return;
    }

    res.json({
      document_id: document.documentId,
      title: document.title,
      content: document.content,
      version: document.version,
      mandatory: document.mandatory
    });
  } catch (error) {
    handleInternalError(res, error instanceof Error ? error : new Error('Failed to get eSign document'));
  }
};

/**
 * Accept eSign document
 * POST /auth/esign/accept
 */
export const acceptESign = async (req: Request, res: Response): Promise<void> => {
  try {
    const { context_id, transaction_id, document_id, acceptance_ip, acceptance_timestamp }: ESignAcceptanceRequest = req.body;

    // V3: Validate context_id
    if (!context_id) {
      sendErrorResponse(res, 400, createApiError(
        'CIAM_E04_00_010',
        'context_id is required'
      ));
      return;
    }

    if (!transaction_id || !document_id) {
      sendErrorResponse(res, 400, createApiError(
        'CIAM_E01_01_001',
        'transaction_id and document_id are required'
      ));
      return;
    }

    logAuthEvent('esign_accept_attempt', undefined, {
      transactionId: transaction_id,
      documentId: document_id,
      ip: req.ip
    });

    // Get transaction to retrieve user info
    const transaction = await getMFATransaction(transaction_id);

    if (!transaction) {
      sendErrorResponse(res, 400, createApiError(
        'CIAM_E01_01_001',
        'Invalid transaction or no pending eSign'
      ));
      return;
    }

    const userId = transaction.userId;
    const user = await getUserById(userId);

    if (!user) {
      handleInternalError(res, new Error('User not found'));
      return;
    }

    // Record acceptance
    const acceptance = await recordESignAcceptance(
      userId,
      document_id,
      context_id,
      acceptance_ip || req.ip,
      acceptance_timestamp
    );

    // Generate all tokens atomically
    const sessionId = transaction.sessionId || `sess-${Date.now()}`;
    const tokens = await createSessionTokens(
      sessionId,
      userId,
      user.roles,
      {
        preferred_username: user.cupid,
        email: user.email,
        email_verified: true,
        given_name: user.given_name,
        family_name: user.family_name
      }
    );

    // Check device trust
    const deviceBound = await isDeviceTrusted(userId, transaction_id);

    logAuthEvent('esign_accepted', userId, {
      transactionId: transaction_id,
      documentId: document_id,
      sessionId,
      ip: req.ip
    });

    // Set refresh token cookie
    res.cookie('refresh_token', tokens.refreshToken, getRefreshTokenCookieOptions());

    const response: ESignAcceptResponse = {
      responseTypeCode: 'SUCCESS',
      access_token: tokens.accessToken,
      id_token: tokens.idToken,
      token_type: 'Bearer',
      expires_in: tokens.expiresIn,
      context_id: context_id,
      transaction_id: transaction_id,
      esign_accepted: true,
      esign_accepted_at: acceptance.acceptedAt.toISOString()
    };

    res.json(response);
  } catch (error) {
    logAuthEvent('esign_accept_failure', undefined, {
      transactionId: req.body.transaction_id,
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip
    });

    handleInternalError(res, error instanceof Error ? error : new Error('eSign acceptance failed'));
  }
};

/**
 * User logout endpoint
 * POST /auth/logout
 *
 * Transaction Management: Wraps session revocation, token revocation, and audit logging
 * in a single transaction to ensure atomicity per Scenario 7
 */
export const logout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.sub;
    const sessionId = req.sessionId;

    logAuthEvent('logout', userId, {
      sessionId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    if (sessionId) {
      // TRANSACTION: Atomic session revocation, all tokens revocation (ACCESS, REFRESH, ID), and audit logging
      await withTransaction(async (trx) => {
        // Revoke session within transaction
        await repositories.session.logout(sessionId, trx);

        // Revoke all tokens for this session within transaction (ACCESS, REFRESH, ID)
        await repositories.token.revokeAllForSession(sessionId, trx);

        // Log audit event within transaction
        await repositories.auditLog.create({
        audit_id: uuidv4(),
          category: 'SESSION',
          action: 'TOKEN_REVOKED',
          cupid: req.user?.sub || null,
          context_id: null,
          ip_address: req.ip || null,
          user_agent: req.get('User-Agent') || null,
          details: {
            event_type: 'SESSION_REVOKED',
            severity: 'INFO',
            session_id: sessionId,
            reason: 'user_logout'
          },
          created_at: new Date(),
        }, trx);
      });
    }

    // Clear refresh token cookie
    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });

    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    logAuthEvent('logout_failure', req.user?.sub, {
      sessionId: req.sessionId,
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip
    });

    handleInternalError(res, error instanceof Error ? error : new Error('Logout failed'));
  }
};

/**
 * Token refresh endpoint
 * POST /auth/refresh
 *
 * Transaction Management: Wraps token rotation, session update, and audit logging
 * in a single transaction to ensure atomicity per Scenario 6
 */
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const refreshTokenFromCookie = req.cookies?.refresh_token;
    const refreshTokenFromBody = req.body?.refresh_token;
    const refreshToken = refreshTokenFromCookie || refreshTokenFromBody;

    if (!refreshToken) {
      logAuthEvent('token_refresh_failure', undefined, {
        reason: 'missing_refresh_token',
        ip: req.ip
      });

      sendErrorResponse(res, 401, createApiError(
        'CIAM_E01_02_001',
        'Refresh token required'
      ));
      return;
    }

    logAuthEvent('token_refresh', undefined, {
      source: refreshTokenFromCookie ? 'cookie' : 'body',
      ip: req.ip
    });

    // Validate refresh token (read-only operation, outside transaction)
    const validation = await validateRefreshToken(refreshToken);

    if (!validation.valid || !validation.sessionId) {
      logAuthEvent('token_refresh_failure', undefined, {
        reason: validation.error,
        ip: req.ip
      });

      logSecurityEvent('invalid_refresh_token', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        error: validation.error
      }, 'medium');

      sendErrorResponse(res, 401, createApiError(
        'CIAM_E01_02_002',
        validation.error || 'Invalid or expired refresh token'
      ));
      return;
    }

    const sessionId = validation.sessionId;

    // Get session to obtain cupid (read-only operation, outside transaction)
    const session = await repositories.session.findById(sessionId);
    if (!session || session.status !== 'ACTIVE') {
      logAuthEvent('token_refresh_failure', undefined, {
        reason: 'session_invalid',
        sessionId,
        ip: req.ip
      });

      sendErrorResponse(res, 401, createApiError(
        'CIAM_E01_02_002',
        'Session invalid or expired'
      ));
      return;
    }

    const cupid = session.cupid;

    // Get user information (read-only operation, outside transaction)
    const user = await getUserById(cupid);
    if (!user) {
      logAuthEvent('token_refresh_failure', cupid, {
        reason: 'user_not_found',
        ip: req.ip
      });

      sendErrorResponse(res, 401, createApiError(
        'CIAM_E01_02_002',
        'User not found'
      ));
      return;
    }

    // Check if user account is locked
    if (user.isLocked) {
      logAuthEvent('token_refresh_failure', cupid, {
        reason: 'account_locked',
        ip: req.ip
      });

      await revokeByCupid(cupid);

      sendErrorResponse(res, 401, createApiError(
        'CIAM_E01_01_002',
        'Account has been locked'
      ));
      return;
    }

    // TRANSACTION: Atomic token rotation (all 3 tokens), session update, and audit logging
    const result = await withTransaction(async (trx) => {
      // Rotate refresh token and generate new ACCESS/ID tokens
      const rotation = await rotateRefreshToken(
        refreshToken,
        sessionId,
        cupid,           // cupid used ONLY for JWT payload
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

      if (!rotation.success || !rotation.newRefreshToken) {
        throw new Error(rotation.error || 'Token refresh failed');
      }

      // Update session activity within transaction
      await repositories.session.updateLastSeen(sessionId, trx);

      // Log audit event within transaction
      await repositories.auditLog.create({
        audit_id: uuidv4(),
        category: 'AUTH',
        action: 'TOKEN_REFRESHED',
        cupid: cupid,
        context_id: null,
        ip_address: req.ip || null,
        user_agent: req.get('User-Agent') || null,
        details: {
          event_type: 'TOKEN_REFRESHED',
          severity: 'INFO',
          session_id: sessionId,
          token_rotation: true,
          all_tokens_refreshed: true
        },
        created_at: new Date(),
      }, trx);

      return rotation;
    });

    logAuthEvent('token_refresh_success', cupid, {
      sessionId,
      ip: req.ip
    });

    // Set new refresh token cookie
    res.cookie('refresh_token', result.newRefreshToken!, getRefreshTokenCookieOptions());

    res.json({
      success: true,
      access_token: result.newAccessToken!,
      id_token: result.newIdToken!,
      token_type: 'Bearer',
      expires_in: 900
    });
  } catch (error) {
    logAuthEvent('token_refresh_failure', undefined, {
      reason: 'internal_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip
    });

    handleInternalError(res, error instanceof Error ? error : new Error('Token refresh failed'));
  }
};

/**
 * Token revocation endpoint (OAuth2 RFC7009)
 * POST /revoke
 */
export const revokeToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, token_type_hint } = req.body;

    if (!token) {
      sendErrorResponse(res, 400, createApiError(
        'BAD_REQUEST',
        'Token parameter is required'
      ));
      return;
    }

    // Try to revoke token by hash
    const tokenHash = require('crypto').createHash('sha256').update(token).digest('hex');
    const tokenRecord = await repositories.token.revokeByHash(tokenHash);

    if (tokenRecord) {
      logAuthEvent('token_revoked', undefined, {
        tokenType: token_type_hint || 'refresh_token',
        ip: req.ip
      });
    }

    // OAuth2 revocation is idempotent - always return success
    res.json({
      message: 'Token revoked.'
    });
  } catch (error) {
    handleInternalError(res, error instanceof Error ? error : new Error('Token revocation failed'));
  }
};

/**
 * Token introspection endpoint (OAuth2 RFC7662)
 * POST /introspect
 */
export const introspectToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, token_type_hint } = req.body;

    if (!token) {
      sendErrorResponse(res, 400, createApiError(
        'BAD_REQUEST',
        'Token parameter is required'
      ));
      return;
    }

    let introspectionResponse: IntrospectionResponse = {
      active: false
    };

    // Try access token first
    if (!token_type_hint || token_type_hint === 'access_token') {
      const decoded = verifyAccessToken(token);
      if (decoded) {
        const user = await getUserById(decoded.sub);
        if (user && !user.isLocked) {
          introspectionResponse = {
            active: true,
            scope: 'openid profile email',
            client_id: 'ciam-client',
            username: user.cupid,
            token_type: 'Bearer',
            exp: decoded.exp,
            iat: decoded.iat,
            sub: decoded.sub,
            aud: decoded.aud,
            iss: decoded.iss,
            jti: decoded.jti
          };
        }
      }
    }

    // Try refresh token if access token check failed
    if (!introspectionResponse.active && (!token_type_hint || token_type_hint === 'refresh_token')) {
      const tokenHash = require('crypto').createHash('sha256').update(token).digest('hex');
      const tokenRecord = await repositories.token.findByHash(tokenHash);

      if (tokenRecord && tokenRecord.status === 'ACTIVE' && tokenRecord.expires_at > new Date()) {
        const session = await repositories.session.findById(tokenRecord.session_id);
        if (session) {
          const user = await getUserById(session.cupid);
          if (user && !user.isLocked) {
            introspectionResponse = {
              active: true,
              token_type: 'refresh_token',
              sub: session.cupid,
              exp: Math.floor(tokenRecord.expires_at.getTime() / 1000),
              iat: Math.floor(tokenRecord.created_at.getTime() / 1000),
              username: user.cupid
            };
          }
        }
      }
    }

    res.json(introspectionResponse);
  } catch (error) {
    handleInternalError(res, error instanceof Error ? error : new Error('Token introspection failed'));
  }
};
