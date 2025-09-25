import { Request, Response } from 'express';
import { getUserById } from '../services/userService';
import { handleAuthError, handleInternalError } from '../utils/errors';
import { logAuthEvent } from '../utils/logger';
import { AuthenticatedRequest, UserInfoResponse } from '../types';

/**
 * Get user information (OIDC standard)
 * GET /userinfo
 */
export const getUserInfo = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.sub;

    if (!userId) {
      handleAuthError(res, 'unauthorized');
      return;
    }

    const user = await getUserById(userId);

    if (!user) {
      handleAuthError(res, 'unauthorized', {
        reason: 'User not found'
      });
      return;
    }

    if (user.isLocked) {
      handleAuthError(res, 'account_locked');
      return;
    }

    const userInfo: UserInfoResponse = {
      sub: user.id,
      preferred_username: user.username,
      email: user.email,
      email_verified: true,
      given_name: user.given_name,
      family_name: user.family_name,
      roles: user.roles,
      iat: req.user?.iat || Math.floor(Date.now() / 1000),
      exp: req.user?.exp || Math.floor(Date.now() / 1000) + 3600
    };

    logAuthEvent('userinfo_accessed', userId, {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json(userInfo);
  } catch (error) {
    logAuthEvent('userinfo_failure', req.user?.sub, {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip
    });

    handleInternalError(res, error instanceof Error ? error : new Error('Failed to get user info'));
  }
};