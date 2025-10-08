# CIAM Database - Entity Relationship Diagram

**Database:** PostgreSQL 14+
**Tables:** 7 Core Tables
**Relationships:** Event-driven, normalized design

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      PRE-AUTH FLOW                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐         ┌─────────────────────┐         │
│  │ auth_contexts    │1      *N│ auth_transactions   │         │
│  │                  │─────────│                     │         │
│  │ • context_id PK  │         │ • transaction_id PK │         │
│  │ • cupid          │         │ • context_id FK     │         │
│  │ • app_id         │         │ • parent_tx_id FK   │         │
│  │ • ip_address     │         │ • trans_type        │         │
│  │ • created_at     │         │ • trans_status      │         │
│  └──────────────────┘         │ • phase (MFA/eSign) │         │
│           │                    └─────────────────────┘         │
│           │1                                                    │
│           │                    ┌─────────────────────┐         │
│           │                  *N│ drs_evaluations     │         │
│           └────────────────────│                     │         │
│                                │ • evaluation_id PK  │         │
│                                │ • context_id FK     │         │
│                                │ • recommendation    │         │
│                                │ • risk_score        │         │
│                                └─────────────────────┘         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      POST-AUTH FLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐                                          │
│  │ sessions         │                                          │
│  │                  │                                          │
│  │ • session_id PK  │1                                         │
│  │ • context_id FK  │────────┐                                │
│  │ • cupid          │        │                                │
│  │ • status         │        │*N                              │
│  │ • created_at     │   ┌────▼──────────┐                     │
│  └──────────────────┘   │ tokens        │                     │
│           │              │               │                     │
│           │1             │ • token_id PK │                     │
│           │            *N│ • session_id  │                     │
│           └──────────────│ • token_type  │                     │
│                          │ • token_value │                     │
│                          │ • status      │                     │
│                          │ • parent_id   │                     │
│                          └───────────────┘                     │
│                                                                 │
│  ┌──────────────────┐                                          │
│  │ trusted_devices  │                                          │
│  │                  │                                          │
│  │ • device_id PK   │                                          │
│  │ • cupid          │                                          │
│  │ • fingerprint    │                                          │
│  │ • trusted_at     │                                          │
│  └──────────────────┘                                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      AUDIT & ANALYTICS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐                                          │
│  │ audit_logs       │ (Partitioned by month)                   │
│  │                  │                                          │
│  │ • audit_id PK    │                                          │
│  │ • event_type     │                                          │
│  │ • cupid          │                                          │
│  │ • context_id     │                                          │
│  │ • transaction_id │                                          │
│  │ • session_id     │                                          │
│  │ • event_data     │ (JSONB)                                  │
│  │ • created_at     │                                          │
│  └──────────────────┘                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Detailed Entity Relationship Diagram

### Core Relationships

```
auth_contexts (1) ──────────────── (*) auth_transactions
    │                                   │
    │ (1)                              │ (parent)
    │                                   │ (self-ref)
    ├────────────────── (*) drs_evaluations
    │
    │ (1)
    │
    └────────────────── (1) sessions
                             │
                             │ (1)
                             │
                             └────────── (*) tokens
                                            │
                                            │ (parent)
                                            │ (self-ref)
                                            └──────────
```

---

## Table Details with Cardinality

### 1. auth_contexts

**Purpose:** Immutable container for authentication journey

```
┌─────────────────────────────────────────────────┐
│ auth_contexts                                   │
├─────────────────────────────────────────────────┤
│ PK: context_id (UUID)                           │
├─────────────────────────────────────────────────┤
│ cupid                    VARCHAR(50) NOT NULL   │
│ app_id                   VARCHAR(50) NOT NULL   │
│ app_version              VARCHAR(20) NOT NULL   │
│ device_fingerprint       TEXT                   │
│ ip_address               INET NOT NULL          │
│ correlation_id           UUID                   │
│ requires_additional_steps BOOLEAN DEFAULT FALSE │
│ auth_outcome             VARCHAR(50)            │
│ completed_at             TIMESTAMPTZ            │
│ created_at               TIMESTAMPTZ            │
│ expires_at               TIMESTAMPTZ NOT NULL   │
├─────────────────────────────────────────────────┤
│ Relationships:                                  │
│   → auth_transactions (1:N)                     │
│   → drs_evaluations (1:N)                       │
│   → sessions (1:1)                              │
└─────────────────────────────────────────────────┘
```

