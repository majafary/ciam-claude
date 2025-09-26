import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthService } from '../services/AuthService';
import { CiamProviderProps, CiamTheme, User, LoginResponse, ApiError } from '../types';

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
  mfaAvailableMethods: ('otp' | 'push')[];
  mfaError: string | null;
  // Authentication actions
  login: (username: string, password: string) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  clearError: () => void;
  clearMfa: () => void;
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
    retries: 3,
    debug,
  });

  // Global authentication state
  const [authState, setAuthState] = useState({
    isAuthenticated: false,
    isLoading: false,
    user: null as User | null,
    error: null as string | null,
    // MFA state
    mfaRequired: false,
    mfaAvailableMethods: [] as ('otp' | 'push')[],
    mfaError: null as string | null,
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
        setAuthState(prev => ({ ...prev, isLoading: true }));
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

          setAuthState({
            isAuthenticated: true,
            isLoading: false,
            user,
            error: null,
            mfaRequired: false,
            mfaAvailableMethods: [],
            mfaError: null,
          });

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

            setAuthState({
              isAuthenticated: true,
              isLoading: false,
              user,
              error: null,
              mfaRequired: false,
              mfaAvailableMethods: [],
              mfaError: null,
            });

            onLoginSuccess?.(user);
          } catch (refreshError) {
            // No valid refresh token, user needs to log in
            if (debug) {
              console.log('[CiamProvider] Token refresh failed, user not authenticated');
            }
            setAuthState({
              isAuthenticated: false,
              isLoading: false,
              user: null,
              error: null,
              mfaRequired: false,
              mfaAvailableMethods: [],
              mfaError: null,
            });
          }
        }
      } catch (error) {
        // General error handling
        if (debug) {
          console.error('[CiamProvider] Initialization error:', error);
        }
        authService.clearTokens();
        setAuthState({
          isAuthenticated: false,
          isLoading: false,
          user: null,
          error: null,
          mfaRequired: false,
          mfaAvailableMethods: [],
          mfaError: null,
        });
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

      if (response.responseTypeCode === 'SUCCESS') {
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
          mfaError: null,
        });

        onLoginSuccess?.(user);
      } else if (response.responseTypeCode === 'MFA_REQUIRED') {
        // MFA required - set MFA state to trigger dialog
        console.log('🟢 Provider: Setting MFA state', response.available_methods);
        setAuthState(prev => ({
          ...prev,
          isLoading: false,
          mfaRequired: true,
          mfaAvailableMethods: (response.available_methods || ['otp', 'push']) as ('otp' | 'push')[],
          mfaError: null
        }));
      } else {
        // Handle all error cases: MFA_LOCKED, ACCOUNT_LOCKED, INVALID_CREDENTIALS, MISSING_CREDENTIALS
        console.log("MARKER_ERROR_HANDLING:", response.responseTypeCode, response.message);
        const errorMessage = response.message || 'Authentication failed';
        setAuthState(prev => ({
          ...prev,
          isLoading: false,
          error: errorMessage
        }));
        console.log("MARKER_ERROR_SET:", errorMessage);

        const apiError: ApiError = {
          code: response.responseTypeCode,
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
        mfaError: null,
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
        mfaError: null,
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
        mfaError: null,
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

  const clearMfa = useCallback(() => {
    setAuthState(prev => ({
      ...prev,
      mfaRequired: false,
      mfaAvailableMethods: [],
      mfaError: null
    }));
  }, []);

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
    mfaError: authState.mfaError,
    // Authentication actions
    login,
    logout,
    refreshSession,
    clearError,
    clearMfa,
  };

  const muiTheme = createCiamTheme(theme);

  return (
    <CiamContext.Provider value={contextValue}>
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        {children}
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