import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { useCiamContext } from './CiamProvider';
import { CiamLoginComponent } from './CiamLoginComponent';
import { User, LoginResponse } from '../types';

interface LoginActions {
  login: (username: string, password: string) => Promise<LoginResponse>;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
}

interface CiamProtectedAppProps {
  children: React.ReactNode;
  fallback?: React.ReactNode | ((actions: LoginActions) => React.ReactNode);
  onAuthenticated?: (user: User) => void;
}

/**
 * CiamProtectedApp - Seamless authentication wrapper for client applications
 *
 * This component encapsulates all CIAM authentication concerns, providing
 * a flicker-free experience by optimistically showing the protected content
 * and handling authentication state changes gracefully.
 *
 * Usage:
 * ```tsx
 * <CiamProtectedApp>
 *   <YourAppContent />
 * </CiamProtectedApp>
 * ```
 */
export const CiamProtectedApp: React.FC<CiamProtectedAppProps> = ({
  children,
  fallback,
  onAuthenticated,
}) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { login, error, clearError } = useCiamContext();

  // Call onAuthenticated callback when user becomes authenticated
  React.useEffect(() => {
    if (isAuthenticated && user && onAuthenticated) {
      onAuthenticated(user);
    }
  }, [isAuthenticated, user, onAuthenticated]);

  // CRITICAL FIX: Show protected content optimistically during initialization
  // Only show login if we've definitively determined user is not authenticated
  // AND we're not in the initial loading/checking phase
  if (!isAuthenticated && !isLoading) {
    // Support both static fallback and render prop pattern
    if (typeof fallback === 'function') {
      const loginActions: LoginActions = {
        login,
        isLoading,
        error,
        clearError,
      };
      return <>{fallback(loginActions)}</>;
    }

    return (
      <>
        {fallback || <CiamLoginComponent />}
      </>
    );
  }

  // Show protected content (either authenticated OR still checking/loading)
  return <>{children}</>;
};

export default CiamProtectedApp;