**Lifecycle:** INSERT once → UPDATE once (final outcome)

---

### 2. auth_transactions

**Purpose:** Step-by-step event log with single-use transaction tokens

```
┌─────────────────────────────────────────────────┐
│ auth_transactions                               │
├─────────────────────────────────────────────────┤
│ PK: transaction_id (UUID)                       │
│ FK: context_id → auth_contexts                  │
│ FK: parent_transaction_id → auth_transactions   │
├─────────────────────────────────────────────────┤
│ transaction_type         VARCHAR(50) NOT NULL   │
│ transaction_status       VARCHAR(20) NOT NULL   │
│ sequence_number          INT NOT NULL           │
│ phase                    VARCHAR(50) NOT NULL   │
│                                                 │
│ -- MFA Phase                                    │
│ mfa_method               VARCHAR(10)            │
│ mfa_option_id            SMALLINT               │
│ mfa_options              JSONB                  │
│ mobile_approve_status    VARCHAR(20)            │
│ display_number           INT                    │
│ selected_number          INT                    │
│ verification_result      VARCHAR(20)            │
│ attempt_number           INT                    │
│                                                 │
│ -- eSign Phase                                  │
│ esign_document_id        VARCHAR(100)           │
│ esign_action             VARCHAR(20)            │
│                                                 │
│ -- Device Bind Phase                            │
│ device_bind_decision     VARCHAR(20)            │
│                                                 │
│ consumed_at              TIMESTAMPTZ            │
│ created_at               TIMESTAMPTZ            │
│ expires_at               TIMESTAMPTZ NOT NULL   │
├─────────────────────────────────────────────────┤
│ Relationships:                                  │
│   ← auth_contexts (N:1)                         │
│   ↔ auth_transactions (parent chain)            │
└─────────────────────────────────────────────────┘

Transaction Types:
- MFA_INITIATE
- MFA_VERIFY
- MFA_PUSH_VERIFY
- ESIGN_PRESENT
- ESIGN_ACCEPT
- DEVICE_BIND

Transaction Status:
- PENDING (active, awaiting action)
- CONSUMED (used, moved to next step)
- EXPIRED (time limit exceeded)
- REJECTED (user declined/failed)
```

**Lifecycle:** INSERT → status=PENDING → UPDATE to CONSUMED/EXPIRED → INSERT next transaction

---

### 3. sessions

**Purpose:** Active user sessions (supports multi-device)

```
┌─────────────────────────────────────────────────┐
│ sessions                                        │
├─────────────────────────────────────────────────┤
│ PK: session_id (UUID)                           │
│ FK: context_id → auth_contexts                  │
├─────────────────────────────────────────────────┤
│ cupid                    VARCHAR(50) NOT NULL   │
│ device_fingerprint       TEXT                   │
│ ip_address               INET NOT NULL          │
│ user_agent               TEXT                   │
│ status                   VARCHAR(20) NOT NULL   │
│ created_at               TIMESTAMPTZ            │
│ last_activity_at         TIMESTAMPTZ            │
│ expires_at               TIMESTAMPTZ            │
│ revoked_at               TIMESTAMPTZ            │
│ revoked_by               VARCHAR(100)           │
│ revocation_reason        TEXT                   │
├─────────────────────────────────────────────────┤
│ Relationships:                                  │
│   ← auth_contexts (1:1)                         │
│   → tokens (1:N)                                │
└─────────────────────────────────────────────────┘

Status Values:
- ACTIVE (in use)
- EXPIRED (time-based expiry)
- REVOKED (manually revoked)
- LOGGED_OUT (user logout)
```

**Multi-Device:** One CUPID → Multiple sessions (different devices/browsers)

---

### 4. tokens

**Purpose:** Access/Refresh/ID tokens with rotation chain tracking

