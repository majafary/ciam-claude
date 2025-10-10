import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthService } from '../services/AuthService';
import { CiamProviderProps, CiamTheme, User, LoginResponse, ApiError } from '../types';
import { DeviceBindDialog } from './DeviceBindDialog';
import { ESignDialog } from './ESignDialog';

interface CiamContextValue {
  authService: AuthService;
  config: CiamProviderProps;
  // Authentication state - shared across all components
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  error: string | null;
  // MFA state - centralized to avoid timing conflicts
  mfaRequired: boolean;
  mfaAvailableMethods: ('sms' | 'voice' | 'push')[];
  mfaOtpMethods: Array<{ value: string; mfa_option_id: number }> | null; // OTP method options from login response
  mfaError: string | null;
  mfaUsername: string | null; // Store username when MFA is required
  mfaTransactionId: string | null; // Store transaction_id from login response for MFA operations
  mfaContextId: string | null; // Store context_id from login response for MFA operations
  mfaDeviceFingerprint: string | null; // Store device fingerprint for device binding during MFA
  // Authentication actions
  login: (username: string, password: string) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  clearError: () => void;
  clearMfa: (errorMessage?: string) => void;
  // Device binding
  showDeviceBindDialog: (username: string, deviceFingerprint: string, onComplete?: () => void) => void;
  // eSign
  showESignDialog: (documentId: string, transactionId: string, mandatory: boolean, username: string, saveUsername: boolean, deviceFingerprint?: string, onComplete?: () => void) => void;
}

export const CiamContext = createContext<CiamContextValue | null>(null);

const defaultTheme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        size: 'medium',
      },
    },
  },
});

const createCiamTheme = (ciamTheme?: CiamTheme) => {
  return createTheme({
    ...defaultTheme,
    palette: {
      ...defaultTheme.palette,
      ...ciamTheme?.palette,
      primary: {
        ...defaultTheme.palette.primary,
        ...ciamTheme?.palette?.primary,
      },
      secondary: {
        ...defaultTheme.palette.secondary,
        ...ciamTheme?.palette?.secondary,
      },
      error: {
        ...defaultTheme.palette.error,
        ...ciamTheme?.palette?.error,
      },
      success: {
        ...defaultTheme.palette.success,
        ...ciamTheme?.palette?.success,
      },
    },
  });
};

