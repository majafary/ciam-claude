import { useCiamContext } from '../components/CiamProvider';
import { LoginResponse } from '../types';

/**
 * Hook for authentication actions - login, logout, error handling
 *
 * Provides all the actions needed to build custom login/logout UI
 * while keeping the logic separate from auth state queries
 */
export const useAuthActions = () => {
  const {
    login,
    logout,
    clearError,
    clearMfa,
    error,
    isLoading
  } = useCiamContext();

  const handleLogin = async (username: string, password: string): Promise<LoginResponse> => {
    return await login(username, password);
  };

  const handleLogout = async (): Promise<void> => {
    await logout();
  };

  const handleClearError = (): void => {
    clearError();
  };

  const handleClearMfa = (): void => {
    clearMfa();
  };

  return {
    // Actions
    login: handleLogin,
    logout: handleLogout,
    clearError: handleClearError,
    clearMfa: handleClearMfa,

    // State related to actions
    isLoading,
    error,
  };
};