```
┌─────────────────────────────────────────────────┐
│ tokens                                          │
├─────────────────────────────────────────────────┤
│ PK: token_id (UUID)                             │
│ FK: session_id → sessions                       │
│ FK: parent_token_id → tokens (self-ref)         │
├─────────────────────────────────────────────────┤
│ token_type               VARCHAR(20) NOT NULL   │
│ token_value              TEXT NOT NULL          │
│ token_value_hash         VARCHAR(64) NOT NULL   │
│ expires_at               TIMESTAMPTZ NOT NULL   │
│ status                   VARCHAR(20) NOT NULL   │
│ created_at               TIMESTAMPTZ            │
│ revoked_at               TIMESTAMPTZ            │
├─────────────────────────────────────────────────┤
│ Relationships:                                  │
│   ← sessions (N:1)                              │
│   ↔ tokens (rotation chain)                     │
└─────────────────────────────────────────────────┘

Token Types:
- ACCESS (short-lived, 15 min)
- REFRESH (long-lived, 30 days)
- ID (short-lived, 15 min)

Token Status:
- ACTIVE (currently valid)
- ROTATED (replaced by new token)
- REVOKED (manually invalidated)
- EXPIRED (time-based expiry)

Rotation Chain Example:
token-1 (ROTATED) → token-2 (ROTATED) → token-3 (ACTIVE)
```

**Security:** Rotation chain enables stolen token detection

---

### 5. trusted_devices

**Purpose:** Device binding for MFA skip on trusted devices

```
┌─────────────────────────────────────────────────┐
│ trusted_devices                                 │
├─────────────────────────────────────────────────┤
│ PK: device_id (UUID)                            │
├─────────────────────────────────────────────────┤
│ cupid                    VARCHAR(50) NOT NULL   │
│ device_fingerprint       TEXT NOT NULL          │
│ device_fingerprint_hash  VARCHAR(64) NOT NULL   │
│ device_name              VARCHAR(200)           │
│ device_type              VARCHAR(50)            │
│ trusted_at               TIMESTAMPTZ            │
│ last_used_at             TIMESTAMPTZ            │
│ status                   VARCHAR(20) NOT NULL   │
│ revoked_at               TIMESTAMPTZ            │
├─────────────────────────────────────────────────┤
│ Relationships:                                  │
│   Logical: cupid links to LDAP user             │
└─────────────────────────────────────────────────┘

Device Types:
- BROWSER
- MOBILE_APP
- TABLET
- DESKTOP_APP

Status Values:
- ACTIVE
- REVOKED
- EXPIRED
```

**Multi-Device Support:** One CUPID → Multiple trusted devices

---

### 6. drs_evaluations

**Purpose:** Device Recognition Service (Transmit DRS) risk assessments

```
┌─────────────────────────────────────────────────┐
│ drs_evaluations                                 │
├─────────────────────────────────────────────────┤
│ PK: evaluation_id (UUID)                        │
│ FK: context_id → auth_contexts                  │
├─────────────────────────────────────────────────┤
│ cupid                    VARCHAR(50) NOT NULL   │
│ action_token_hash        VARCHAR(64) NOT NULL   │
│ device_id                VARCHAR(100)           │
│ recommendation           VARCHAR(20) NOT NULL   │
│ risk_score               INT NOT NULL           │
│                          CHECK (0 <= score <= 100)│
│ signals                  JSONB                  │
│ device_attributes        JSONB                  │
│ raw_response             JSONB                  │
│ created_at               TIMESTAMPTZ            │
├─────────────────────────────────────────────────┤
│ Relationships:                                  │
│   ← auth_contexts (N:1)                         │
└─────────────────────────────────────────────────┘

Recommendations:
- ALLOW (low risk)
- CHALLENGE (medium risk, require MFA)
- DENY (high risk, block login)
- TRUST (known good device)

Risk Score:
- 0-30: Low risk
- 31-70: Medium risk
- 71-100: High risk

Signals JSONB Example:
[
  {"type": "NEW_DEVICE", "severity": "MEDIUM"},
  {"type": "LOCATION_CHANGE", "severity": "LOW"}
]
```

**Use Case:** Fraud detection, adaptive authentication

---

### 7. audit_logs

**Purpose:** Comprehensive event timeline (partitioned by month)

