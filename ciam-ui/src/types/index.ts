// API Response Types (matching backend)
export interface LoginResponse {
  responseTypeCode: 'SUCCESS' | 'MFA_REQUIRED' | 'MFA_LOCKED' | 'ACCOUNT_LOCKED' | 'INVALID_CREDENTIALS' | 'MISSING_CREDENTIALS';
  message?: string;
  id_token?: string;
  access_token?: string;
  refresh_token?: string;
  sessionId: string;
  transactionId?: string;
  deviceId?: string;
  mfa_required?: boolean;
  available_methods?: string[];
}

export interface MFAChallengeResponse {
  challengeId?: string;
  transactionId: string;
  challengeStatus: MFAChallengeStatus;
  expiresAt: string;
  message?: string;
  displayNumber?: number; // For push challenges - single number to display on UI
}

export interface MFAVerifyResponse {
  success: boolean;
  id_token?: string;
  access_token?: string;
  refresh_token?: string;
  sessionId?: string;
  transactionId: string;
  message?: string;
  error?: string;
  attempts?: number;
  canRetry?: boolean;
}

export interface MFATransactionStatusResponse {
  transactionId: string;
  challengeStatus: MFAChallengeStatus;
  updatedAt: string;
  expiresAt: string;
  message?: string;
  displayNumber?: number; // For push challenges - single number to display on UI
  selectedNumber?: number; // For push challenges - auto-selected number by test users
}

export interface TokenRefreshResponse {
  id_token: string;
  access_token: string;
  refresh_token?: string;
  message?: string;
}

export interface SessionVerifyResponse {
  isValid: boolean;
  message?: string;
  expiresAt?: string;
}

export interface UserInfoResponse {
  sub: string;
  preferred_username?: string;
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  roles?: string[];
  iat: number;
  exp: number;
  lastLoginAt?: string; // ISO string of last login timestamp
}

export interface SessionInfo {
  sessionId: string;
  deviceId?: string;
  createdAt: string;
  lastSeenAt: string;
  ip?: string;
  userAgent?: string;
  location?: string;
}

export interface ApiError {
  code: string;
  message: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export type MFAChallengeStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

// Internal Types
export interface User {
  sub: string;
  preferred_username?: string;
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  roles?: string[];
  lastLoginAt?: string; // ISO string of last login timestamp
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  accessToken: string | null;
  sessionId: string | null;
  error: string | null;
}

export interface MFATransaction {
  transactionId: string;
  method: 'otp' | 'push';
  status: MFAChallengeStatus;
  expiresAt: string;
  createdAt: string;
  displayNumber?: number; // For push challenges - single number to display on UI
  selectedNumber?: number; // For push challenges - auto-selected number by test users
}

export interface MFAState {
  transaction: MFATransaction | null;
  isLoading: boolean;
  error: string | null;
}

export interface SessionState {
  sessions: SessionInfo[];
  currentSession: SessionInfo | null;
  isLoading: boolean;
  error: string | null;
}

// Component Props Types
export interface CiamLoginComponentProps {
  variant?: 'form' | 'inline';
  onLoginSuccess?: (user: User) => void;
  onLoginError?: (error: ApiError) => void;
  onLogout?: () => void;
  showUserInfo?: boolean;
  customStyles?: React.CSSProperties;
  autoRedirect?: boolean;
  redirectUrl?: string;
  className?: string;
}


export interface MfaMethodSelectionProps {
  open: boolean;
  availableMethods: ('otp' | 'push')[];
  onMethodSelected: (method: 'otp' | 'push') => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string | null;
}

export interface ProtectedRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
  fallback?: React.ReactNode;
  requiredRoles?: string[];
  onUnauthorized?: () => void;
}

export interface SessionManagerProps {
  onSessionRevoked?: (sessionId: string) => void;
  showDeviceInfo?: boolean;
  allowSignOutAll?: boolean;
  maxSessions?: number;
}

// Provider Props
export interface CiamProviderProps {
  backendUrl: string;
  children: React.ReactNode;
  onLoginSuccess?: (user: User) => void;
  onLoginError?: (error: ApiError) => void;
  onLogout?: () => void;
  onSessionExpired?: () => void;
  autoRefreshTokens?: boolean;
  refreshInterval?: number;
  storageType?: 'memory' | 'session';
  theme?: CiamTheme;
  locale?: string;
  debug?: boolean;
}

// Theme Types
export interface CiamTheme {
  palette?: {
    primary?: {
      main?: string;
      light?: string;
      dark?: string;
    };
    secondary?: {
      main?: string;
      light?: string;
      dark?: string;
    };
    error?: {
      main?: string;
    };
    success?: {
      main?: string;
    };
  };
  components?: {
    CiamLoginForm?: {
      styleOverrides?: {
        root?: React.CSSProperties;
        form?: React.CSSProperties;
        button?: React.CSSProperties;
      };
    };
  };
}

// Hook Return Types
export interface UseAuthReturn {
  // State
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  error: string | null;
  // MFA state - centralized to avoid timing conflicts
  mfaRequired: boolean;
  mfaAvailableMethods: ('otp' | 'push')[];
  mfaError: string | null;
  mfaUsername: string | null; // Store username when MFA is required

  // Services
  authService: any; // AuthService instance for direct access

  // Actions
  login: (username: string, password: string) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  clearError: () => void;
  clearMfa: () => void;
}

export interface UseMfaReturn {
  // State
  transaction: MFATransaction | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  initiateChallenge: (method: 'otp' | 'push', username?: string) => Promise<MFAChallengeResponse>;
  verifyOtp: (transactionId: string, otp: string) => Promise<MFAVerifyResponse>;
  verifyPush: (transactionId: string, pushResult?: 'APPROVED' | 'REJECTED', selectedNumber?: number) => Promise<MFAVerifyResponse>;
  checkStatus: (transactionId: string) => Promise<MFATransactionStatusResponse>;
  cancelTransaction: () => void;
}

export interface UseSessionReturn {
  // State
  sessions: SessionInfo[];
  currentSession: SessionInfo | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadSessions: () => Promise<void>;
  revokeSession: (sessionId: string) => Promise<void>;
  revokeAllOtherSessions: () => Promise<void>;
  verifySession: (sessionId?: string) => Promise<boolean>;
}

// Service Configuration
export interface ServiceConfig {
  baseURL: string;
  timeout?: number;
  retries?: number;
  debug?: boolean;
}