import { useState, useCallback, useContext, useEffect } from 'react';
import { AuthService } from '../services/AuthService';
import { UseSessionReturn, SessionInfo, ApiError } from '../types';
import { CiamContext } from '../components/CiamProvider';

export const useSession = (): UseSessionReturn => {
  const context = useContext(CiamContext);

  if (!context) {
    throw new Error('useSession must be used within a CiamProvider');
  }

  const { authService, config } = context;

  const [state, setState] = useState({
    sessions: [] as SessionInfo[],
    currentSession: null as SessionInfo | null,
    isLoading: false,
    error: null as string | null,
  });

  const loadSessions = useCallback(async (): Promise<void> => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const response = await authService.getSessions();
      const sessions = response.sessions;

      // Find current session (most recent one)
      const currentSession = sessions.length > 0
        ? sessions.reduce((latest, session) =>
            new Date(session.lastSeenAt) > new Date(latest.lastSeenAt) ? session : latest
          )
        : null;

      setState(prev => ({
        ...prev,
        isLoading: false,
        sessions,
        currentSession,
      }));
    } catch (error) {
      const apiError = error as ApiError;

      setState(prev => ({
        ...prev,
        isLoading: false,
        error: apiError.message || 'Failed to load sessions',
      }));

      throw error;
    }
  }, [authService]);

  const revokeSession = useCallback(async (sessionId: string): Promise<void> => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      await authService.revokeSession(sessionId);

      // Remove the revoked session from local state
      setState(prev => ({
        ...prev,
        isLoading: false,
        sessions: prev.sessions.filter(s => s.sessionId !== sessionId),
        currentSession: prev.currentSession?.sessionId === sessionId ? null : prev.currentSession,
      }));

      // If current session was revoked, user needs to log in again
      if (state.currentSession?.sessionId === sessionId) {
        authService.clearTokens();
        config.onSessionExpired?.();
      }
    } catch (error) {
      const apiError = error as ApiError;

      setState(prev => ({
        ...prev,
        isLoading: false,
        error: apiError.message || 'Failed to revoke session',
      }));

      throw error;
    }
  }, [authService, config, state.currentSession]);

  const revokeAllOtherSessions = useCallback(async (): Promise<void> => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const currentSessionId = state.currentSession?.sessionId;
      const otherSessions = state.sessions.filter(s => s.sessionId !== currentSessionId);

      // Revoke all other sessions
      await Promise.all(
        otherSessions.map(session => authService.revokeSession(session.sessionId))
      );

      // Update local state to only include current session
      setState(prev => ({
        ...prev,
        isLoading: false,
        sessions: prev.sessions.filter(s => s.sessionId === currentSessionId),
      }));
    } catch (error) {
      const apiError = error as ApiError;

      setState(prev => ({
        ...prev,
        isLoading: false,
        error: apiError.message || 'Failed to revoke other sessions',
      }));

      throw error;
    }
  }, [authService, state.currentSession, state.sessions]);

  const verifySession = useCallback(async (sessionId?: string): Promise<boolean> => {
    try {
      const targetSessionId = sessionId || state.currentSession?.sessionId;

      if (!targetSessionId) {
        return false;
      }

      const response = await authService.verifySession(targetSessionId);
      return response.isValid;
    } catch (error) {
      if (config.debug) {
        console.error('[useSession] Session verification failed:', error);
      }
      return false;
    }
  }, [authService, state.currentSession, config]);

  // Auto-load sessions when authenticated
  useEffect(() => {
    if (authService.isAuthenticated()) {
      loadSessions().catch(() => {
        // Ignore errors on initial load
      });
    }
  }, [authService, loadSessions]);

  return {
    sessions: state.sessions,
    currentSession: state.currentSession,
    isLoading: state.isLoading,
    error: state.error,
    loadSessions,
    revokeSession,
    revokeAllOtherSessions,
    verifySession,
  };
};