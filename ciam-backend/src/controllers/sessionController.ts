import { Request, Response } from 'express';
import { getSessionById, verifySession, getUserSessions, revokeSession, isSessionOwner } from '../services/sessionService';
import { handleSessionError, handleAuthError, handleInternalError, sendErrorResponse, createApiError } from '../utils/errors';
import { logAuthEvent } from '../utils/logger';
import { AuthenticatedRequest, SessionVerifyResponse } from '../types';

/**
 * Verify session validity
 * GET /auth/sessions/{session_id}/verify
 */
export const verifySessionEndpoint = async (req: Request, res: Response): Promise<void> => {
  try {
    const { session_id } = req.params;

    if (!session_id) {
      sendErrorResponse(res, 400, createApiError(
        'BAD_REQUEST',
        'Session ID is required'
      ));
      return;
    }

    const isValid = await verifySession(session_id);
    const session = await getSessionById(session_id);

    const response: SessionVerifyResponse = {
      isValid,
      message: isValid ? 'Session is valid.' : 'Session is invalid or expired.',
      expiresAt: session?.expiresAt?.toISOString()
    };

    logAuthEvent('session_verify', session?.userId, {
      sessionId: session_id,
      isValid,
      ip: req.ip
    });

    res.json(response);
  } catch (error) {
    handleInternalError(res, error instanceof Error ? error : new Error('Session verification failed'));
  }
};

/**
 * List active sessions for authenticated user
 * GET /auth/sessions
 */
export const listUserSessions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.sub;

    if (!userId) {
      handleAuthError(res, 'unauthorized');
      return;
    }

    const sessions = await getUserSessions(userId);

    logAuthEvent('sessions_listed', userId, {
      sessionCount: sessions.length,
      ip: req.ip
    });

    res.json({
      sessions
    });
  } catch (error) {
    logAuthEvent('sessions_list_failure', req.user?.sub, {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip
    });

    handleInternalError(res, error instanceof Error ? error : new Error('Failed to list sessions'));
  }
};

/**
 * Revoke a specific session
 * DELETE /auth/sessions/{session_id}
 */
export const revokeSessionEndpoint = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { session_id } = req.params;
    const userId = req.user?.sub;

    if (!userId) {
      handleAuthError(res, 'unauthorized');
      return;
    }

    // Check if session belongs to the user
    const isOwner = await isSessionOwner(session_id, userId);
    if (!isOwner) {
      handleAuthError(res, 'unauthorized', {
        reason: 'Session does not belong to user'
      });
      return;
    }

    const revoked = await revokeSession(session_id);

    if (!revoked) {
      handleSessionError(res, 'not_found', { sessionId: session_id });
      return;
    }

    logAuthEvent('session_revoked', userId, {
      sessionId: session_id,
      ip: req.ip
    });

    res.json({
      message: 'Session revoked successfully.'
    });
  } catch (error) {
    logAuthEvent('session_revoke_failure', req.user?.sub, {
      sessionId: req.params.session_id,
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip
    });

    handleInternalError(res, error instanceof Error ? error : new Error('Failed to revoke session'));
  }
};