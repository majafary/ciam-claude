import { useContext } from 'react';
import { UseAuthReturn } from '../types';
import { CiamContext } from '../components/CiamProvider';

export const useAuth = (): UseAuthReturn => {
  const context = useContext(CiamContext);

  if (!context) {
    throw new Error('useAuth must be used within a CiamProvider');
  }

  // Return the shared authentication state and actions from the context
  return {
    isAuthenticated: context.isAuthenticated,
    isLoading: context.isLoading,
    user: context.user,
    error: context.error,
    login: context.login,
    logout: context.logout,
    refreshSession: context.refreshSession,
    clearError: context.clearError,
  };
};