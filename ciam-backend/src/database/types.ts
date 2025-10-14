/**
 * Kysely Type Definitions
 *
 * Type-safe database schema definitions for Kysely ORM
 * These types correspond to the PostgreSQL schema in schema-setup.sql
 *
 * IMPORTANT: Keep these types in sync with the database schema
 */

import { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

// Re-export Kysely helper types for repositories
export type { Insertable, Selectable, Updateable };

/**
 * Helper type for timestamp columns
 * - PostgreSQL TIMESTAMP WITH TIME ZONE maps to Date in TypeScript
 * - Insert: Date or string
 * - Select: Date
 * - Update: Date or string
 */
export type Timestamp = ColumnType<Date, Date | string, Date | string>;

/**
 * Helper type for auto-incrementing primary keys
 */
export type GeneratedId = Generated<number>;

// ============================================================================
// AUTH_CONTEXTS TABLE
// ============================================================================

export interface AuthContextsTable {
  context_id: string; // PRIMARY KEY - UUID or session-based ID
  guid: string; // Customer-level identifier (NOT NULL)
  cupid: string; // User identifier from LDAP (NOT NULL)
  app_id: string;
  app_version: string;
  ip_address: string | null;
  user_agent: string | null;
  device_fingerprint: string | null;
  correlation_id: string | null; // External correlation ID for tracking
  requires_additional_steps: boolean; // Whether additional auth steps are required
  auth_outcome: string | null; // Final authentication outcome
  completed_at: Timestamp | null; // When auth flow completed
  created_at: Timestamp;
  updated_at: Timestamp;
  expires_at: Timestamp;
}

export type AuthContext = Selectable<AuthContextsTable>;
export type NewAuthContext = Insertable<AuthContextsTable>;
export type AuthContextUpdate = Updateable<AuthContextsTable>;

// ============================================================================
// AUTH_TRANSACTIONS TABLE
// ============================================================================

export type TransactionPhase = 'MFA' | 'ESIGN' | 'DEVICE_BIND';
export type TransactionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'COMPLETED' | 'CONSUMED';
export type MfaMethod = 'SMS' | 'VOICE' | 'PUSH' | 'TOTP';
export type MobileApproveStatus = 'NOT_REGISTERED' | 'ENABLED' | 'DISABLED';
export type VerificationResult = 'SUCCESS' | 'FAILURE' | 'TIMEOUT';
export type EsignAction = 'ACCEPT' | 'DECLINE' | 'SKIP';
export type DeviceBindDecision = 'BIND' | 'SKIP';

export interface AuthTransactionsTable {
  transaction_id: string; // PRIMARY KEY - UUID
  context_id: string; // FOREIGN KEY to auth_contexts
  parent_transaction_id: string | null; // FOREIGN KEY to auth_transactions (for retry chains)
  sequence_number: number; // Sequential order within context
  phase: TransactionPhase; // MFA, ESIGN, or DEVICE_BIND
  transaction_status: TransactionStatus;

  // MFA phase-specific columns
  mfa_method: MfaMethod | null; // SMS, VOICE, PUSH, TOTP
  mfa_option_id: number | null; // Selected MFA option ID
  mfa_options: ColumnType<Array<unknown>, string | Array<unknown>, string | Array<unknown>> | null; // JSONB array of available options
  mobile_approve_status: MobileApproveStatus | null; // NOT_REGISTERED, ENABLED, DISABLED
  display_number: number | null; // Number shown to user for push approval
  selected_number: number | null; // Number selected by user
  verification_result: VerificationResult | null; // SUCCESS, FAILURE, TIMEOUT
  attempt_number: number | null; // Retry attempt count

  // ESIGN phase-specific columns
  esign_document_id: string | null; // Document requiring signature
  esign_action: EsignAction | null; // ACCEPT, DECLINE, SKIP

  // DEVICE_BIND phase-specific columns
  device_bind_decision: DeviceBindDecision | null; // BIND, SKIP

  // Flexible metadata for additional context
  metadata: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>> | null; // JSONB

  created_at: Timestamp;
  updated_at: Timestamp;
  expires_at: Timestamp;
}

export type AuthTransaction = Selectable<AuthTransactionsTable>;
export type NewAuthTransaction = Insertable<AuthTransactionsTable>;
export type AuthTransactionUpdate = Updateable<AuthTransactionsTable>;

// ============================================================================
// SESSIONS TABLE
// ============================================================================

export type SessionStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'LOGGED_OUT';

export interface SessionsTable {
  session_id: string; // PRIMARY KEY - UUID
  cupid: string; // User identifier (from LDAP)
  context_id: string | null; // FOREIGN KEY to auth_contexts
  device_id: string | null;
  status: SessionStatus; // ACTIVE, EXPIRED, REVOKED, LOGGED_OUT
  created_at: Timestamp;
  last_seen_at: Timestamp;
  expires_at: Timestamp;
  revoked_at: Timestamp | null; // When session was revoked
  revoked_by: string | null; // Who revoked the session (cupid or 'SYSTEM')
  revocation_reason: string | null; // Why session was revoked
  ip_address: string | null;
  user_agent: string | null;
}

export type Session = Selectable<SessionsTable>;
export type NewSession = Insertable<SessionsTable>;
export type SessionUpdate = Updateable<SessionsTable>;

// ============================================================================
// TOKENS TABLE (ACCESS, REFRESH, ID)
// ============================================================================

export type TokenType = 'ACCESS' | 'REFRESH' | 'ID';
export type TokenStatus = 'ACTIVE' | 'ROTATED' | 'REVOKED' | 'EXPIRED';

export interface TokensTable {
  token_id: string; // PRIMARY KEY - UUID
  session_id: string; // FOREIGN KEY to sessions - ONLY foreign key
  parent_token_id: string | null; // FOREIGN KEY - token rotation chain (UUID)
  token_type: TokenType; // ACCESS, REFRESH, or ID
  token_value: string; // Actual JWT token
  token_value_hash: string; // SHA-256 hash for fast lookup
  status: TokenStatus; // ACTIVE, ROTATED, REVOKED, EXPIRED
  created_at: Timestamp;
  expires_at: Timestamp;
  revoked_at: Timestamp | null;
}

export type Token = Selectable<TokensTable>;
export type NewToken = Insertable<TokensTable>;
export type TokenUpdate = Updateable<TokensTable>;

// ============================================================================
// TRUSTED_DEVICES TABLE
// ============================================================================

export type DeviceStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

export interface TrustedDevicesTable {
  device_id: string; // PRIMARY KEY - UUID
  guid: string; // Customer-level identifier (NOT NULL)
  cupid: string; // User identifier (NOT NULL)
  device_fingerprint_hash: string; // SHA-256 hash (UNIQUE per user)
  device_name: string | null;
  app_id: string | null; // Application ID that created the trust
  device_type: string | null; // Device type (mobile, desktop, etc.)
  status: DeviceStatus; // ACTIVE, REVOKED, EXPIRED
  trusted_at: Timestamp;
  last_used_at: Timestamp;
  expires_at: Timestamp;
  revoked_at: Timestamp | null; // When device trust was revoked
}

export type TrustedDevice = Selectable<TrustedDevicesTable>;
export type NewTrustedDevice = Insertable<TrustedDevicesTable>;
export type TrustedDeviceUpdate = Updateable<TrustedDevicesTable>;

// ============================================================================
// DRS_EVALUATIONS TABLE (Device Risk Service)
// ============================================================================

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type DrsAction = 'ALLOW' | 'CHALLENGE' | 'BLOCK';

export interface DrsEvaluationsTable {
  evaluation_id: string; // PRIMARY KEY - UUID
  context_id: string; // FOREIGN KEY to auth_contexts
  guid: string; // Customer-level identifier (NOT NULL)
  cupid: string; // User identifier (NOT NULL)
  action_token_hash: string; // SHA-256 hash of DRS action token (UNIQUE)
  risk_level: RiskLevel;
  risk_score: number; // 0-100
  recommended_action: DrsAction;
  risk_factors: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>; // JSONB
  evaluated_at: Timestamp;
  expires_at: Timestamp;
}

export type DrsEvaluation = Selectable<DrsEvaluationsTable>;
export type NewDrsEvaluation = Insertable<DrsEvaluationsTable>;
export type DrsEvaluationUpdate = Updateable<DrsEvaluationsTable>;

// ============================================================================
// AUDIT_LOGS TABLE
// ============================================================================

export type AuditCategory =
  | 'AUTH'
  | 'MFA'
  | 'SESSION'
  | 'TOKEN'
  | 'DEVICE'
  | 'ESIGN'
  | 'SECURITY'
  | 'ADMIN';

export type AuditAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'MFA_INITIATED'
  | 'MFA_SUCCESS'
  | 'MFA_FAILURE'
  | 'SESSION_CREATED'
  | 'SESSION_EXPIRED'
  | 'TOKEN_ISSUED'
  | 'TOKEN_REFRESHED'
  | 'TOKEN_REVOKED'
  | 'DEVICE_TRUSTED'
  | 'DEVICE_BLOCKED'
  | 'ESIGN_ACCEPTED'
  | 'ESIGN_DECLINED'
  | 'ACCOUNT_LOCKED'
  | 'SUSPICIOUS_ACTIVITY';

export interface AuditLogsTable {
  audit_id: string; // PRIMARY KEY - UUID
  context_id: string | null; // FOREIGN KEY to auth_contexts
  cupid: string | null; // User identifier (nullable for system events)
  category: AuditCategory;
  action: AuditAction;
  details: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>; // JSONB
  ip_address: string | null;
  user_agent: string | null;
  created_at: Timestamp;
}

export type AuditLog = Selectable<AuditLogsTable>;
export type NewAuditLog = Insertable<AuditLogsTable>;

// ============================================================================
// DATABASE INTERFACE
// ============================================================================

/**
 * Complete database schema interface for Kysely
 * This interface defines all tables and their relationships
 */
export interface Database {
  auth_contexts: AuthContextsTable;
  auth_transactions: AuthTransactionsTable;
  sessions: SessionsTable;
  tokens: TokensTable; // Unified tokens table (ACCESS, REFRESH, ID)
  trusted_devices: TrustedDevicesTable;
  drs_evaluations: DrsEvaluationsTable;
  audit_logs: AuditLogsTable;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Helper type to extract table names
 */
export type TableName = keyof Database;

/**
 * Helper type for transaction callbacks
 */
export type TransactionCallback<T> = (trx: any) => Promise<T>;
