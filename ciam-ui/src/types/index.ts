// API Response Types (matching backend v3.0.0)
export interface LoginResponse {
  response_type_code: 'SUCCESS' | 'MFA_REQUIRED' | 'ESIGN_REQUIRED' | 'ACCOUNT_LOCKED' | 'MFA_LOCKED' | 'INVALID_CREDENTIALS' | 'MISSING_CREDENTIALS';
  message?: string;
  id_token?: string;
  access_token?: string;
  context_id: string; // v3.0.0 - always present in all responses
  transaction_id?: string;
  device_bound?: boolean;
  // MFA Required specific fields (200 response)
  otp_methods?: Array<{ value: string; mfa_option_id: number }>;
  mobile_approve_status?: 'NOT_REGISTERED' | 'ENABLED' | 'DISABLED';
  // eSign Required specific fields (200 response)
  esign_document_id?: string;
  esign_url?: string;
  is_mandatory?: boolean;
  // Legacy support
  responseTypeCode?: 'SUCCESS' | 'MFA_REQUIRED' | 'ESIGN_REQUIRED' | 'ACCOUNT_LOCKED' | 'MFA_LOCKED' | 'INVALID_CREDENTIALS' | 'MISSING_CREDENTIALS';
}

export interface MFAChallengeResponse {
  success: boolean;
  transaction_id: string;
  expires_at: string;
  display_number?: number; // For push challenges - single number to display on UI
}

export interface MFAVerifyResponse {
  response_type_code: 'SUCCESS' | 'MFA_PENDING' | 'ESIGN_REQUIRED' | 'DEVICE_BIND_REQUIRED';
  id_token?: string;
  access_token?: string;
  transaction_id: string;
  device_bound?: boolean;
  esign_document_id?: string;
  is_mandatory?: boolean;
  message?: string;
  expires_at?: string;
  retry_after?: number;
  error?: string;
  attempts?: number;
  canRetry?: boolean;
  // Legacy support
  responseTypeCode?: 'SUCCESS' | 'MFA_PENDING' | 'ESIGN_REQUIRED' | 'DEVICE_BIND_REQUIRED';
}

export interface TokenRefreshResponse {
  id_token?: string;
  access_token: string;
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
  code: string; // Changed from error_code to code for consistency
  message: string;
  timestamp?: string;
  details?: Record<string, unknown>;
}

// eSign Types
export interface ESignDocument {
  document_id: string;
  title: string;
  content: string;
  version: string;
  mandatory: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ESignAcceptanceRequest {
  context_id: string;
  transaction_id: string;
  document_id: string;
  acceptance_ip?: string;
  acceptance_timestamp?: string;
}

export interface ESignDeclineRequest {
  transaction_id: string;
  document_id: string;
  reason?: string;
}

export interface ESignResponse {
  response_type_code: 'SUCCESS' | 'ESIGN_DECLINED' | 'DEVICE_BIND_REQUIRED';
  message?: string;
  access_token?: string;
  id_token?: string;
  context_id?: string;
  transaction_id?: string;
  device_bound?: boolean;
  esign_accepted?: boolean;
  esign_accepted_at?: string;
  can_retry?: boolean;
  // Legacy support
  responseTypeCode?: 'SUCCESS' | 'ESIGN_DECLINED' | 'DEVICE_BIND_REQUIRED';
}

export interface PostMFACheckResponse {
  response_type_code: 'SUCCESS' | 'ESIGN_REQUIRED';
  message?: string;
  esign_document_id?: string;
  is_mandatory?: boolean;
  // Legacy support
  responseTypeCode?: 'SUCCESS' | 'ESIGN_REQUIRED';
}

export interface PostLoginCheckResponse {
  response_type_code: 'SUCCESS' | 'ESIGN_REQUIRED';
  message?: string;
  esign_document_id?: string;
  is_mandatory?: boolean;
  force_logout_if_declined?: boolean;
  // Legacy support
  responseTypeCode?: 'SUCCESS' | 'ESIGN_REQUIRED';
}

// v3.0.0: Device Bind Response
export interface DeviceBindResponse {
  response_type_code: 'SUCCESS';
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
  context_id: string;
  device_bound: boolean;
}


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
  contextId: string | null;
  error: string | null;
}

export interface MFATransaction {
  transaction_id: string;
  method: 'sms' | 'voice' | 'push';
  expires_at: string;
  created_at: string;
  display_number?: number; // For push challenges - single number to display on UI
  selected_number?: number; // For push challenges - auto-selected number by test users
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
  availableMethods: ('sms' | 'voice' | 'push')[];
  onMethodSelected: (method: 'sms' | 'voice' | 'push') => Promise<void>;
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
  mfaAvailableMethods: ('sms' | 'voice' | 'push')[];
  mfaOtpMethods: Array<{ value: string; mfa_option_id: number }> | null; // OTP method options from login response
  mfaError: string | null;
  mfaUsername: string | null; // Store username when MFA is required
  mfaTransactionId: string | null; // Store transaction_id for MFA operations
  mfaContextId: string | null; // Store context_id for MFA operations
  mfaDeviceFingerprint: string | null; // Store device fingerprint for device binding

  // Services
  authService: any; // AuthService instance for direct access

  // Actions
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

export interface UseMfaReturn {
  // State
  transaction: MFATransaction | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  initiateChallenge: (method: 'sms' | 'voice' | 'push', contextId: string, transactionId: string, mfaOptionId?: number) => Promise<MFAChallengeResponse>;
  verifyOtp: (contextId: string, transactionId: string, otp: string) => Promise<MFAVerifyResponse>;
  verifyPush: (contextId: string, transactionId: string) => Promise<MFAVerifyResponse>;
  pollPushStatus: (contextId: string, transactionId: string) => Promise<MFAVerifyResponse>;
  cancelTransaction: () => void;
}


// Service Configuration
export interface ServiceConfig {
  baseURL: string;
  timeout?: number;
  retries?: number;
  debug?: boolean;
}