// Core API types matching the OpenAPI specification v2.0.0

export interface LoginRequest {
  username: string;
  password: string;
  app_id: string;
  app_version: string;
  drs_action_token?: string;
}

export interface LoginSuccessResponse {
  responseTypeCode: 'SUCCESS';
  access_token: string;
  id_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  session_id: string;
  device_bound: boolean;
}

export interface MFARequiredResponse {
  responseTypeCode: 'MFA_REQUIRED';
  otp_methods: Array<{
    value: string;
    mfa_option_id: number;
  }>;
  mobile_approve_status: 'NOT_REGISTERED' | 'ENABLED' | 'DISABLED';
  session_id: string;
  transaction_id: string;
}

export interface ESignRequiredResponse {
  responseTypeCode: 'ESIGN_REQUIRED';
  session_id: string;
  transaction_id: string;
  esign_document_id: string;
  esign_url: string;
  is_mandatory: boolean;
}

export type LoginResponse = LoginSuccessResponse | MFARequiredResponse | ESignRequiredResponse;

export interface MFAChallengeRequest {
  transaction_id: string;
  method: 'otp' | 'push';
  mfa_option_id?: number;
}

export interface MFAChallengeResponse {
  success: boolean;
  transaction_id: string;
  challenge_status: MFAChallengeStatus;
  expires_at: string;
  display_number?: number;
}

export interface MFAVerifyRequest {
  transaction_id: string;
  method: 'otp' | 'push';
  code?: string;
}

export interface MFAVerifySuccessResponse {
  success: boolean;
  access_token: string;
  id_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  session_id: string;
  transaction_id: string;
  device_bound: boolean;
}

export type MFAVerifyResponse = MFAVerifySuccessResponse | ESignRequiredResponse;

export interface MFATransactionStatusResponse {
  transaction_id: string;
  challenge_status: MFAChallengeStatus;
  updated_at: string;
  expires_at: string;
  display_number?: number;
  selected_number?: number;
}

export interface MFAApproveRequest {
  selected_number: number;
}

export interface MFAApproveResponse {
  success: boolean;
  transaction_id: string;
  challenge_status: 'APPROVED';
}

export type MFAChallengeStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface OTPResponse {
  otp: string;
  message?: string;
}

export interface TokenRefreshRequest {
  refresh_token?: string;
}

export interface TokenRefreshResponse {
  success: boolean;
  access_token: string;
  token_type: string;
  expires_in: number;
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
}

export interface IntrospectionResponse {
  active: boolean;
  scope?: string;
  client_id?: string;
  username?: string;
  token_type?: string;
  exp?: number;
  iat?: number;
  sub?: string;
  aud?: string;
  iss?: string;
  jti?: string;
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
  error_code: string;
  message: string;
  timestamp?: string;
  details?: Record<string, unknown>;
}

// Internal types for business logic

export interface User {
  id: string;
  username: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  roles: string[];
  isLocked: boolean;
  mfaLocked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  sessionId: string;
  userId: string;
  deviceId?: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  ip?: string;
  userAgent?: string;
  isActive: boolean;
}

export interface MFATransaction {
  transactionId: string;
  userId: string;
  sessionId?: string;
  method: 'otp' | 'push';
  status: MFAChallengeStatus;
  challengeId?: string;
  otp?: string;
  createdAt: Date;
  expiresAt: Date;
  updatedAt: Date;
}

export interface RefreshToken {
  tokenId: string;
  userId: string;
  sessionId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  isRevoked: boolean;
}

export interface JWTPayload {
  sub: string;
  iat: number;
  exp: number;
  aud: string;
  iss: string;
  jti: string;
  sessionId: string;
  roles?: string[];
}

export interface JWKSKey {
  kty: string;
  use: string;
  key_ops: string[];
  alg: string;
  kid: string;
  n?: string;
  e?: string;
  x5c?: string[];
  x5t?: string;
  'x5t#S256'?: string;
}

export interface JWKSResponse {
  keys: JWKSKey[];
}

export interface OIDCConfiguration {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  revocation_endpoint: string;
  introspection_endpoint: string;
  jwks_uri: string;
  response_types_supported: string[];
  subject_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
  scopes_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  claims_supported: string[];
  code_challenge_methods_supported: string[];
}

// Express.js extensions
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      sessionId?: string;
    }
  }
}

// Utility types
export type AuthenticatedRequest = Express.Request & {
  user: JWTPayload;
};

export type UserScenario = 'SUCCESS' | 'ACCOUNT_LOCKED' | 'MFA_LOCKED' | 'INVALID_CREDENTIALS';

export interface MockUserScenario {
  type: UserScenario;
  user?: User;
}

// eSign Types
export interface ESignDocument {
  documentId: string;
  title: string;
  content: string;
  version: string;
  mandatory: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ESignAcceptanceRequest {
  transaction_id: string;
  document_id: string;
  acceptance_ip?: string;
  acceptance_timestamp?: string;
}

export interface ESignAcceptResponse {
  responseTypeCode: 'SUCCESS';
  access_token: string;
  id_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  session_id: string;
  transaction_id: string;
  esign_accepted: boolean;
  esign_accepted_at: string;
  device_bound: boolean;
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