```
┌─────────────────────────────────────────────────┐
│ audit_logs (PARTITIONED)                        │
├─────────────────────────────────────────────────┤
│ PK: audit_id (UUID)                             │
├─────────────────────────────────────────────────┤
│ event_type               VARCHAR(100) NOT NULL  │
│ event_category           VARCHAR(50) NOT NULL   │
│ severity                 VARCHAR(20) NOT NULL   │
│ cupid                    VARCHAR(50)            │
│ context_id               UUID                   │
│ transaction_id           UUID                   │
│ session_id               UUID                   │
│ correlation_id           UUID                   │
│ ip_address               INET                   │
│ user_agent               TEXT                   │
│ event_data               JSONB NOT NULL         │
│ created_at               TIMESTAMPTZ            │
├─────────────────────────────────────────────────┤
│ Partitions:                                     │
│   audit_logs_2025_10 (Oct 2025)                 │
│   audit_logs_2025_11 (Nov 2025)                 │
│   ... (auto-created monthly)                    │
└─────────────────────────────────────────────────┘

Event Categories:
- AUTH (login, logout)
- MFA (challenges, verification)
- ESIGN (document presentation, acceptance)
- DEVICE (binding, trust)
- TOKEN (issued, refreshed, revoked)
- SESSION (created, revoked, expired)
- SECURITY (suspicious activity, rate limits)

Severity Levels:
- INFO (normal operations)
- WARN (potential issues)
- ERROR (failures)
- CRITICAL (security events)
```

**Partitioning:** Monthly partitions for efficient retention management

---

## Data Flow Diagram

### Simple Login (No MFA)

```
1. POST /auth/login
   ↓
   INSERT auth_contexts
   INSERT drs_evaluations (risk assessment)
   ↓
   DRS says "ALLOW"
   ↓
   INSERT sessions
   INSERT tokens (3 rows: access, refresh, id)
   INSERT audit_logs (LOGIN_SUCCESS)
   ↓
   Return tokens to user
```

**DB State:**
- auth_contexts: 1 row
- auth_transactions: 0 rows
- drs_evaluations: 1 row
- sessions: 1 row
- tokens: 3 rows
- audit_logs: 2 entries (DRS_EVALUATION, LOGIN_SUCCESS)

---

### Complex Login (MFA → eSign → Device Bind)

```
1. POST /auth/login
   ↓
   INSERT auth_contexts (ctx-1)
   INSERT drs_evaluations
   INSERT auth_transactions (tx-1: MFA_INITIATE, status=PENDING)
   INSERT audit_logs (LOGIN_ATTEMPT)
   ↓
   Return: context_id + transaction_id

2. POST /auth/mfa/initiate
   ↓
   UPDATE auth_transactions (tx-1: status=CONSUMED)
   INSERT auth_transactions (tx-2: MFA_VERIFY, status=PENDING)
   INSERT audit_logs (MFA_CHALLENGE_SENT)
   ↓
   Return: new transaction_id

3. POST /auth/mfa/otp/verify
   ↓
   UPDATE auth_transactions (tx-2: status=CONSUMED, result=CORRECT)
   INSERT auth_transactions (tx-3: ESIGN_PRESENT, status=PENDING)
   INSERT audit_logs (MFA_VERIFY_SUCCESS)
   ↓
   Return: esign required + new transaction_id

4. POST /esign/accept
   ↓
   UPDATE auth_transactions (tx-3: status=CONSUMED)
   INSERT auth_transactions (tx-4: DEVICE_BIND, status=PENDING)
   INSERT audit_logs (ESIGN_ACCEPTED)
   ↓
   Return: device bind required + new transaction_id

5. POST /device/bind
   ↓
   UPDATE auth_transactions (tx-4: status=CONSUMED)
   UPDATE auth_contexts (auth_outcome=SUCCESS)
   INSERT sessions
   INSERT tokens (3 rows)
   INSERT trusted_devices
   INSERT audit_logs (DEVICE_BIND_ACCEPTED, LOGIN_SUCCESS)
   ↓
   Return: tokens to user
```

**DB State:**
- auth_contexts: 1 row
- auth_transactions: 4 rows (all CONSUMED)
- drs_evaluations: 1 row
- sessions: 1 row
- tokens: 3 rows
- trusted_devices: 1 row
- audit_logs: 8 entries

---

## Index Strategy

### Primary Indexes (Auto-created with PK)

- auth_contexts.context_id
- auth_transactions.transaction_id
- sessions.session_id
- tokens.token_id
- trusted_devices.device_id
- drs_evaluations.evaluation_id
- audit_logs.audit_id

### Secondary Indexes

