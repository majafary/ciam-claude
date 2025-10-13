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
  user_id: string | null; // Reference to user (from LDAP/external auth)
  app_id: string;
  app_version: string;
  ip_address: string | null;
  user_agent: string | null;
  device_fingerprint: string | null;
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

export type TransactionType = 'MFA' | 'ESIGN' | 'DEVICE_BIND';
export type TransactionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'COMPLETED';

export interface AuthTransactionsTable {
  transaction_id: string; // PRIMARY KEY - UUID
  context_id: string; // FOREIGN KEY to auth_contexts
  transaction_type: TransactionType;
  transaction_status: TransactionStatus;
  metadata: ColumnType<Record<string, unknown>, string | Record<string, unknown>, string | Record<string, unknown>>; // JSONB
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

export interface SessionsTable {
  session_id: string; // PRIMARY KEY - UUID
  cupid: string; // User identifier (from LDAP)
  context_id: string | null; // FOREIGN KEY to auth_contexts
  device_id: string | null;
  created_at: Timestamp;
  last_seen_at: Timestamp;
  expires_at: Timestamp;
  ip_address: string | null;
  user_agent: string | null;
  is_active: boolean;
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
  token_id: GeneratedId; // PRIMARY KEY - SERIAL
  session_id: string; // FOREIGN KEY to sessions - ONLY foreign key
  parent_token_id: number | null; // FOREIGN KEY - token rotation chain
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

export interface TrustedDevicesTable {
  device_id: GeneratedId; // PRIMARY KEY - SERIAL
  user_id: string;
  device_fingerprint_hash: string; // SHA-256 hash (UNIQUE per user)
  device_name: string | null;
  trusted_at: Timestamp;
  last_used_at: Timestamp;
  expires_at: Timestamp;
  is_active: boolean;
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
  evaluation_id: GeneratedId; // PRIMARY KEY - SERIAL
  context_id: string; // FOREIGN KEY to auth_contexts
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
  log_id: GeneratedId; // PRIMARY KEY - SERIAL
  context_id: string | null; // FOREIGN KEY to auth_contexts
  user_id: string | null;
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
