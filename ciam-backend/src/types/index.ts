// Core API types matching the OpenAPI specification

export interface LoginRequest {
  username: string;
  password: string;
  drs_action_token?: string;
}

export interface LoginResponse {
  responseTypeCode: 'SUCCESS' | 'MFA_REQUIRED';
  message?: string;
  id_token?: string;
  access_token?: string;
  refresh_token?: string;
  sessionId: string;
  transactionId?: string;
  deviceId?: string;
}

export interface MFAChallengeRequest {
  username?: string;
  method: 'otp' | 'push';
  sessionId?: string;
  transactionId?: string;
}

export interface MFAChallengeResponse {
  challengeId?: string;
  transactionId: string;
  challengeStatus: MFAChallengeStatus;
  expiresAt: string;
  message?: string;
}

export interface MFAVerifyRequest {
  transactionId: string;
  otp?: string;
  pushResult?: 'APPROVED' | 'REJECTED';
}

export interface MFAVerifyResponse {
  id_token: string;
  access_token: string;
  refresh_token?: string;
  sessionId: string;
  transactionId: string;
  message?: string;
}

export interface MFATransactionStatusResponse {
  transactionId: string;
  challengeStatus: MFAChallengeStatus;
  updatedAt: string;
  expiresAt: string;
  message?: string;
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
  code: string;
  message: string;
  timestamp: string;
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