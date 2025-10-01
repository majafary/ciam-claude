// API Response Types (matching backend)
export interface LoginResponse {
  responseTypeCode: 'SUCCESS' | 'MFA_REQUIRED' | 'ESIGN_REQUIRED' | 'ACCOUNT_LOCKED' | 'MFA_LOCKED' | 'INVALID_CREDENTIALS' | 'MISSING_CREDENTIALS';
  message?: string;
  id_token?: string;
  access_token?: string;
  refresh_token?: string;
  sessionId: string;
  transactionId?: string;
  deviceId?: string;
  deviceFingerprint?: string;
  mfa_required?: boolean;
  mfa_skipped?: boolean;
  available_methods?: string[];
  esign_document_id?: string;
  esign_url?: string;
  reason?: string;
  trust_expired_at?: string;
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
  success?: boolean;
  responseTypeCode?: 'SUCCESS' | 'ESIGN_REQUIRED';
  id_token?: string;
  access_token?: string;
  refresh_token?: string;
  sessionId?: string;
  transactionId: string;
  deviceFingerprint?: string;
  device_bound?: boolean;
  esign_document_id?: string;
  is_mandatory?: boolean;
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


export interface ApiError {
  code: string;
  message: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

// eSign Types
export interface ESignDocument {
  documentId: string;
  title: string;
  content: string;
  version: string;
  mandatory: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ESignAcceptanceRequest {
  transactionId: string;
  documentId: string;
  acceptanceIp?: string;
  acceptanceTimestamp?: string;
}

export interface ESignDeclineRequest {
  transactionId: string;
  documentId: string;
  reason?: string;
}

export interface ESignResponse {
  responseTypeCode: 'SUCCESS' | 'ESIGN_DECLINED';
  message?: string;
  access_token?: string;
  id_token?: string;
  sessionId?: string;
  transactionId?: string;
  esign_accepted?: boolean;
  esign_accepted_at?: string;
  can_retry?: boolean;
  device_bound?: boolean; // Whether device is already trusted (true) or needs binding (false)
  deviceFingerprint?: string; // Device fingerprint for binding
}

export interface PostMFACheckResponse {
  responseTypeCode: 'SUCCESS' | 'ESIGN_REQUIRED';
  message?: string;
  esign_document_id?: string;
  is_mandatory?: boolean;
}

export interface PostLoginCheckResponse {
  responseTypeCode: 'SUCCESS' | 'ESIGN_REQUIRED';
  message?: string;
  esign_document_id?: string;
  is_mandatory?: boolean;
  force_logout_if_declined?: boolean;
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

export interface ESignComponentProps {
  open: boolean;
  documentId: string;
  transactionId: string;
  mandatory: boolean;
  onAccept: () => Promise<void>;
  onDecline: (reason?: string) => Promise<void>;
  isLoading?: boolean;
  error?: string | null;
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
  mfaDeviceFingerprint: string | null; // Store device fingerprint for device binding

  // Services
  authService: any; // AuthService instance for direct access

  // Actions
  login: (username: string, password: string) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  clearError: () => void;
  clearMfa: () => void;
  // Device binding
  showDeviceBindDialog: (username: string, deviceFingerprint: string, onComplete?: () => void) => void;
  // eSign
  showESignDialog: (documentId: string, transactionId: string, mandatory: boolean, username: string, saveUsername: boolean, deviceFingerprint?: string, onComplete?: () => void) => void;
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


// Service Configuration
export interface ServiceConfig {
  baseURL: string;
  timeout?: number;
  retries?: number;
  debug?: boolean;
}