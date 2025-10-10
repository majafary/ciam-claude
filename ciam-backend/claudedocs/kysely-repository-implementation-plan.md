# Kysely Repository Pattern Implementation Plan
## Zero-Breakage Migration to PostgreSQL with In-Memory Mock Support

**Document Version:** 1.0
**Date:** 2025-01-10
**Status:** Ready for Implementation
**Estimated Time:** 9-13 hours

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Current Architecture Analysis](#current-architecture-analysis)
3. [Design Decisions](#design-decisions)
4. [Implementation Phases](#implementation-phases)
5. [Detailed Implementation Steps](#detailed-implementation-steps)
6. [Testing Strategy](#testing-strategy)
7. [Rollback Plan](#rollback-plan)
8. [Appendix](#appendix)

---

## Executive Summary

### Objective
Implement Kysely-based repository pattern with PostgreSQL support while maintaining 100% backward compatibility with existing mock-based implementation. The system will support both in-memory mock database (for development/testing) and real PostgreSQL (for production) via a feature flag.

### Critical Requirements
- ✅ **Zero API Changes**: All endpoints return identical responses
- ✅ **Preserve Transaction Flow**: context_id + transaction_id chain must work identically
- ✅ **Test User Compatibility**: All existing test users must continue working
- ✅ **Business Logic Preservation**: MFA invalidation, token rotation, session management unchanged
- ✅ **Feature Flag Support**: `USE_MOCK_DB` flag for instant rollback
- ✅ **Production-Grade**: Connection pooling, singleton pattern, high-volume optimization

### Architecture Approach
- **Repository Pattern**: Clean separation of data access from business logic
- **Dual-Mode Operation**: Kysely adapter works with both mock (in-memory) and real (PostgreSQL) backends
- **Singleton Pattern**: Single Kysely instance with connection pooling
- **No Controller Changes**: Controllers remain completely unchanged
- **Service Layer Refactoring**: Services use repositories instead of in-memory Maps

---

## Current Architecture Analysis

### 1. Critical Transaction Flow (MUST PRESERVE)

```
┌─────────────────────────────────────────────────────────────────────┐
│ AUTHENTICATION FLOW WITH context_id + transaction_id CHAIN          │
└─────────────────────────────────────────────────────────────────────┘

Step 1: Login
├─ POST /auth/login
├─ Creates: session_id (used as context_id)
├─ Returns: context_id, transaction_id (tx-{timestamp}-{random})
└─ Response: 200 MFA_REQUIRED

Step 2: MFA Initiate
├─ POST /auth/mfa/initiate
├─ Input: context_id (from step 1), transaction_id, method
├─ Action: INVALIDATES all pending transactions for context_id
├─ Creates: NEW transaction_id
├─ Returns: NEW transaction_id
└─ Response: 200 with new transaction_id

Step 3: MFA Verify (OTP or Push)
├─ POST /auth/mfa/otp/verify OR POST /auth/mfa/transactions/{id}
├─ Input: context_id, transaction_id (from step 2)
├─ Action: Verifies and consumes transaction
├─ Generates: access_token, id_token, refresh_token
└─ Response: 201 SUCCESS with tokens

Step 4: eSign (Optional)
├─ POST /auth/esign/accept
├─ Input: context_id, transaction_id, document_id
├─ Action: Records acceptance
├─ Generates: tokens
└─ Response: 201 SUCCESS with tokens

Step 5: Device Bind (Optional)
├─ POST /auth/device/bind
├─ Input: context_id, transaction_id, bind_device (boolean)
├─ Action: Trusts device or skips
├─ Returns: tokens with device_bound flag
└─ Response: 200 SUCCESS with tokens

KEY INVARIANTS:
• context_id STAYS THE SAME throughout entire flow
• transaction_id CHANGES at each step
• Each new MFA attempt INVALIDATES previous pending transactions for same context
• Session ID doubles as context_id
```

### 2. Existing Test Users (MUST RETAIN)

```typescript
Test Users:
1. testuser / password
   → SUCCESS: Simple login, no MFA required
   → Expected: 201 with tokens

2. userlockeduser / password
   → ACCOUNT_LOCKED: User account is locked
   → Expected: 423 with error code CIAM_E01_01_002

3. mfalockeduser / password
   → MFA_LOCKED: MFA is locked for this account
   → Expected: 423 with error code CIAM_E01_01_005

4. mfauser / password (MFA scenarios)
   → Push auto-approve: 5 second delay, status changes to APPROVED
   → Push fail: 7 second delay, status changes to REJECTED
   → Push expired: Never resolves, stays PENDING
   → OTP verify: Code "1234" is valid
```

### 3. Current Service Implementation

#### MFA Service (mfaService.ts)
```typescript
Location: src/services/mfaService.ts
Storage: const mockTransactions: Map<string, MFATransaction>

Key Functions:
• createMFATransaction(contextId, userId, method, sessionId, mfaOptionId)
  - Calls invalidatePendingTransactions(contextId) first
  - Creates new transaction with status PENDING
  - Returns transaction with optional displayNumber (for push)
  - Simulates push response with setTimeout

• invalidatePendingTransactions(contextId)
  - Finds all transactions with matching contextId and status PENDING
  - Sets their status to EXPIRED
  - Returns count of invalidated transactions

• getMFATransaction(transactionId)
  - Returns transaction by ID
  - Auto-expires if past expiresAt date

• verifyOTP(transactionId, code)
  - Validates OTP code (correct code is "1234")
  - Updates transaction status to APPROVED on success
  - Returns success/error

• approvePushWithNumber(transactionId, selectedNumber)
  - Approves push notification
  - Updates transaction status to APPROVED
  - Returns success/error

CRITICAL: Transaction expiry is 2 minutes (120 seconds)
CRITICAL: Push simulation uses setTimeout with delays:
  - mfauser: 5 seconds → APPROVED
  - pushfail: 7 seconds → REJECTED
  - pushexpired: never resolves → stays PENDING
```

#### Session Service (sessionService.ts)
```typescript
Location: src/services/sessionService.ts
Storage: const mockSessions: Map<string, Session>

Key Functions:
• createSession(userId, ip, userAgent)
  - Generates session_id: `sess-${uuidv4()}`
  - Sets expiry: 24 hours from creation
  - Returns Session object

• getSessionById(sessionId)
  - Returns session or null
  - Auto-revokes if expired

• verifySession(sessionId)
  - Returns boolean if session is active

• updateSessionActivity(sessionId)
  - Updates lastSeenAt timestamp

• revokeSession(sessionId)
  - Sets isActive to false
  - Returns boolean success

• revokeAllUserSessions(userId)
  - Revokes all active sessions for user
  - Returns count revoked

CRITICAL: Session expiry is 24 hours
CRITICAL: Session ID is used as context_id in auth flow
```

#### Token Service (tokenService.ts)
```typescript
Location: src/services/tokenService.ts
Storage: const mockRefreshTokens: Map<string, RefreshToken>

Key Functions:
• createRefreshToken(userId, sessionId)
  - Generates JWT refresh token
  - Sets expiry: 14 days
  - Returns RefreshToken object

• validateRefreshToken(token)
  - Checks if token exists, not revoked, not expired
  - Returns validation result with token object

• rotateRefreshToken(oldToken, userId, sessionId)
  - Validates old token
  - Revokes old token
  - Creates new token
  - Detects token reuse (security feature)

• revokeRefreshToken(token)
  - Sets isRevoked to true

• revokeAllUserRefreshTokens(userId)
  - Revokes all tokens for user
  - Returns count revoked

CRITICAL: Refresh token expiry is 14 days
CRITICAL: Token rotation must detect reuse attacks
```

#### User Service (userService.ts)
```typescript
Location: src/services/userService.ts
Storage: const mockUsers: Record<string, User>

Key Functions:
• validateCredentials(username, password)
  - Returns MockUserScenario (SUCCESS, ACCOUNT_LOCKED, MFA_LOCKED, INVALID_CREDENTIALS)
  - All test users use password "password"

• getUserById(userId)
  - Returns User or null

• getUserByUsername(username)
  - Returns User or null

• isUserLocked(userId)
  - Returns boolean

• isUserMFALocked(userId)
  - Returns boolean

CRITICAL: This service is for LDAP integration mock
CRITICAL: Does NOT use PostgreSQL - stays as-is
CRITICAL: Returns user data (cupid, guid, username, roles) from LDAP
```

#### eSign Service (esignService.ts)
```typescript
Location: src/services/esignService.ts
Storage: const mockDocuments: Map<string, ESignDocument>

Key Functions:
• getESignDocumentById(documentId)
  - Returns document or null

• needsESign(userId)
  - Returns { required, documentId, isMandatory }

• recordESignAcceptance(userId, documentId, acceptanceIp, acceptanceTimestamp)
  - Records acceptance (currently just logs)
  - Returns { success, acceptedAt }

CRITICAL: eSign is part of auth transaction flow
CRITICAL: Will use AuthTransactionRepository for tracking acceptance
```

---

## Design Decisions

### 1. Feature Flag Architecture

```typescript
Environment Variable: USE_MOCK_DB
Default: true (for development)
Values: "true" | "false"

Usage:
• true: Uses in-memory mock Kysely adapter (no PostgreSQL needed)
• false: Uses real PostgreSQL connection via Kysely

Initialization:
const db = USE_MOCK_DB
  ? createMockKyselyInstance()
  : createRealKyselyInstance(DATABASE_URL);

Rollback:
• Set USE_MOCK_DB=true
• Restart application
• Instant rollback to mock mode
```

### 2. Data Mapping Strategy

```
Mock Data Structure → Repository → PostgreSQL Schema

MFATransaction (mock) → AuthTransactionRepository → auth_transactions table
├─ transactionId       → transaction_id
├─ contextId           → context_id
├─ userId              → (not stored, comes from LDAP)
├─ method              → mfa_method
├─ status              → transaction_status
├─ displayNumber       → metadata->display_number
├─ challengeId         → metadata->challenge_id
├─ otp                 → metadata->otp (mock only, not stored in prod)
└─ expiresAt           → expires_at

Session (mock) → SessionRepository → sessions table
├─ sessionId           → session_id
├─ userId              → cupid (LDAP user ID)
├─ deviceId            → device_fingerprint
├─ expiresAt           → expires_at
├─ isActive            → status ('ACTIVE' | 'REVOKED')
└─ lastSeenAt          → last_activity_at

RefreshToken (mock) → TokenRepository → tokens table
├─ tokenId             → token_id
├─ token               → token_value (JWT)
├─ userId              → (linked via session->cupid)
├─ sessionId           → session_id
├─ expiresAt           → expires_at
├─ isRevoked           → status ('ACTIVE' | 'REVOKED')
└─ createdAt           → created_at
```

### 3. Repository Pattern Structure

```typescript
Base Repository (Abstract):
• Provides common CRUD operations
• Transaction support
• Error handling
• Logging

Specialized Repositories:
1. AuthContextRepository
   - Tracks authentication journey
   - Links to all transactions in flow

2. AuthTransactionRepository ⭐ CRITICAL
   - Handles MFA, eSign, device bind transactions
   - Implements invalidation logic
   - Sequence tracking per context

3. SessionRepository
   - Session lifecycle management
   - Multi-device support

4. TokenRepository
   - Token CRUD with rotation chains
   - Batch creation (access, refresh, id)

5. TrustedDeviceRepository
   - Device trust for MFA skip

6. DrsEvaluationRepository
   - Device Risk Service integration

7. AuditLogRepository
   - Complete audit trail
```

### 4. Mock Kysely Adapter Design

```typescript
Requirements:
• Implements Kysely query builder API
• Uses in-memory Maps for storage
• Supports transactions (with rollback)
• Type-safe (same types as real Kysely)
• Fast (no I/O, pure in-memory)

Implementation:
class MockKyselyAdapter {
  private stores: {
    auth_contexts: Map<string, AuthContext>;
    auth_transactions: Map<string, AuthTransaction>;
    sessions: Map<string, Session>;
    tokens: Map<string, Token>;
    trusted_devices: Map<string, TrustedDevice>;
    drs_evaluations: Map<string, DrsEvaluation>;
    audit_logs: Map<string, AuditLog>;
  };

  // Kysely query builder API
  selectFrom(table: string): MockSelectQueryBuilder
  insertInto(table: string): MockInsertQueryBuilder
  updateTable(table: string): MockUpdateQueryBuilder
  deleteFrom(table: string): MockDeleteQueryBuilder
  transaction(): MockTransaction
}

Benefits:
• No code changes needed in repositories
• Repositories work identically with mock or real DB
• Type safety ensures compatibility
• Can switch between mock/real at runtime
```

### 5. Connection Pooling Configuration

```typescript
PostgreSQL Connection Pool (Production):
{
  min: 10,              // Minimum connections
  max: 50,              // Maximum connections
  idleTimeoutMillis: 30000,    // 30 seconds
  connectionTimeoutMillis: 10000,  // 10 seconds
  maxUses: 7500,        // Recycle connection after 7500 uses
}

Mock Mode:
• No connection pool (in-memory)
• Instant responses
• No connection overhead
```

### 6. Service Layer Refactoring Strategy

```
Approach: Minimal Changes, Maximum Compatibility

Before (mfaService.ts):
const mockTransactions: Map<string, MFATransaction> = new Map();

export const createMFATransaction = async (contextId, userId, method, sessionId, mfaOptionId) => {
  await invalidatePendingTransactions(contextId);
  const transaction = { /* ... */ };
  mockTransactions.set(transactionId, transaction);
  return transaction;
};

After (mfaService.ts):
import { getAuthTransactionRepository } from '../repositories';

const repo = getAuthTransactionRepository(); // Returns mock or real based on flag

export const createMFATransaction = async (contextId, userId, method, sessionId, mfaOptionId) => {
  await repo.expirePendingByContext(contextId); // Same logic, different backend
  const transaction = await repo.create({ /* ... */ });
  return mapToMFATransaction(transaction); // Convert DB format to service format
};

Key Points:
• Same function signatures (no breaking changes)
• Same business logic (invalidation, validation, etc.)
• Same return types
• Different backend (repo instead of Map)
• Mapping layer converts between DB and service types
```

---

## Implementation Phases

### Phase 1: Foundation & Infrastructure
**Goal**: Set up database layer without touching existing services
**Duration**: 2-3 hours
**Risk**: Low (additive only, no changes to existing code)

### Phase 2: Repository Implementation
**Goal**: Create all repository classes with mock adapter
**Duration**: 3-4 hours
**Risk**: Low (repositories not yet used by services)

### Phase 3: Service Layer Refactoring
**Goal**: Refactor services to use repositories
**Duration**: 3-4 hours
**Risk**: Medium (changes existing services, requires careful testing)

### Phase 4: Testing & Validation
**Goal**: Ensure 100% backward compatibility
**Duration**: 2-3 hours
**Risk**: Critical (must validate everything works identically)

### Phase 5: Production Readiness
**Goal**: Documentation, Docker setup, deployment preparation
**Duration**: 1 hour
**Risk**: Low (documentation and tooling)

---

## Detailed Implementation Steps

### PHASE 1: Foundation & Infrastructure

#### Task 1.1: Install Dependencies
```bash
# Location: ciam-backend/
cd ciam-backend

# Install runtime dependencies
npm install kysely pg

# Install dev dependencies
npm install --save-dev @types/pg

# Verify installation
npm list kysely pg
```

**Expected Output:**
```
ciam-backend@1.0.0
├── kysely@0.27.x
└── pg@8.11.x
```

**Validation:**
- [ ] kysely installed successfully
- [ ] pg installed successfully
- [ ] @types/pg installed successfully
- [ ] No dependency conflicts
- [ ] package.json updated

---

#### Task 1.2: Create Database Configuration

**File**: `src/config/database.ts`

```typescript
import { Pool, PoolConfig } from 'pg';

/**
 * Database configuration with feature flag support
 */
export interface DatabaseConfig {
  useMock: boolean;
  postgresql?: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    pool: PoolConfig;
  };
}

/**
 * Load database configuration from environment variables
 */
export function getDatabaseConfig(): DatabaseConfig {
  const useMock = process.env.USE_MOCK_DB !== 'false';

  if (useMock) {
    console.log('[Database] Using in-memory mock database');
    return { useMock: true };
  }

  // Real PostgreSQL configuration
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required when USE_MOCK_DB=false');
  }

  // Parse DATABASE_URL or use individual env vars
  const config: DatabaseConfig = {
    useMock: false,
    postgresql: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'ciam',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      pool: {
        min: parseInt(process.env.DB_POOL_MIN || '10'),
        max: parseInt(process.env.DB_POOL_MAX || '50'),
        idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
        connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'),
      }
    }
  };

  console.log('[Database] Using PostgreSQL:', config.postgresql?.host);
  return config;
}

/**
 * Validate database configuration
 */
export function validateDatabaseConfig(config: DatabaseConfig): void {
  if (!config.useMock && !config.postgresql) {
    throw new Error('PostgreSQL configuration is required when USE_MOCK_DB=false');
  }

  if (config.postgresql) {
    const required = ['host', 'port', 'database', 'user', 'password'];
    for (const field of required) {
      if (!config.postgresql[field as keyof typeof config.postgresql]) {
        throw new Error(`Missing required PostgreSQL config: ${field}`);
      }
    }
  }
}
```

**Validation:**
- [ ] File created at correct location
- [ ] Exports getDatabaseConfig function
- [ ] Exports validateDatabaseConfig function
- [ ] Handles USE_MOCK_DB environment variable
- [ ] Handles DATABASE_URL parsing
- [ ] Handles individual DB_* environment variables
- [ ] Connection pool configuration included
- [ ] Type definitions are correct

---

#### Task 1.3: Generate Kysely Type Definitions

**File**: `src/database/types.ts`

```typescript
import { Generated, Insertable, Selectable, Updateable } from 'kysely';

/**
 * Database schema types generated from schema-setup.sql
 */

// auth_contexts table
export interface AuthContextTable {
  context_id: string;
  cupid: string | null;
  guid: string | null;
  correlation_id: string | null;
  app_id: string;
  app_version: string;
  outcome: 'SUCCESS' | 'FAILURE' | 'ABANDONED' | 'IN_PROGRESS';
  ip_address: string | null;
  user_agent: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  expires_at: Date;
}

// auth_transactions table
export interface AuthTransactionTable {
  transaction_id: string;
  context_id: string;
  transaction_type: 'MFA_VERIFY' | 'MFA_PUSH_VERIFY' | 'ESIGN_ACCEPT' | 'DEVICE_BIND';
  transaction_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CONSUMED';
  phase: 'MFA' | 'ESIGN' | 'DEVICE_BIND';
  mfa_method: 'SMS' | 'VOICE' | 'PUSH' | null;
  mfa_option_id: number | null;
  esign_document_id: string | null;
  device_bind_decision: boolean | null;
  metadata: Record<string, any> | null;
  sequence_number: number;
  consumed_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  expires_at: Date;
}

// sessions table
export interface SessionTable {
  session_id: string;
  context_id: string;
  cupid: string;
  device_fingerprint: string | null;
  ip_address: string | null;
  user_agent: string | null;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  revoke_reason: string | null;
  last_activity_at: Generated<Date>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  expires_at: Date;
}

// tokens table
export interface TokenTable {
  token_id: Generated<number>;
  session_id: string;
  token_type: 'ACCESS' | 'REFRESH' | 'ID';
  token_value: string;
  token_value_hash: string;
  parent_token_id: number | null;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'ROTATED';
  revoke_reason: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  expires_at: Date;
}

// trusted_devices table
export interface TrustedDeviceTable {
  device_id: Generated<number>;
  cupid: string;
  device_fingerprint: string;
  device_fingerprint_hash: string;
  app_id: string;
  device_name: string | null;
  device_type: string | null;
  os_version: string | null;
  app_version: string | null;
  status: 'TRUSTED' | 'REVOKED';
  revoke_reason: string | null;
  last_used_at: Generated<Date>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  expires_at: Date;
}

// drs_evaluations table
export interface DrsEvaluationTable {
  evaluation_id: Generated<number>;
  context_id: string;
  drs_action_token: string | null;
  drs_action_token_hash: string | null;
  risk_score: number | null;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  recommendation: 'ALLOW' | 'CHALLENGE' | 'DENY' | null;
  device_id: string | null;
  device_reputation: string | null;
  behavioral_score: number | null;
  velocity_score: number | null;
  location_risk: string | null;
  evaluation_metadata: Record<string, any> | null;
  created_at: Generated<Date>;
}

// audit_logs table
export interface AuditLogTable {
  log_id: Generated<number>;
  event_timestamp: Generated<Date>;
  context_id: string | null;
  transaction_id: string | null;
  session_id: string | null;
  cupid: string | null;
  event_type: string;
  event_category: 'AUTH' | 'SESSION' | 'TOKEN' | 'MFA' | 'ESIGN' | 'DEVICE' | 'ADMIN' | 'SECURITY';
  event_severity: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
  event_outcome: 'SUCCESS' | 'FAILURE' | 'PENDING';
  ip_address: string | null;
  user_agent: string | null;
  event_details: Record<string, any> | null;
  error_code: string | null;
  error_message: string | null;
}

/**
 * Database interface (all tables)
 */
export interface Database {
  auth_contexts: AuthContextTable;
  auth_transactions: AuthTransactionTable;
  sessions: SessionTable;
  tokens: TokenTable;
  trusted_devices: TrustedDeviceTable;
  drs_evaluations: DrsEvaluationTable;
  audit_logs: AuditLogTable;
}

/**
 * Helper types for each table
 */
export type AuthContext = Selectable<AuthContextTable>;
export type NewAuthContext = Insertable<AuthContextTable>;
export type AuthContextUpdate = Updateable<AuthContextTable>;

export type AuthTransaction = Selectable<AuthTransactionTable>;
export type NewAuthTransaction = Insertable<AuthTransactionTable>;
export type AuthTransactionUpdate = Updateable<AuthTransactionTable>;

export type Session = Selectable<SessionTable>;
export type NewSession = Insertable<SessionTable>;
export type SessionUpdate = Updateable<SessionTable>;

export type Token = Selectable<TokenTable>;
export type NewToken = Insertable<TokenTable>;
export type TokenUpdate = Updateable<TokenTable>;

export type TrustedDevice = Selectable<TrustedDeviceTable>;
export type NewTrustedDevice = Insertable<TrustedDeviceTable>;
export type TrustedDeviceUpdate = Updateable<TrustedDeviceTable>;

export type DrsEvaluation = Selectable<DrsEvaluationTable>;
export type NewDrsEvaluation = Insertable<DrsEvaluationTable>;
export type DrsEvaluationUpdate = Updateable<DrsEvaluationTable>;

export type AuditLog = Selectable<AuditLogTable>;
export type NewAuditLog = Insertable<AuditLogTable>;
export type AuditLogUpdate = Updateable<AuditLogTable>;
```

**Validation:**
- [ ] File created at correct location
- [ ] All 7 tables defined
- [ ] Column types match schema-setup.sql
- [ ] Generated columns marked correctly
- [ ] Nullable columns marked correctly
- [ ] Enum types defined correctly
- [ ] Database interface includes all tables
- [ ] Helper types (Selectable, Insertable, Updateable) defined
- [ ] Exports all necessary types

---

#### Task 1.4: Create Mock Kysely Adapter

**File**: `src/database/mock-kysely.ts`

```typescript
import { Database, AuthTransaction, Session, Token, TrustedDevice, DrsEvaluation, AuditLog, AuthContext } from './types';

/**
 * In-memory storage for mock database
 */
class MockDatabase {
  auth_contexts: Map<string, AuthContext> = new Map();
  auth_transactions: Map<string, AuthTransaction> = new Map();
  sessions: Map<string, Session> = new Map();
  tokens: Map<string, Token> = new Map();
  trusted_devices: Map<string, TrustedDevice> = new Map();
  drs_evaluations: Map<string, DrsEvaluation> = new Map();
  audit_logs: Map<string, AuditLog> = new Map();

  private tokenIdCounter = 1;
  private deviceIdCounter = 1;
  private evaluationIdCounter = 1;
  private logIdCounter = 1;

  getNextTokenId(): number {
    return this.tokenIdCounter++;
  }

  getNextDeviceId(): number {
    return this.deviceIdCounter++;
  }

  getNextEvaluationId(): number {
    return this.evaluationIdCounter++;
  }

  getNextLogId(): number {
    return this.logIdCounter++;
  }
}

/**
 * Mock SELECT query builder
 */
class MockSelectQueryBuilder<TB extends keyof Database> {
  private table: TB;
  private store: Map<string, any>;
  private whereConditions: Array<(row: any) => boolean> = [];
  private selectColumns: string[] | null = null;
  private orderByColumns: Array<{ column: string; direction: 'asc' | 'desc' }> = [];
  private limitValue: number | null = null;

  constructor(table: TB, store: Map<string, any>) {
    this.table = table;
    this.store = store;
  }

  select(columns: string[]): this {
    this.selectColumns = columns;
    return this;
  }

  selectAll(): this {
    this.selectColumns = null;
    return this;
  }

  where(column: string, operator: string, value: any): this {
    this.whereConditions.push((row) => {
      const rowValue = row[column];
      switch (operator) {
        case '=': return rowValue === value;
        case '!=': return rowValue !== value;
        case '>': return rowValue > value;
        case '>=': return rowValue >= value;
        case '<': return rowValue < value;
        case '<=': return rowValue <= value;
        case 'in': return Array.isArray(value) && value.includes(rowValue);
        case 'is': return value === null ? rowValue === null : rowValue === value;
        default: throw new Error(`Unsupported operator: ${operator}`);
      }
    });
    return this;
  }

  orderBy(column: string, direction: 'asc' | 'desc' = 'asc'): this {
    this.orderByColumns.push({ column, direction });
    return this;
  }

  limit(limit: number): this {
    this.limitValue = limit;
    return this;
  }

  async execute(): Promise<any[]> {
    let results = Array.from(this.store.values());

    // Apply WHERE conditions
    for (const condition of this.whereConditions) {
      results = results.filter(condition);
    }

    // Apply ORDER BY
    if (this.orderByColumns.length > 0) {
      results.sort((a, b) => {
        for (const { column, direction } of this.orderByColumns) {
          const aVal = a[column];
          const bVal = b[column];
          if (aVal < bVal) return direction === 'asc' ? -1 : 1;
          if (aVal > bVal) return direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    // Apply LIMIT
    if (this.limitValue !== null) {
      results = results.slice(0, this.limitValue);
    }

    // Apply SELECT (column filtering)
    if (this.selectColumns) {
      results = results.map(row => {
        const filtered: any = {};
        for (const col of this.selectColumns!) {
          filtered[col] = row[col];
        }
        return filtered;
      });
    }

    return results;
  }

  async executeTakeFirst(): Promise<any | undefined> {
    const results = await this.execute();
    return results[0];
  }

  async executeTakeFirstOrThrow(): Promise<any> {
    const result = await this.executeTakeFirst();
    if (!result) {
      throw new Error(`No result found in ${String(this.table)}`);
    }
    return result;
  }
}

/**
 * Mock INSERT query builder
 */
class MockInsertQueryBuilder<TB extends keyof Database> {
  private table: TB;
  private store: Map<string, any>;
  private db: MockDatabase;
  private valuesToInsert: any | null = null;

  constructor(table: TB, store: Map<string, any>, db: MockDatabase) {
    this.table = table;
    this.store = store;
    this.db = db;
  }

  values(values: any): this {
    this.valuesToInsert = values;
    return this;
  }

  async execute(): Promise<void> {
    if (!this.valuesToInsert) {
      throw new Error('No values provided for insert');
    }

    // Auto-generate IDs for tables with auto-increment
    const row = { ...this.valuesToInsert };

    if (this.table === 'tokens' && !row.token_id) {
      row.token_id = this.db.getNextTokenId();
    }
    if (this.table === 'trusted_devices' && !row.device_id) {
      row.device_id = this.db.getNextDeviceId();
    }
    if (this.table === 'drs_evaluations' && !row.evaluation_id) {
      row.evaluation_id = this.db.getNextEvaluationId();
    }
    if (this.table === 'audit_logs' && !row.log_id) {
      row.log_id = this.db.getNextLogId();
    }

    // Auto-generate timestamps
    if (!row.created_at) {
      row.created_at = new Date();
    }
    if (!row.updated_at && this.table !== 'audit_logs') {
      row.updated_at = new Date();
    }
    if (this.table === 'sessions' && !row.last_activity_at) {
      row.last_activity_at = new Date();
    }
    if (this.table === 'trusted_devices' && !row.last_used_at) {
      row.last_used_at = new Date();
    }
    if (this.table === 'audit_logs' && !row.event_timestamp) {
      row.event_timestamp = new Date();
    }

    // Determine primary key
    let primaryKey: string;
    switch (this.table) {
      case 'auth_contexts':
        primaryKey = row.context_id;
        break;
      case 'auth_transactions':
        primaryKey = row.transaction_id;
        break;
      case 'sessions':
        primaryKey = row.session_id;
        break;
      case 'tokens':
        primaryKey = row.token_id.toString();
        break;
      case 'trusted_devices':
        primaryKey = row.device_id.toString();
        break;
      case 'drs_evaluations':
        primaryKey = row.evaluation_id.toString();
        break;
      case 'audit_logs':
        primaryKey = row.log_id.toString();
        break;
      default:
        throw new Error(`Unknown table: ${String(this.table)}`);
    }

    this.store.set(primaryKey, row);
  }

  async returning(columns: string[]): Promise<any> {
    await this.execute();
    // Return the inserted row
    const row = { ...this.valuesToInsert };
    const filtered: any = {};
    for (const col of columns) {
      filtered[col] = row[col];
    }
    return filtered;
  }

  async returningAll(): Promise<any> {
    await this.execute();
    return { ...this.valuesToInsert };
  }
}

/**
 * Mock UPDATE query builder
 */
class MockUpdateQueryBuilder<TB extends keyof Database> {
  private table: TB;
  private store: Map<string, any>;
  private whereConditions: Array<(row: any) => boolean> = [];
  private setValues: any | null = null;

  constructor(table: TB, store: Map<string, any>) {
    this.table = table;
    this.store = store;
  }

  set(values: any): this {
    this.setValues = values;
    return this;
  }

  where(column: string, operator: string, value: any): this {
    this.whereConditions.push((row) => {
      const rowValue = row[column];
      switch (operator) {
        case '=': return rowValue === value;
        case '!=': return rowValue !== value;
        case '>': return rowValue > value;
        case '>=': return rowValue >= value;
        case '<': return rowValue < value;
        case '<=': return rowValue <= value;
        default: throw new Error(`Unsupported operator: ${operator}`);
      }
    });
    return this;
  }

  async execute(): Promise<void> {
    if (!this.setValues) {
      throw new Error('No values provided for update');
    }

    // Update updated_at timestamp
    const updates = {
      ...this.setValues,
      updated_at: new Date()
    };

    for (const [key, row] of this.store.entries()) {
      const matches = this.whereConditions.every(condition => condition(row));
      if (matches) {
        this.store.set(key, { ...row, ...updates });
      }
    }
  }
}

/**
 * Mock DELETE query builder
 */
class MockDeleteQueryBuilder<TB extends keyof Database> {
  private table: TB;
  private store: Map<string, any>;
  private whereConditions: Array<(row: any) => boolean> = [];

  constructor(table: TB, store: Map<string, any>) {
    this.table = table;
    this.store = store;
  }

  where(column: string, operator: string, value: any): this {
    this.whereConditions.push((row) => {
      const rowValue = row[column];
      switch (operator) {
        case '=': return rowValue === value;
        case '!=': return rowValue !== value;
        default: throw new Error(`Unsupported operator: ${operator}`);
      }
    });
    return this;
  }

  async execute(): Promise<void> {
    const keysToDelete: string[] = [];

    for (const [key, row] of this.store.entries()) {
      const matches = this.whereConditions.every(condition => condition(row));
      if (matches) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.store.delete(key);
    }
  }
}

/**
 * Mock Kysely instance
 */
export class MockKysely {
  private db: MockDatabase;

  constructor() {
    this.db = new MockDatabase();
  }

  selectFrom<TB extends keyof Database>(table: TB): MockSelectQueryBuilder<TB> {
    const store = this.db[table] as Map<string, any>;
    return new MockSelectQueryBuilder(table, store);
  }

  insertInto<TB extends keyof Database>(table: TB): MockInsertQueryBuilder<TB> {
    const store = this.db[table] as Map<string, any>;
    return new MockInsertQueryBuilder(table, store, this.db);
  }

  updateTable<TB extends keyof Database>(table: TB): MockUpdateQueryBuilder<TB> {
    const store = this.db[table] as Map<string, any>;
    return new MockUpdateQueryBuilder(table, store);
  }

  deleteFrom<TB extends keyof Database>(table: TB): MockDeleteQueryBuilder<TB> {
    const store = this.db[table] as Map<string, any>;
    return new MockDeleteQueryBuilder(table, store);
  }

  async transaction<T>(callback: (trx: MockKysely) => Promise<T>): Promise<T> {
    // For mock, we don't actually implement transactions
    // Just execute the callback with this instance
    return callback(this);
  }

  // Utility methods for testing
  clearAll(): void {
    this.db.auth_contexts.clear();
    this.db.auth_transactions.clear();
    this.db.sessions.clear();
    this.db.tokens.clear();
    this.db.trusted_devices.clear();
    this.db.drs_evaluations.clear();
    this.db.audit_logs.clear();
  }

  getStore<TB extends keyof Database>(table: TB): Map<string, any> {
    return this.db[table] as Map<string, any>;
  }
}

/**
 * Create mock Kysely instance
 */
export function createMockKysely(): MockKysely {
  return new MockKysely();
}
```

**Validation:**
- [ ] File created at correct location
- [ ] MockKysely class implements core Kysely API
- [ ] selectFrom() returns query builder
- [ ] insertInto() returns insert builder
- [ ] updateTable() returns update builder
- [ ] deleteFrom() returns delete builder
- [ ] transaction() method implemented
- [ ] WHERE clause filtering works
- [ ] ORDER BY sorting works
- [ ] LIMIT works
- [ ] Auto-incrementing IDs work
- [ ] Timestamp auto-generation works
- [ ] clearAll() utility for testing

---

#### Task 1.5: Create Real Kysely Singleton

**File**: `src/database/kysely.ts`

```typescript
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { Database } from './types';
import { getDatabaseConfig, validateDatabaseConfig } from '../config/database';
import { MockKysely, createMockKysely } from './mock-kysely';

/**
 * Singleton Kysely instance
 */
let kyselyInstance: Kysely<Database> | MockKysely | null = null;

/**
 * Get or create Kysely instance (singleton pattern)
 */
export function getKysely(): Kysely<Database> | MockKysely {
  if (kyselyInstance) {
    return kyselyInstance;
  }

  const config = getDatabaseConfig();
  validateDatabaseConfig(config);

  if (config.useMock) {
    console.log('[Kysely] Initializing mock Kysely instance');
    kyselyInstance = createMockKysely();
  } else {
    console.log('[Kysely] Initializing real Kysely instance with PostgreSQL');

    if (!config.postgresql) {
      throw new Error('PostgreSQL configuration missing');
    }

    const pool = new Pool({
      host: config.postgresql.host,
      port: config.postgresql.port,
      database: config.postgresql.database,
      user: config.postgresql.user,
      password: config.postgresql.password,
      ...config.postgresql.pool
    });

    // Handle pool errors
    pool.on('error', (err) => {
      console.error('[Kysely] Unexpected database pool error:', err);
    });

    kyselyInstance = new Kysely<Database>({
      dialect: new PostgresDialect({ pool })
    });
  }

  return kyselyInstance;
}

/**
 * Destroy Kysely instance (for testing or graceful shutdown)
 */
export async function destroyKysely(): Promise<void> {
  if (kyselyInstance) {
    if ('destroy' in kyselyInstance) {
      await (kyselyInstance as Kysely<Database>).destroy();
    }
    kyselyInstance = null;
    console.log('[Kysely] Instance destroyed');
  }
}

/**
 * Health check for database connection
 */
export async function checkDatabaseHealth(): Promise<{ healthy: boolean; error?: string }> {
  try {
    const db = getKysely();

    if ('clearAll' in db) {
      // Mock mode - always healthy
      return { healthy: true };
    }

    // Real database - test connection
    await (db as Kysely<Database>)
      .selectFrom('auth_contexts')
      .select('context_id')
      .limit(1)
      .execute();

    return { healthy: true };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Reset mock database (for testing only)
 */
export function resetMockDatabase(): void {
  if (kyselyInstance && 'clearAll' in kyselyInstance) {
    (kyselyInstance as MockKysely).clearAll();
    console.log('[Kysely] Mock database cleared');
  }
}
```

**Validation:**
- [ ] File created at correct location
- [ ] Singleton pattern implemented correctly
- [ ] getKysely() returns same instance
- [ ] Creates mock or real based on config
- [ ] Pool configuration applied correctly
- [ ] Error handling for pool errors
- [ ] destroyKysely() cleans up properly
- [ ] checkDatabaseHealth() works for both mock and real
- [ ] resetMockDatabase() works for testing

---

#### Task 1.6: Create Transaction Helpers

**File**: `src/database/transactions.ts`

```typescript
import { Kysely } from 'kysely';
import { Database } from './types';
import { getKysely } from './kysely';
import { MockKysely } from './mock-kysely';

/**
 * Execute database operation in a transaction
 */
export async function withTransaction<T>(
  callback: (trx: Kysely<Database> | MockKysely) => Promise<T>
): Promise<T> {
  const db = getKysely();
  return db.transaction(callback);
}

/**
 * Login flow transaction: context + session + tokens
 */
export async function loginFlowTransaction(data: {
  context: any;
  session: any;
  tokens: any[];
}): Promise<void> {
  await withTransaction(async (trx) => {
    // Insert auth context
    await trx
      .insertInto('auth_contexts')
      .values(data.context)
      .execute();

    // Insert session
    await trx
      .insertInto('sessions')
      .values(data.session)
      .execute();

    // Insert all tokens (access, refresh, id)
    for (const token of data.tokens) {
      await trx
        .insertInto('tokens')
        .values(token)
        .execute();
    }
  });
}

/**
 * MFA flow transaction: expire old + create new transaction
 */
export async function mfaFlowTransaction(data: {
  contextId: string;
  newTransaction: any;
}): Promise<void> {
  await withTransaction(async (trx) => {
    // Expire all pending transactions for this context
    await trx
      .updateTable('auth_transactions')
      .set({ transaction_status: 'EXPIRED', updated_at: new Date() })
      .where('context_id', '=', data.contextId)
      .where('transaction_status', '=', 'PENDING')
      .execute();

    // Insert new transaction
    await trx
      .insertInto('auth_transactions')
      .values(data.newTransaction)
      .execute();
  });
}

/**
 * Token rotation transaction: revoke old + create new
 */
export async function tokenRotationTransaction(data: {
  oldTokenHash: string;
  newToken: any;
}): Promise<void> {
  await withTransaction(async (trx) => {
    // Revoke old token
    await trx
      .updateTable('tokens')
      .set({ status: 'ROTATED', updated_at: new Date() })
      .where('token_value_hash', '=', data.oldTokenHash)
      .execute();

    // Create new token
    await trx
      .insertInto('tokens')
      .values(data.newToken)
      .execute();
  });
}
```

**Validation:**
- [ ] File created at correct location
- [ ] withTransaction() helper works
- [ ] loginFlowTransaction() creates all records atomically
- [ ] mfaFlowTransaction() expires old and creates new atomically
- [ ] tokenRotationTransaction() revokes and creates atomically
- [ ] Works with both mock and real Kysely

---

#### Task 1.7: Update .env.example

**File**: `.env.example`

```bash
# ... existing environment variables ...

# ============================================
# Database Configuration
# ============================================

# Feature flag: Use in-memory mock database (true) or PostgreSQL (false)
# Default: true for development
USE_MOCK_DB=true

# PostgreSQL Connection (required when USE_MOCK_DB=false)
DATABASE_URL=postgresql://postgres:password@localhost:5432/ciam

# Or use individual connection parameters
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ciam
DB_USER=postgres
DB_PASSWORD=password

# Connection Pool Configuration (production tuning)
DB_POOL_MIN=10
DB_POOL_MAX=50
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=10000
```

**Validation:**
- [ ] File updated with database variables
- [ ] USE_MOCK_DB documented
- [ ] DATABASE_URL example provided
- [ ] Individual DB_* variables documented
- [ ] Pool configuration variables included
- [ ] Default values specified

---

#### Task 1.8: Create Docker Compose for PostgreSQL

**File**: `docker-compose.yml`

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: ciam-postgres
    environment:
      POSTGRES_DB: ciam
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./ciam-backend/changes/10082025/schema_docs/claudedocs/schema-setup.sql:/docker-entrypoint-initdb.d/01-schema.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres-data:
```

**Usage:**
```bash
# Start PostgreSQL
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f postgres

# Stop and remove
docker-compose down

# Stop and remove with data
docker-compose down -v
```

**Validation:**
- [ ] File created at project root
- [ ] PostgreSQL 15 Alpine image specified
- [ ] Environment variables set correctly
- [ ] Port 5432 exposed
- [ ] Volume mounted for persistence
- [ ] Schema SQL runs on init
- [ ] Health check configured

---

### PHASE 1 COMPLETION CHECKLIST

- [ ] All Task 1.1-1.8 completed
- [ ] Dependencies installed successfully
- [ ] All foundation files created
- [ ] TypeScript compiles without errors
- [ ] Mock Kysely basic tests pass
- [ ] Docker Compose starts PostgreSQL successfully
- [ ] Can connect to PostgreSQL (optional, for testing)
- [ ] Git commit: "feat: Phase 1 - Kysely foundation and infrastructure"

---

### PHASE 2: Repository Implementation

#### Task 2.1: Create Base Repository

**File**: `src/repositories/base.repository.ts`

```typescript
import { Kysely } from 'kysely';
import { Database } from '../database/types';
import { MockKysely } from '../database/mock-kysely';

/**
 * Base repository with common operations
 */
export abstract class BaseRepository<T extends keyof Database> {
  protected db: Kysely<Database> | MockKysely;
  protected tableName: T;

  constructor(db: Kysely<Database> | MockKysely, tableName: T) {
    this.db = db;
    this.tableName = tableName;
  }

  /**
   * Find single record by condition
   */
  protected async findOne(
    column: string,
    value: any
  ): Promise<Database[T] | undefined> {
    return this.db
      .selectFrom(this.tableName)
      .selectAll()
      .where(column as any, '=', value)
      .executeTakeFirst() as Promise<Database[T] | undefined>;
  }

  /**
   * Find multiple records by condition
   */
  protected async findMany(
    column: string,
    value: any
  ): Promise<Array<Database[T]>> {
    return this.db
      .selectFrom(this.tableName)
      .selectAll()
      .where(column as any, '=', value)
      .execute() as Promise<Array<Database[T]>>;
  }

  /**
   * Count records by condition
   */
  protected async count(
    column: string,
    value: any
  ): Promise<number> {
    const result = await this.db
      .selectFrom(this.tableName)
      .select(({ fn }) => [fn.count<number>('*').as('count')])
      .where(column as any, '=', value)
      .executeTakeFirst();

    return result?.count || 0;
  }

  /**
   * Check if record exists
   */
  protected async exists(
    column: string,
    value: any
  ): Promise<boolean> {
    const count = await this.count(column, value);
    return count > 0;
  }

  /**
   * Log repository operation
   */
  protected log(operation: string, details?: any): void {
    console.log(`[${this.tableName}] ${operation}`, details || '');
  }

  /**
   * Handle repository errors
   */
  protected handleError(operation: string, error: any): never {
    console.error(`[${this.tableName}] ${operation} failed:`, error);
    throw new Error(`Database operation failed: ${operation}`);
  }
}
```

**Validation:**
- [ ] File created at correct location
- [ ] BaseRepository abstract class defined
- [ ] Generic type parameter for table name
- [ ] Common CRUD helpers implemented
- [ ] Error handling included
- [ ] Logging included
- [ ] Works with both Kysely and MockKysely

---

#### Task 2.2: Create AuthContextRepository

**File**: `src/repositories/auth-context.repository.ts`

```typescript
import { BaseRepository } from './base.repository';
import { AuthContext, NewAuthContext, AuthContextUpdate } from '../database/types';
import { getKysely } from '../database/kysely';

/**
 * Repository for auth_contexts table
 */
export class AuthContextRepository extends BaseRepository<'auth_contexts'> {
  constructor() {
    super(getKysely(), 'auth_contexts');
  }

  /**
   * Create new auth context
   */
  async create(data: NewAuthContext): Promise<AuthContext> {
    try {
      const result = await this.db
        .insertInto('auth_contexts')
        .values(data)
        .returningAll()
        .executeTakeFirstOrThrow();

      this.log('create', { context_id: result.context_id });
      return result as AuthContext;
    } catch (error) {
      this.handleError('create', error);
    }
  }

  /**
   * Find by context_id
   */
  async findById(contextId: string): Promise<AuthContext | null> {
    try {
      const result = await this.findOne('context_id', contextId);
      return result || null;
    } catch (error) {
      this.handleError('findById', error);
    }
  }

  /**
   * Find by correlation_id (for distributed tracing)
   */
  async findByCorrelationId(correlationId: string): Promise<AuthContext | null> {
    try {
      const result = await this.findOne('correlation_id', correlationId);
      return result || null;
    } catch (error) {
      this.handleError('findByCorrelationId', error);
    }
  }

  /**
   * Update outcome
   */
  async updateOutcome(
    contextId: string,
    outcome: 'SUCCESS' | 'FAILURE' | 'ABANDONED' | 'IN_PROGRESS'
  ): Promise<void> {
    try {
      await this.db
        .updateTable('auth_contexts')
        .set({ outcome, updated_at: new Date() })
        .where('context_id', '=', contextId)
        .execute();

      this.log('updateOutcome', { context_id: contextId, outcome });
    } catch (error) {
      this.handleError('updateOutcome', error);
    }
  }

  /**
   * Find expired contexts (for cleanup)
   */
  async findExpired(): Promise<AuthContext[]> {
    try {
      const now = new Date();
      return await this.db
        .selectFrom('auth_contexts')
        .selectAll()
        .where('expires_at', '<', now)
        .execute() as AuthContext[];
    } catch (error) {
      this.handleError('findExpired', error);
    }
  }

  /**
   * Find by cupid (user ID from LDAP)
   */
  async findByCupid(cupid: string, limit: number = 10): Promise<AuthContext[]> {
    try {
      return await this.db
        .selectFrom('auth_contexts')
        .selectAll()
        .where('cupid', '=', cupid)
        .orderBy('created_at', 'desc')
        .limit(limit)
        .execute() as AuthContext[];
    } catch (error) {
      this.handleError('findByCupid', error);
    }
  }
}
```

**Validation:**
- [ ] File created at correct location
- [ ] Extends BaseRepository
- [ ] create() method implemented
- [ ] findById() method implemented
- [ ] findByCorrelationId() for tracing
- [ ] updateOutcome() for flow completion
- [ ] findExpired() for cleanup
- [ ] findByCupid() for user history
- [ ] All methods have try-catch
- [ ] All methods log operations

---

#### Task 2.3: Create AuthTransactionRepository (CRITICAL)

**File**: `src/repositories/auth-transaction.repository.ts`

```typescript
import { BaseRepository } from './base.repository';
import { AuthTransaction, NewAuthTransaction, AuthTransactionUpdate } from '../database/types';
import { getKysely } from '../database/kysely';

/**
 * Repository for auth_transactions table
 * CRITICAL: Handles MFA, eSign, device bind transactions
 */
export class AuthTransactionRepository extends BaseRepository<'auth_transactions'> {
  constructor() {
    super(getKysely(), 'auth_transactions');
  }

  /**
   * Create new transaction
   */
  async create(data: NewAuthTransaction): Promise<AuthTransaction> {
    try {
      const result = await this.db
        .insertInto('auth_transactions')
        .values(data)
        .returningAll()
        .executeTakeFirstOrThrow();

      this.log('create', {
        transaction_id: result.transaction_id,
        context_id: result.context_id,
        type: result.transaction_type
      });

      return result as AuthTransaction;
    } catch (error) {
      this.handleError('create', error);
    }
  }

  /**
   * Find by transaction_id
   */
  async findById(transactionId: string): Promise<AuthTransaction | null> {
    try {
      const result = await this.findOne('transaction_id', transactionId);

      // Auto-expire if past expiry date
      if (result && result.expires_at < new Date() && result.transaction_status === 'PENDING') {
        await this.updateStatus(transactionId, 'EXPIRED');
        return { ...result, transaction_status: 'EXPIRED' } as AuthTransaction;
      }

      return result as AuthTransaction || null;
    } catch (error) {
      this.handleError('findById', error);
    }
  }

  /**
   * Find pending transaction by context_id
   * Returns the most recent pending transaction for a context
   */
  async findPendingByContext(contextId: string): Promise<AuthTransaction | null> {
    try {
      const result = await this.db
        .selectFrom('auth_transactions')
        .selectAll()
        .where('context_id', '=', contextId)
        .where('transaction_status', '=', 'PENDING')
        .orderBy('sequence_number', 'desc')
        .limit(1)
        .executeTakeFirst();

      return result as AuthTransaction || null;
    } catch (error) {
      this.handleError('findPendingByContext', error);
    }
  }

  /**
   * CRITICAL: Expire all pending transactions for a context
   * This is called before creating a new MFA transaction
   */
  async expirePendingByContext(contextId: string): Promise<number> {
    try {
      const result = await this.db
        .updateTable('auth_transactions')
        .set({
          transaction_status: 'EXPIRED',
          updated_at: new Date()
        })
        .where('context_id', '=', contextId)
        .where('transaction_status', '=', 'PENDING')
        .execute();

      const count = Number(result[0]?.numUpdatedRows || 0);
      this.log('expirePendingByContext', { context_id: contextId, count });

      return count;
    } catch (error) {
      this.handleError('expirePendingByContext', error);
    }
  }

  /**
   * Update transaction status
   */
  async updateStatus(
    transactionId: string,
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CONSUMED'
  ): Promise<void> {
    try {
      await this.db
        .updateTable('auth_transactions')
        .set({
          transaction_status: status,
          updated_at: new Date(),
          ...(status === 'CONSUMED' ? { consumed_at: new Date() } : {})
        })
        .where('transaction_id', '=', transactionId)
        .execute();

      this.log('updateStatus', { transaction_id: transactionId, status });
    } catch (error) {
      this.handleError('updateStatus', error);
    }
  }

  /**
   * Update metadata (for push numbers, OTP, etc.)
   */
  async updateMetadata(
    transactionId: string,
    metadata: Record<string, any>
  ): Promise<void> {
    try {
      await this.db
        .updateTable('auth_transactions')
        .set({
          metadata,
          updated_at: new Date()
        })
        .where('transaction_id', '=', transactionId)
        .execute();

      this.log('updateMetadata', { transaction_id: transactionId });
    } catch (error) {
      this.handleError('updateMetadata', error);
    }
  }

  /**
   * Find all transactions for a context (transaction chain)
   */
  async findByContextChain(contextId: string): Promise<AuthTransaction[]> {
    try {
      return await this.db
        .selectFrom('auth_transactions')
        .selectAll()
        .where('context_id', '=', contextId)
        .orderBy('sequence_number', 'asc')
        .execute() as AuthTransaction[];
    } catch (error) {
      this.handleError('findByContextChain', error);
    }
  }

  /**
   * Get next sequence number for context
   */
  async getNextSequence(contextId: string): Promise<number> {
    try {
      const result = await this.db
        .selectFrom('auth_transactions')
        .select(({ fn }) => [fn.max('sequence_number').as('max_seq')])
        .where('context_id', '=', contextId)
        .executeTakeFirst();

      return (result?.max_seq || 0) + 1;
    } catch (error) {
      this.handleError('getNextSequence', error);
    }
  }

  /**
   * Find expired transactions (for cleanup)
   */
  async findExpired(): Promise<AuthTransaction[]> {
    try {
      const now = new Date();
      return await this.db
        .selectFrom('auth_transactions')
        .selectAll()
        .where('expires_at', '<', now)
        .where('transaction_status', '=', 'PENDING')
        .execute() as AuthTransaction[];
    } catch (error) {
      this.handleError('findExpired', error);
    }
  }

  /**
   * Consume transaction (mark as consumed, prevent reuse)
   */
  async consume(transactionId: string): Promise<void> {
    try {
      await this.db
        .updateTable('auth_transactions')
        .set({
          transaction_status: 'CONSUMED',
          consumed_at: new Date(),
          updated_at: new Date()
        })
        .where('transaction_id', '=', transactionId)
        .where('transaction_status', '=', 'APPROVED')
        .execute();

      this.log('consume', { transaction_id: transactionId });
    } catch (error) {
      this.handleError('consume', error);
    }
  }
}
```

**Validation:**
- [ ] File created at correct location
- [ ] Extends BaseRepository
- [ ] create() method implemented
- [ ] findById() with auto-expiry
- [ ] findPendingByContext() for active transaction lookup
- [ ] expirePendingByContext() for invalidation (CRITICAL)
- [ ] updateStatus() for status changes
- [ ] updateMetadata() for push numbers, OTP
- [ ] findByContextChain() for transaction history
- [ ] getNextSequence() for sequence tracking
- [ ] consume() for transaction consumption
- [ ] findExpired() for cleanup
- [ ] All methods have try-catch
- [ ] All operations logged

---

#### Task 2.4: Create SessionRepository

**File**: `src/repositories/session.repository.ts`

```typescript
import { BaseRepository } from './base.repository';
import { Session, NewSession, SessionUpdate } from '../database/types';
import { getKysely } from '../database/kysely';

/**
 * Repository for sessions table
 */
export class SessionRepository extends BaseRepository<'sessions'> {
  constructor() {
    super(getKysely(), 'sessions');
  }

  /**
   * Create new session
   */
  async create(data: NewSession): Promise<Session> {
    try {
      const result = await this.db
        .insertInto('sessions')
        .values(data)
        .returningAll()
        .executeTakeFirstOrThrow();

      this.log('create', { session_id: result.session_id, cupid: result.cupid });
      return result as Session;
    } catch (error) {
      this.handleError('create', error);
    }
  }

  /**
   * Find by session_id
   */
  async findById(sessionId: string): Promise<Session | null> {
    try {
      const result = await this.findOne('session_id', sessionId);

      // Auto-revoke if expired
      if (result && result.expires_at < new Date() && result.status === 'ACTIVE') {
        await this.revoke(sessionId, 'EXPIRED');
        return { ...result, status: 'EXPIRED' } as Session;
      }

      return result as Session || null;
    } catch (error) {
      this.handleError('findById', error);
    }
  }

  /**
   * Find all active sessions for user
   */
  async findActiveByCupid(cupid: string): Promise<Session[]> {
    try {
      const now = new Date();
      return await this.db
        .selectFrom('sessions')
        .selectAll()
        .where('cupid', '=', cupid)
        .where('status', '=', 'ACTIVE')
        .where('expires_at', '>', now)
        .orderBy('last_activity_at', 'desc')
        .execute() as Session[];
    } catch (error) {
      this.handleError('findActiveByCupid', error);
    }
  }

  /**
   * Find by context_id
   */
  async findByContext(contextId: string): Promise<Session | null> {
    try {
      const result = await this.findOne('context_id', contextId);
      return result as Session || null;
    } catch (error) {
      this.handleError('findByContext', error);
    }
  }

  /**
   * Update last activity timestamp
   */
  async updateActivity(sessionId: string): Promise<void> {
    try {
      await this.db
        .updateTable('sessions')
        .set({
          last_activity_at: new Date(),
          updated_at: new Date()
        })
        .where('session_id', '=', sessionId)
        .execute();

      this.log('updateActivity', { session_id: sessionId });
    } catch (error) {
      this.handleError('updateActivity', error);
    }
  }

  /**
   * Revoke session
   */
  async revoke(sessionId: string, reason?: string): Promise<void> {
    try {
      await this.db
        .updateTable('sessions')
        .set({
          status: 'REVOKED',
          revoke_reason: reason || 'USER_LOGOUT',
          updated_at: new Date()
        })
        .where('session_id', '=', sessionId)
        .execute();

      this.log('revoke', { session_id: sessionId, reason });
    } catch (error) {
      this.handleError('revoke', error);
    }
  }

  /**
   * Revoke all sessions for user
   */
  async revokeAllByCupid(cupid: string, reason?: string): Promise<number> {
    try {
      const result = await this.db
        .updateTable('sessions')
        .set({
          status: 'REVOKED',
          revoke_reason: reason || 'ADMIN_REVOKE_ALL',
          updated_at: new Date()
        })
        .where('cupid', '=', cupid)
        .where('status', '=', 'ACTIVE')
        .execute();

      const count = Number(result[0]?.numUpdatedRows || 0);
      this.log('revokeAllByCupid', { cupid, count });

      return count;
    } catch (error) {
      this.handleError('revokeAllByCupid', error);
    }
  }

  /**
   * Find expired sessions (for cleanup)
   */
  async findExpired(): Promise<Session[]> {
    try {
      const now = new Date();
      return await this.db
        .selectFrom('sessions')
        .selectAll()
        .where('expires_at', '<', now)
        .where('status', '=', 'ACTIVE')
        .execute() as Session[];
    } catch (error) {
      this.handleError('findExpired', error);
    }
  }

  /**
   * Verify session is active
   */
  async isActive(sessionId: string): Promise<boolean> {
    try {
      const session = await this.findById(sessionId);
      return session?.status === 'ACTIVE' && session.expires_at > new Date();
    } catch (error) {
      this.handleError('isActive', error);
    }
  }
}
```

**Validation:**
- [ ] File created at correct location
- [ ] Extends BaseRepository
- [ ] create() method implemented
- [ ] findById() with auto-expiry
- [ ] findActiveByCupid() for multi-session support
- [ ] findByContext() for context lookup
- [ ] updateActivity() for session touch
- [ ] revoke() for single session
- [ ] revokeAllByCupid() for logout all devices
- [ ] findExpired() for cleanup
- [ ] isActive() for validation
- [ ] All methods have try-catch

---

Due to length constraints, I'll continue with the remaining repositories and phases in a follow-up response. Would you like me to continue documenting the rest of the implementation plan?