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
  const { isAuthenticated, isLoading, user, mfaRequired } = useAuth();
  const { login, error, clearError } = useCiamContext();

  // Track previous MFA state to detect transitions
  const prevMfaRequired = React.useRef(mfaRequired);
  const [wasMfaRequired, setWasMfaRequired] = React.useState(false);

  React.useEffect(() => {
    // Detect MFA → authenticated transition
    if (prevMfaRequired.current && !mfaRequired && isAuthenticated) {
      // We just completed MFA and became authenticated
      // Keep the login component mounted briefly to prevent remounting
      setWasMfaRequired(true);
      // Clear the flag after a short delay to allow state to settle
      const timer = setTimeout(() => setWasMfaRequired(false), 100);
      return () => clearTimeout(timer);
    }
    prevMfaRequired.current = mfaRequired;
  }, [mfaRequired, isAuthenticated]);

  // Call onAuthenticated callback when user becomes authenticated
  React.useEffect(() => {
    if (isAuthenticated && user && onAuthenticated) {
      onAuthenticated(user);
    }
  }, [isAuthenticated, user, onAuthenticated]);

  // CRITICAL FIX: Show protected content optimistically during initialization
  // Show login component if:
  // 1. User is not authenticated AND not loading (normal login flow)
  // 2. OR MFA is required (keep login component mounted during MFA to preserve state)
  // 3. OR we just completed MFA (prevent remounting during transition)
  if ((!isAuthenticated && !isLoading) || mfaRequired || wasMfaRequired) {
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