export const CiamProvider: React.FC<CiamProviderProps> = ({
  backendUrl,
  children,
  onLoginSuccess,
  onLoginError,
  onLogout,
  onSessionExpired,
  autoRefreshTokens = true,
  refreshInterval = 5 * 60 * 1000, // 5 minutes
  storageType = 'memory',
  theme,
  locale = 'en',
  debug = false,
}) => {
  // Create auth service instance
  const authService = new AuthService({
    baseURL: backendUrl,
    timeout: 10000,
    retries: 1, // Reduced from 3 to 1 for faster failures in optimistic UI
    debug,
  });

  // Global authentication state
  const [authState, setAuthState] = useState({
    isAuthenticated: false,
    isLoading: true, // CRITICAL: Start in loading state during initialization
    user: null as User | null,
    error: null as string | null,
    // MFA state
    mfaRequired: false,
    mfaAvailableMethods: [] as ('sms' | 'voice' | 'push')[],
    mfaOtpMethods: null as Array<{ value: string; mfa_option_id: number }> | null,
    mfaError: null as string | null,
    mfaUsername: null as string | null, // Store username when MFA is required
    mfaTransactionId: null as string | null, // Store transaction_id for MFA operations
    mfaContextId: null as string | null, // Store context_id for MFA operations
    mfaDeviceFingerprint: null as string | null, // Store device fingerprint for device binding
  });

  const config: CiamProviderProps = {
    backendUrl,
    children,
    onLoginSuccess,
    onLoginError,
    onLogout,
    onSessionExpired,
    autoRefreshTokens,
    refreshInterval,
    storageType,
    theme,
    locale,
    debug,
  };

  // Initialize authentication state - track initialization to prevent loops
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    // Prevent multiple initializations
    if (hasInitialized) return;

    const initializeAuth = async () => {
      try {
        setHasInitialized(true);

        // First check if we have an access token in memory
        if (authService.isAuthenticated()) {
          if (debug) {
            console.log('[CiamProvider] Found access token, fetching user info');
          }
          const userInfo = await authService.getUserInfo();

          const user: User = {
            sub: userInfo.sub,
            preferred_username: userInfo.preferred_username,
            email: userInfo.email,
            email_verified: userInfo.email_verified,
            given_name: userInfo.given_name,
            family_name: userInfo.family_name,
            roles: userInfo.roles,
          };

          setAuthState(prev => ({
            ...prev,
            isAuthenticated: true,
            isLoading: false, // Stop loading - we have valid auth
            user,
            error: null,
            mfaRequired: false,
            mfaAvailableMethods: [],
            mfaOtpMethods: null,
            mfaError: null,
            mfaUsername: null,
          }));

          onLoginSuccess?.(user);
        } else {
          // No access token in memory, try to refresh using cookies
          if (debug) {
            console.log('[CiamProvider] No access token, attempting refresh from cookie');
          }

          try {
            const refreshResponse = await authService.refreshToken();
            if (debug) {
              console.log('[CiamProvider] Token refresh successful');
            }

            // After successful refresh, get user info
            const userInfo = await authService.getUserInfo();

            const user: User = {
              sub: userInfo.sub,
              preferred_username: userInfo.preferred_username,
              email: userInfo.email,
              email_verified: userInfo.email_verified,
              given_name: userInfo.given_name,
              family_name: userInfo.family_name,
              roles: userInfo.roles,
            };

            setAuthState(prev => ({
              ...prev,
              isAuthenticated: true,
              isLoading: false, // Stop loading - refresh successful
              user,
              error: null,
              mfaRequired: false,
              mfaAvailableMethods: [],
              mfaOtpMethods: null,
              mfaError: null,
              mfaUsername: null,
            }));

            onLoginSuccess?.(user);
          } catch (refreshError) {
            // No valid refresh token, user needs to log in
            if (debug) {
              console.log('[CiamProvider] Token refresh failed, user not authenticated');
            }
            setAuthState(prev => ({
              ...prev,
              isAuthenticated: false,
              isLoading: false, // CRITICAL: Stop loading - refresh failed, show login
              user: null,
              error: null,
              mfaRequired: false,
              mfaAvailableMethods: [],
              mfaOtpMethods: null,
              mfaError: null,
              mfaUsername: null,
            }));
          }
        }
      } catch (error) {
        // General error handling
        if (debug) {
          console.error('[CiamProvider] Initialization error:', error);
        }
        authService.clearTokens();
        setAuthState(prev => ({
          ...prev,
          isAuthenticated: false,
          isLoading: false, // CRITICAL: Stop loading - initialization failed
          user: null,
          error: null,
          mfaRequired: false,
          mfaAvailableMethods: [],
          mfaOtpMethods: null,
          mfaError: null,
          mfaUsername: null,
            mfaDeviceFingerprint: null,
        }));
      }
    };

    initializeAuth();
  }, []); // Empty dependency array to run only once

  // Auto-refresh token functionality
  useEffect(() => {
    if (!autoRefreshTokens || !authState.isAuthenticated) {
      return;
    }

    const interval = refreshInterval || 5 * 60 * 1000; // 5 minutes default

    const refreshTimer = setInterval(async () => {
      try {
        await authService.refreshToken();
        if (debug) {
          console.log('[CiamProvider] Token refreshed automatically');
        }
      } catch (error) {
        if (debug) {
          console.log('[CiamProvider] Auto-refresh failed:', error);
        }

        // If refresh fails, trigger session expired
        setAuthState(prev => ({
          ...prev,
          isAuthenticated: false,
          user: null,
          error: 'Session expired',
        }));

        authService.clearTokens();
        onSessionExpired?.();
      }
    }, interval);

    return () => clearInterval(refreshTimer);
  }, [authState.isAuthenticated, autoRefreshTokens, refreshInterval, authService, onSessionExpired, debug]);

  // Login function
  const login = useCallback(async (username: string, password: string): Promise<LoginResponse> => {
    console.log("MARKER1");
    try {
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }));

      const response = await authService.login(username, password);

      // v3.0.0: Use response_type_code with fallback to responseTypeCode
      const responseTypeCode = response.response_type_code || response.responseTypeCode;

      if (responseTypeCode === 'SUCCESS') {
        // Full login successful
        const userInfo = await authService.getUserInfo();

        const user: User = {
          sub: userInfo.sub,
          preferred_username: userInfo.preferred_username,
          email: userInfo.email,
          email_verified: userInfo.email_verified,
          given_name: userInfo.given_name,
          family_name: userInfo.family_name,
          roles: userInfo.roles,
        };

        setAuthState({
          isAuthenticated: true,
          isLoading: false,
          user,
          error: null,
          mfaRequired: false,
          mfaAvailableMethods: [],
          mfaOtpMethods: null,
          mfaError: null,
          mfaUsername: null,
          mfaTransactionId: null,
          mfaContextId: null,
          mfaDeviceFingerprint: null,
        });

        onLoginSuccess?.(user);
      } else if (responseTypeCode === 'MFA_REQUIRED') {
        // MFA required - set MFA state to trigger dialog
        console.log('🟢 Provider: Setting MFA state');
        console.log('🔍 Provider: Full MFA_REQUIRED response:', JSON.stringify(response, null, 2));
        console.log('🔍 Provider: Storing username for MFA:', username);
        console.log('🔍 Provider: context_id from response:', response.context_id);
        console.log('🔍 Provider: transaction_id from response:', response.transaction_id);

        // Extract available MFA methods from otp_methods and mobile_approve_status
        const availableMethods: ('sms' | 'voice' | 'push')[] = [];
        if (response.otp_methods && response.otp_methods.length > 0) {
          availableMethods.push('sms'); // v3: Use sms for OTP methods
        }
        if (response.mobile_approve_status === 'ENABLED') {
          availableMethods.push('push');
        }

        console.log('🔍 Provider: Setting state with:', {
          mfaContextId: response.context_id,
          mfaTransactionId: response.transaction_id,
          availableMethods,
          mfaOtpMethods: response.otp_methods,
        });

        setAuthState(prev => ({
          ...prev,
          isLoading: false,
          mfaRequired: true,
          mfaAvailableMethods: availableMethods.length > 0 ? availableMethods : ['sms', 'push'], // Fallback to both if none specified
          mfaOtpMethods: response.otp_methods || null, // Store OTP method options with their IDs
          mfaError: null,
          mfaUsername: username, // Store username for later MFA use
          mfaTransactionId: response.transaction_id || null, // Store transaction_id for MFA operations
          mfaContextId: response.context_id, // Store context_id for MFA operations (always present)
          mfaDeviceFingerprint: null, // deviceFingerprint removed from v3.0.0 API
        }));
      } else if (responseTypeCode === 'ESIGN_REQUIRED') {
        // eSign required - CiamLoginComponent will handle showing the dialog
        console.log('📝 Provider: eSign required, CiamLoginComponent will handle dialog');
        setAuthState(prev => ({
          ...prev,
          isLoading: false,
          error: null, // Clear any previous errors
        }));
      } else {
        // Handle all error cases: MFA_LOCKED, ACCOUNT_LOCKED, INVALID_CREDENTIALS, MISSING_CREDENTIALS
        console.log("MARKER_ERROR_HANDLING:", responseTypeCode, response.message);
        const errorMessage = response.message || 'Authentication failed';
        setAuthState(prev => ({
          ...prev,
          isLoading: false,
          error: errorMessage
        }));
        console.log("MARKER_ERROR_SET:", errorMessage);

        const apiError: ApiError = {
          code: responseTypeCode,
          message: errorMessage,
          timestamp: new Date().toISOString(),
        };
        onLoginError?.(apiError);
      }

      return response;
    } catch (error) {
          console.log("MARKER2:", error);
      let apiError: ApiError;

      if (error instanceof Error) {
        try {
          // Try to parse JSON error message from AuthService
          const parsedError = JSON.parse(error.message);
          if (parsedError.code && parsedError.message) {
            apiError = parsedError as ApiError;
          } else {
            apiError = {
              code: 'NETWORK_ERROR',
              message: error.message,
              timestamp: new Date().toISOString(),
            };
          }
        } catch {
          // Not a JSON error, create generic error
          apiError = {
            code: 'NETWORK_ERROR',
            message: error.message,
            timestamp: new Date().toISOString(),
          };
        }
      } else {
        apiError = {
          code: 'UNKNOWN_ERROR',
          message: 'An unknown error occurred',
          timestamp: new Date().toISOString(),
        };
      }

      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: apiError.message || 'Login failed',
      }));

      onLoginError?.(apiError);
      throw apiError;
    }
  }, [authService, onLoginSuccess, onLoginError]);

  // Logout function
  const logout = useCallback(async (): Promise<void> => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true }));

      await authService.logout();

      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        error: null,
        mfaRequired: false,
        mfaAvailableMethods: [],
        mfaOtpMethods: null,
        mfaError: null,
        mfaUsername: null,
        mfaTransactionId: null,
        mfaContextId: null,
        mfaDeviceFingerprint: null,
      });

      onLogout?.();
    } catch (error) {
      // Even if logout fails on server, clear local state
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        error: null,
        mfaRequired: false,
        mfaAvailableMethods: [],
        mfaOtpMethods: null,
        mfaError: null,
        mfaUsername: null,
        mfaTransactionId: null,
        mfaContextId: null,
        mfaDeviceFingerprint: null,
      });

      authService.clearTokens();
      onLogout?.();

      if (debug) {
        console.error('[CiamProvider] Logout error:', error);
      }
    }
  }, [authService, onLogout, debug]);

  // Refresh session function
  const refreshSession = useCallback(async (): Promise<void> => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }));

      await authService.refreshToken();
      const userInfo = await authService.getUserInfo();

      const user: User = {
        sub: userInfo.sub,
        preferred_username: userInfo.preferred_username,
        email: userInfo.email,
        email_verified: userInfo.email_verified,
        given_name: userInfo.given_name,
        family_name: userInfo.family_name,
        roles: userInfo.roles,
      };

      const wasAuthenticated = authState.isAuthenticated;

      setAuthState(prev => ({
        ...prev,
        isAuthenticated: true,
        isLoading: false,
        user,
        error: null,
        mfaRequired: false,
        mfaAvailableMethods: [],
        mfaOtpMethods: null,
        mfaError: null,
      }));

      // Call onLoginSuccess if transitioning from unauthenticated to authenticated
      if (!wasAuthenticated) {
        onLoginSuccess?.(user);
      }
    } catch (error) {
      let apiError: ApiError;

      if (error instanceof Error) {
        try {
          // Try to parse JSON error message from AuthService
          const parsedError = JSON.parse(error.message);
          if (parsedError.code && parsedError.message) {
            apiError = parsedError as ApiError;
          } else {
            apiError = {
              code: 'NETWORK_ERROR',
              message: error.message,
              timestamp: new Date().toISOString(),
            };
          }
        } catch {
          // Not a JSON error, create generic error
          apiError = {
            code: 'NETWORK_ERROR',
            message: error.message,
            timestamp: new Date().toISOString(),
          };
        }
      } else {
        apiError = {
          code: 'UNKNOWN_ERROR',
          message: 'An unknown error occurred',
          timestamp: new Date().toISOString(),
        };
      }

      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        error: apiError.message || 'Session refresh failed',
        mfaRequired: false,
        mfaAvailableMethods: [],
        mfaOtpMethods: null,
        mfaError: null,
        mfaUsername: null,
        mfaTransactionId: null,
        mfaContextId: null,
        mfaDeviceFingerprint: null,
      });

      authService.clearTokens();
      onSessionExpired?.();
      throw apiError;
    }
  }, [authService, onSessionExpired]);

  // Clear error function
  const clearError = useCallback(() => {
    setAuthState(prev => ({ ...prev, error: null }));
  }, []);

  const clearMfa = useCallback((errorMessage?: string) => {
    setAuthState(prev => ({
      ...prev,
      mfaRequired: false,
      mfaAvailableMethods: [],
      mfaOtpMethods: null, // Clear OTP method options
      mfaError: null,
      mfaUsername: null, // Clear stored username
      mfaTransactionId: null, // Clear stored transaction_id
      mfaDeviceFingerprint: null, // Clear stored deviceFingerprint
      error: errorMessage || prev.error, // Set error if provided, otherwise keep existing error
    }));
  }, []);

  // Device bind dialog state
  const [deviceBindState, setDeviceBindState] = useState({
    open: false,
    username: '',
    deviceFingerprint: '',
    onComplete: null as (() => void) | null,
  });

  // eSign dialog state
  const [esignState, setEsignState] = useState({
    open: false,
    documentId: '',
    transactionId: '',
    mandatory: false,
    username: '',
    saveUsername: false,
    deviceFingerprint: '',
    onComplete: null as (() => void) | null,
  });

  // Pending device bind state - set when eSign closes and device bind should open after transition
  const [pendingDeviceBind, setPendingDeviceBind] = useState<{
    shouldOpen: boolean;
    username: string;
    transactionId: string;
    onComplete: (() => void) | null;
  } | null>(null);

  const showDeviceBindDialog = useCallback((username: string, deviceFingerprint: string, onComplete?: () => void) => {
    console.log('🔐 Provider: Showing device bind dialog:', { username, deviceFingerprint });
    setDeviceBindState({
      open: true,
      username,
      deviceFingerprint,
      onComplete: onComplete || null,
    });
  }, []);

  const handleDeviceBindTrust = async () => {
    try {
      console.log('🔐 Provider: Trusting device with transaction_id:', deviceBindState.deviceFingerprint);
      // deviceFingerprint field actually contains transaction_id (backend handles fingerprint internally)
      // v3.0.0: Pass bind_device: true and handle token response
      const response = await authService.bindDevice(authState.mfaContextId || '', deviceBindState.deviceFingerprint, true);
      console.log('✅ Provider: Device trusted successfully', response);

      // v3.0.0: Set authentication state with tokens from device bind response
      const userInfo = await authService.getUserInfo();
      const user: User = {
        sub: userInfo.sub,
        preferred_username: userInfo.preferred_username,
        email: userInfo.email,
        email_verified: userInfo.email_verified,
        given_name: userInfo.given_name,
        family_name: userInfo.family_name,
        roles: userInfo.roles,
      };

      setAuthState({
        isAuthenticated: true,
        isLoading: false,
        user,
        error: null,
        mfaRequired: false,
        mfaAvailableMethods: [],
        mfaOtpMethods: null,
        mfaError: null,
        mfaUsername: null,
        mfaTransactionId: null,
        mfaContextId: null,
        mfaDeviceFingerprint: null,
      });

      setDeviceBindState({ open: false, username: '', deviceFingerprint: '', onComplete: null });

      // Complete login
      onLoginSuccess?.(user);

      // Call completion callback if provided
      if (deviceBindState.onComplete) {
        deviceBindState.onComplete();
      }
    } catch (err: any) {
      console.error('❌ Provider: Failed to bind device:', err);
      // Error is handled within dialog
    }
  };

  const handleDeviceBindCancel = async () => {
    try {
      console.log('⏭️ Provider: Device binding skipped');
      // v3.0.0: Pass bind_device: false and handle token response
      const response = await authService.bindDevice(authState.mfaContextId || '', deviceBindState.deviceFingerprint, false);
      console.log('✅ Provider: Device binding declined, tokens received', response);

      // v3.0.0: Set authentication state with tokens from device bind response
      const userInfo = await authService.getUserInfo();
      const user: User = {
        sub: userInfo.sub,
        preferred_username: userInfo.preferred_username,
        email: userInfo.email,
        email_verified: userInfo.email_verified,
        given_name: userInfo.given_name,
        family_name: userInfo.family_name,
        roles: userInfo.roles,
      };

      setAuthState({
        isAuthenticated: true,
        isLoading: false,
        user,
        error: null,
        mfaRequired: false,
        mfaAvailableMethods: [],
        mfaOtpMethods: null,
        mfaError: null,
        mfaUsername: null,
        mfaTransactionId: null,
        mfaContextId: null,
        mfaDeviceFingerprint: null,
      });

      setDeviceBindState({ open: false, username: '', deviceFingerprint: '', onComplete: null });

      // Complete login
      onLoginSuccess?.(user);

      // Call completion callback if provided
      if (deviceBindState.onComplete) {
        deviceBindState.onComplete();
      }
    } catch (err: any) {
      console.error('❌ Provider: Failed to skip device binding:', err);
      // Error is handled within dialog
    }
  };

  // eSign dialog methods
  const showESignDialog = useCallback((
    documentId: string,
    transactionId: string,
    mandatory: boolean,
    username: string,
    saveUsername: boolean,
    deviceFingerprint?: string,
    onComplete?: () => void
  ) => {
    console.log('📝 Provider: Showing eSign dialog:', { documentId, transactionId, mandatory, username, deviceFingerprint });
    setEsignState({
      open: true,
      documentId,
      transactionId,
      mandatory,
      username,
      saveUsername,
      deviceFingerprint: deviceFingerprint || '',
      onComplete: onComplete || null,
    });
  }, []);

  const handleESignAccept = async () => {
    try {
      console.log('📝 Provider: Accepting eSign:', { documentId: esignState.documentId, transactionId: esignState.transactionId });

      // Accept eSign
      const response = await authService.acceptESign(
        authState.mfaContextId || '', // context_id for v3
        esignState.transactionId,
        esignState.documentId,
        undefined // acceptanceIp - let backend handle it
      );
      console.log('✅ Provider: eSign accepted successfully', response);

      // v3.0.0: Check response_type_code (with fallback to legacy responseTypeCode)
      const responseTypeCode = response.response_type_code || response.responseTypeCode;

      // v3.0.0: If device binding is required, show device bind dialog
      if (responseTypeCode === 'DEVICE_BIND_REQUIRED') {
        console.log('📱 Provider: DEVICE_BIND_REQUIRED response, will show device bind dialog after eSign closes');
        // Set pending device bind to open after eSign dialog exit animation
        setPendingDeviceBind({
          shouldOpen: true,
          username: esignState.username,
          transactionId: response.transaction_id || esignState.transactionId,
          onComplete: () => {
            // onLoginSuccess will be called after device binding completes
            if (esignState.onComplete) {
              esignState.onComplete();
            }
          },
        });

        // Close eSign dialog - device bind will open after transition
        setEsignState({ open: false, documentId: '', transactionId: '', mandatory: false, username: '', saveUsername: false, deviceFingerprint: '', onComplete: null });
      } else {
        // v3.0.0: Device already bound or SUCCESS response - set authentication state
        const userInfo = await authService.getUserInfo();
        const user: User = {
          sub: userInfo.sub,
          preferred_username: userInfo.preferred_username,
          email: userInfo.email,
          email_verified: userInfo.email_verified,
          given_name: userInfo.given_name,
          family_name: userInfo.family_name,
          roles: userInfo.roles,
        };

        setAuthState({
          isAuthenticated: true,
          isLoading: false,
          user,
          error: null,
          mfaRequired: false,
          mfaAvailableMethods: [],
          mfaOtpMethods: null,
          mfaError: null,
          mfaUsername: null,
          mfaTransactionId: null,
          mfaContextId: null,
          mfaDeviceFingerprint: null,
        });

        // Close eSign dialog
        setEsignState({ open: false, documentId: '', transactionId: '', mandatory: false, username: '', saveUsername: false, deviceFingerprint: '', onComplete: null });

        // Complete login - device already bound
        onLoginSuccess?.(user);

        if (esignState.onComplete) {
          esignState.onComplete();
        }
      }
    } catch (err: any) {
      console.error('❌ Provider: Failed to accept eSign:', err);
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to accept terms and conditions'
      }));
    }
  };

  const handleESignDecline = async () => {
    console.log('⏭️ Provider: eSign declined - returning to login');
    setEsignState({ open: false, documentId: '', transactionId: '', mandatory: false, username: '', saveUsername: false, deviceFingerprint: '', onComplete: null });
    setAuthState(prev => ({
      ...prev,
      isLoading: false,
      error: 'You must accept the terms and conditions to continue'
    }));
  };

  // Handle eSign dialog exit transition complete - safe to open device bind now
  const handleESignExited = () => {
    if (pendingDeviceBind?.shouldOpen) {
      console.log('📱 Provider: eSign fully closed, opening device bind dialog');
      setDeviceBindState({
        open: true,
        username: pendingDeviceBind.username,
        deviceFingerprint: pendingDeviceBind.transactionId, // Using transactionId - backend handles fingerprint
        onComplete: pendingDeviceBind.onComplete,
      });
      // Clear pending state
      setPendingDeviceBind(null);
    }
  };

  const contextValue: CiamContextValue = {
    authService,
    config,
    // Authentication state
    isAuthenticated: authState.isAuthenticated,
    isLoading: authState.isLoading,
    user: authState.user,
    error: authState.error,
    // MFA state
    mfaRequired: authState.mfaRequired,
    mfaAvailableMethods: authState.mfaAvailableMethods,
    mfaOtpMethods: authState.mfaOtpMethods,
    mfaError: authState.mfaError,
    mfaUsername: authState.mfaUsername,
    mfaTransactionId: authState.mfaTransactionId,
    mfaContextId: authState.mfaContextId,
    mfaDeviceFingerprint: authState.mfaDeviceFingerprint,
    // Authentication actions
    login,
    logout,
    refreshSession,
    clearError,
    clearMfa,
    // Device binding
    showDeviceBindDialog,
    // eSign
    showESignDialog,
  };

  const muiTheme = createCiamTheme(theme);

  return (
    <CiamContext.Provider value={contextValue}>
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        {children}
        <DeviceBindDialog
          open={deviceBindState.open}
          username={deviceBindState.username}
          deviceFingerprint={deviceBindState.deviceFingerprint}
          onTrust={handleDeviceBindTrust}
          onCancel={handleDeviceBindCancel}
        />
        <ESignDialog
          open={esignState.open}
          documentId={esignState.documentId}
          transactionId={esignState.transactionId}
          mandatory={esignState.mandatory}
          onAccept={handleESignAccept}
          onDecline={handleESignDecline}
          onExited={handleESignExited}
          authService={authService}
        />
      </ThemeProvider>
    </CiamContext.Provider>
  );
};

export const useCiamContext = (): CiamContextValue => {
  const context = useContext(CiamContext);

  if (!context) {
    throw new Error('useCiamContext must be used within a CiamProvider');
  }

  return context;
};