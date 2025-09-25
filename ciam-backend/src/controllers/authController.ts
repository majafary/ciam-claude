import { Request, Response } from 'express';
import { validateCredentials, getUserById } from '../services/userService';
import { createSession, revokeSession, revokeAllUserSessions } from '../services/sessionService';
import { createRefreshToken, validateRefreshToken, rotateRefreshToken, revokeAllUserRefreshTokens, revokeRefreshToken, getRefreshTokenInfo } from '../services/tokenService';
import { generateAccessToken, generateIdToken, getRefreshTokenCookieOptions, verifyAccessToken, decodeToken } from '../utils/jwt';
import { handleAuthError, handleInternalError, sendErrorResponse, createApiError } from '../utils/errors';
import { logAuthEvent, logSecurityEvent } from '../utils/logger';
import { LoginRequest, LoginResponse, AuthenticatedRequest, IntrospectionResponse } from '../types';

/**
 * User login endpoint
 * POST /login
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password, drs_action_token }: LoginRequest = req.body;

    logAuthEvent('login_attempt', undefined, {
      username,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      hasDrsToken: !!drs_action_token
    });

    // Validate credentials and get user scenario
    const scenario = await validateCredentials(username, password);

    switch (scenario.type) {
      case 'ACCOUNT_LOCKED':
        logAuthEvent('login_failure', scenario.user?.id, {
          username,
          reason: 'account_locked',
          ip: req.ip
        });

        logSecurityEvent('account_locked_login_attempt', {
          username,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        }, 'medium');

        handleAuthError(res, 'account_locked', { username });
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

        handleAuthError(res, 'invalid_credentials', { username });
        return;

      case 'SUCCESS':
      case 'MFA_LOCKED':
        if (!scenario.user) {
          handleInternalError(res, new Error('User data missing for successful login'));
          return;
        }

        // Create session
        const session = await createSession(
          scenario.user.id,
          req.ip,
          req.get('User-Agent')
        );

        logAuthEvent('login_success', scenario.user.id, {
          username,
          sessionId: session.sessionId,
          ip: req.ip
        });

        // For MFA_LOCKED scenario, we still allow login but will fail at MFA step
        const response: LoginResponse = {
          responseTypeCode: 'MFA_REQUIRED',
          message: 'MFA is required for this login.',
          sessionId: session.sessionId,
          transactionId: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          deviceId: session.deviceId
        };

        // Store user ID and scenario type for MFA controller
        (req.session as any) = {
          userId: scenario.user.id,
          sessionId: session.sessionId,
          scenario: scenario.type
        };

        res.json(response);
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
 * User logout endpoint
 * POST /logout
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
      // Revoke session
      await revokeSession(sessionId);

      // Revoke refresh tokens for this session
      const refreshToken = req.cookies?.refresh_token;
      if (refreshToken) {
        const validation = await validateRefreshToken(refreshToken);
        if (validation.valid && validation.refreshToken?.sessionId === sessionId) {
          await rotateRefreshToken(refreshToken, userId || '', sessionId);
        }
      }
    }

    // Clear refresh token cookie
    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });

    res.json({
      message: 'Logout successful.'
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
 * POST /token/refresh
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

      handleAuthError(res, 'unauthorized', {
        reason: 'Refresh token required'
      });
      return;
    }

    logAuthEvent('token_refresh', undefined, {
      source: refreshTokenFromCookie ? 'cookie' : 'body',
      ip: req.ip
    });

    // Validate refresh token
    const validation = await validateRefreshToken(refreshToken);

    if (!validation.valid || !validation.refreshToken) {
      logAuthEvent('token_refresh_failure', undefined, {
        reason: validation.error,
        ip: req.ip
      });

      logSecurityEvent('invalid_refresh_token', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        error: validation.error
      }, 'medium');

      handleAuthError(res, 'invalid_token', {
        reason: validation.error
      });
      return;
    }

    const { userId, sessionId } = validation.refreshToken;

    // Get user information
    const user = await getUserById(userId);
    if (!user) {
      logAuthEvent('token_refresh_failure', userId, {
        reason: 'user_not_found',
        ip: req.ip
      });

      handleAuthError(res, 'invalid_token', {
        reason: 'User not found'
      });
      return;
    }

    // Check if user account is locked
    if (user.isLocked) {
      logAuthEvent('token_refresh_failure', userId, {
        reason: 'account_locked',
        ip: req.ip
      });

      await revokeAllUserRefreshTokens(userId);
      await revokeAllUserSessions(userId);

      handleAuthError(res, 'account_locked');
      return;
    }

    // Rotate refresh token
    const rotation = await rotateRefreshToken(refreshToken, userId, sessionId);

    if (!rotation.success || !rotation.newRefreshToken) {
      logAuthEvent('token_refresh_failure', userId, {
        reason: rotation.error,
        ip: req.ip
      });

      logSecurityEvent('refresh_token_rotation_failed', {
        userId,
        sessionId,
        error: rotation.error,
        ip: req.ip
      }, 'high');

      handleAuthError(res, 'invalid_token', {
        reason: rotation.error
      });
      return;
    }

    // Generate new access and ID tokens
    const accessToken = generateAccessToken(userId, sessionId, user.roles);
    const idToken = generateIdToken(userId, sessionId, {
      preferred_username: user.username,
      email: user.email,
      email_verified: true,
      given_name: user.given_name,
      family_name: user.family_name
    });

    logAuthEvent('token_refresh_success', userId, {
      sessionId,
      ip: req.ip
    });

    // Set new refresh token cookie
    res.cookie('refresh_token', rotation.newRefreshToken.token, getRefreshTokenCookieOptions());

    res.json({
      id_token: idToken,
      access_token: accessToken,
      message: 'Tokens refreshed successfully.'
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

    // Try to revoke as refresh token first
    const revoked = await revokeRefreshToken(token);

    if (revoked) {
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
            username: user.username,
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
      const refreshTokenInfo = await getRefreshTokenInfo(token);
      if (refreshTokenInfo.active && refreshTokenInfo.userId) {
        const user = await getUserById(refreshTokenInfo.userId);
        if (user && !user.isLocked) {
          introspectionResponse = {
            active: true,
            token_type: 'refresh_token',
            sub: refreshTokenInfo.userId,
            exp: refreshTokenInfo.expiresAt ? Math.floor(refreshTokenInfo.expiresAt.getTime() / 1000) : undefined,
            iat: refreshTokenInfo.createdAt ? Math.floor(refreshTokenInfo.createdAt.getTime() / 1000) : undefined,
            username: user.username
          };
        }
      }
    }

    res.json(introspectionResponse);
  } catch (error) {
    handleInternalError(res, error instanceof Error ? error : new Error('Token introspection failed'));
  }
};