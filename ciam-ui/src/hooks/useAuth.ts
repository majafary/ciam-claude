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
    // MFA state
    mfaRequired: context.mfaRequired,
    mfaAvailableMethods: context.mfaAvailableMethods,
    mfaOtpMethods: context.mfaOtpMethods,
    mfaError: context.mfaError,
    mfaUsername: context.mfaUsername,
    mfaTransactionId: context.mfaTransactionId,
    mfaDeviceFingerprint: context.mfaDeviceFingerprint,
    // Services
    authService: context.authService,
    // Actions
    login: context.login,
    logout: context.logout,
    refreshSession: context.refreshSession,
    clearError: context.clearError,
    clearMfa: context.clearMfa,
    // Device binding
    showDeviceBindDialog: context.showDeviceBindDialog,
    // eSign
    showESignDialog: context.showESignDialog,
  };
};