```sql
-- auth_contexts
CREATE INDEX idx_auth_ctx_cupid ON auth_contexts(cupid);
CREATE INDEX idx_auth_ctx_expires ON auth_contexts(expires_at) WHERE auth_outcome IS NULL;

-- auth_transactions (CRITICAL)
CREATE INDEX idx_auth_tx_context ON auth_transactions(context_id, sequence_number);
CREATE UNIQUE INDEX idx_auth_tx_context_pending ON auth_transactions(context_id) WHERE transaction_status = 'PENDING';
CREATE INDEX idx_auth_tx_status ON auth_transactions(transaction_status, expires_at);

-- sessions
CREATE INDEX idx_sessions_cupid ON sessions(cupid) WHERE status = 'ACTIVE';
CREATE INDEX idx_sessions_context ON sessions(context_id);
CREATE INDEX idx_sessions_status_expires ON sessions(status, expires_at);

-- tokens (CRITICAL)
CREATE UNIQUE INDEX idx_tokens_value_hash ON tokens(token_value_hash) WHERE status = 'ACTIVE';
CREATE INDEX idx_tokens_session ON tokens(session_id, token_type);
CREATE INDEX idx_tokens_parent ON tokens(parent_token_id);
CREATE INDEX idx_tokens_expires ON tokens(expires_at) WHERE status = 'ACTIVE';

-- trusted_devices
CREATE INDEX idx_devices_cupid ON trusted_devices(cupid) WHERE status = 'ACTIVE';
CREATE INDEX idx_devices_fingerprint_hash ON trusted_devices(device_fingerprint_hash);

-- drs_evaluations
CREATE INDEX idx_drs_context ON drs_evaluations(context_id);
CREATE INDEX idx_drs_recommendation ON drs_evaluations(recommendation);
CREATE INDEX idx_drs_risk_score ON drs_evaluations(risk_score);
CREATE INDEX idx_drs_cupid_time ON drs_evaluations(cupid, created_at DESC);

-- audit_logs
CREATE INDEX idx_audit_cupid_time ON audit_logs(cupid, created_at DESC);
CREATE INDEX idx_audit_event_type ON audit_logs(event_type, created_at DESC);
CREATE INDEX idx_audit_context ON audit_logs(context_id);
CREATE INDEX idx_audit_session ON audit_logs(session_id);
CREATE INDEX idx_audit_correlation ON audit_logs(correlation_id);
CREATE INDEX idx_audit_severity ON audit_logs(severity, created_at DESC) WHERE severity IN ('ERROR', 'CRITICAL');
```

---

## Constraints Summary

### Foreign Keys
- auth_transactions.context_id → auth_contexts.context_id
- auth_transactions.parent_transaction_id → auth_transactions.transaction_id
- sessions.context_id → auth_contexts.context_id
- tokens.session_id → sessions.session_id (ON DELETE CASCADE)
- tokens.parent_token_id → tokens.token_id
- drs_evaluations.context_id → auth_contexts.context_id

### Check Constraints
- auth_transactions: transaction_status/consumed_at consistency
- tokens: session + token_type + status unique when ACTIVE
- drs_evaluations: risk_score BETWEEN 0 AND 100

### Unique Constraints
- tokens: (token_value_hash) WHERE status = 'ACTIVE'
- auth_transactions: (context_id) WHERE transaction_status = 'PENDING'

---

## Views for Common Queries

### v_active_sessions
```sql
CREATE VIEW v_active_sessions AS
SELECT
    s.session_id,
    s.cupid,
    s.device_fingerprint,
    s.ip_address,
    s.created_at,
    s.last_activity_at,
    COUNT(t.token_id) FILTER (WHERE t.status = 'ACTIVE') as active_token_count
FROM sessions s
LEFT JOIN tokens t ON t.session_id = s.session_id
WHERE s.status = 'ACTIVE'
GROUP BY s.session_id;
```

### v_pending_transactions
```sql
CREATE VIEW v_pending_transactions AS
SELECT
    t.transaction_id,
    t.context_id,
    c.cupid,
    t.transaction_type,
    t.phase,
    t.created_at,
    t.expires_at,
    (t.expires_at - NOW()) as time_remaining
FROM auth_transactions t
JOIN auth_contexts c ON c.context_id = t.context_id
WHERE t.transaction_status = 'PENDING'
  AND t.expires_at > NOW();
```

---

**Document Version:** 1.0
**Last Updated:** October 2025
