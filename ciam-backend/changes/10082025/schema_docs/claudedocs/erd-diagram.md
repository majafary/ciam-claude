# CIAM Database - Entity Relationship Diagram (Detailed)

**Database:** PostgreSQL 14+
**Tables:** 7 Core Tables + 4 Views
**Version:** 1.1
**Date:** October 2025

---

## Table of Contents
1. [High-Level Architecture](#high-level-architecture)
2. [Detailed Table Schemas](#detailed-table-schemas)
3. [Relationships and Foreign Keys](#relationships-and-foreign-keys)
4. [Index Strategy](#index-strategy)
5. [Views](#views)
6. [Data Flow Examples](#data-flow-examples)

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

## Detailed Table Schemas

### TABLE 1: auth_contexts

**Purpose:** Immutable container for authentication journey
**Lifecycle:** INSERT once → UPDATE once (final outcome)
**Records:** ~1M per day (all login attempts)
**Retention:** 90 days

```
┌──────────────────────────────────────────────────────────────────────────┐
│ auth_contexts                                                            │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ 🔑 PRIMARY KEY                                                           │
│   context_id                 UUID          PK, DEFAULT gen_random_uuid()│
│                                                                          │
│ 🏢 CUSTOMER & USER IDENTITY                                              │
│   guid                       VARCHAR(50)   NOT NULL                     │
│                              (Customer level identifier)                │
│   cupid                      VARCHAR(50)   NOT NULL                     │
│                              (User identifier from LDAP)                │
│   username                   VARCHAR(100)  NOT NULL                     │
│                              (Login username before LDAP validation)    │
│                                                                          │
│ 📱 APPLICATION CONTEXT                                                   │
│   app_id                     VARCHAR(50)   NOT NULL                     │
│   app_version                VARCHAR(20)   NOT NULL                     │
│                                            CHECK: semver format         │
│                                                                          │
│ 🌐 DEVICE & NETWORK                                                      │
│   device_fingerprint         TEXT          NULL                         │
│   ip_address                 INET          NOT NULL                     │
│                                                                          │
│ 🔍 TRACING                                                               │
│   correlation_id             UUID          NULL                         │
│                                                                          │
│ 🔄 JOURNEY METADATA                                                      │
│   requires_additional_steps  BOOLEAN       DEFAULT FALSE                │
│                                                                          │
│ ✅ FINAL OUTCOME                                                         │
│   auth_outcome               VARCHAR(50)   NULL                         │
│                              Values: SUCCESS, EXPIRED, ABANDONED, FAILED│
│   completed_at               TIMESTAMPTZ   NULL                         │
│                                                                          │
│ ⏰ LIFECYCLE                                                             │
│   created_at                 TIMESTAMPTZ   NOT NULL, DEFAULT NOW()      │
│   expires_at                 TIMESTAMPTZ   NOT NULL                     │
│                              DEFAULT NOW() + 15 min                     │
│                              CHECK: expires_at > created_at (v1.1)      │
│                                                                          │
│ ⚙️  CONSTRAINTS                                                          │
│   check_outcome_completed: outcome and completed_at must be both NULL  │
│                            or both NOT NULL                             │
│   check_context_expiry_future: expires_at > created_at                  │
│   check_app_version_format: matches semver pattern (v1.1)               │
│                                                                          │
│ 📊 INDEXES                                                               │
│   idx_auth_ctx_guid: (guid)                                             │
│   idx_auth_ctx_cupid: (cupid)                                           │
│   idx_auth_ctx_correlation: (correlation_id)                            │
│   idx_auth_ctx_expires: (expires_at) WHERE auth_outcome IS NULL         │
│   idx_auth_ctx_created: (created_at DESC)                               │
│                                                                          │
│ 🔗 RELATIONSHIPS                                                         │
│   → auth_transactions (1:N)                                             │
│   → drs_evaluations (1:N)                                               │
│   → sessions (1:1)                                                      │
└──────────────────────────────────────────────────────────────────────────┘
```

---

### TABLE 2: auth_transactions

**Purpose:** Step-by-step event log with single-use transaction tokens
**Lifecycle:** INSERT → status=PENDING → UPDATE to CONSUMED → INSERT next
**Records:** ~3-5 per context (with MFA/eSign/device bind flow)
**Retention:** 90 days

```
┌──────────────────────────────────────────────────────────────────────────┐
│ auth_transactions                                                        │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ 🔑 PRIMARY KEY                                                           │
│   transaction_id             UUID          PK, DEFAULT gen_random_uuid()│
│                                                                          │
│ 🔗 FOREIGN KEYS                                                          │
│   context_id                 UUID          NOT NULL                     │
│                              FK → auth_contexts(context_id)             │
│                              ON DELETE CASCADE                           │
│   parent_transaction_id      UUID          NULL                         │
│                              FK → auth_transactions(transaction_id)     │
│                                                                          │
│ 🎯 TRANSACTION IDENTITY                                                  │
│   transaction_type           VARCHAR(50)   NOT NULL                     │
│                              Values: MFA_INITIATE, MFA_VERIFY,          │
│                                      MFA_PUSH_VERIFY, ESIGN_PRESENT,    │
│                                      ESIGN_ACCEPT, DEVICE_BIND          │
│   transaction_status         VARCHAR(20)   NOT NULL, DEFAULT 'PENDING'  │
│                              Values: PENDING, CONSUMED, EXPIRED,        │
│                                      REJECTED                           │
│   sequence_number            INT           NOT NULL                     │
│                              CHECK: > 0                                 │
│   phase                      VARCHAR(50)   NOT NULL                     │
│                              Values: MFA, ESIGN, DEVICE_BIND            │
│                                                                          │
│ 📱 MFA PHASE FIELDS                                                      │
│   mfa_method                 VARCHAR(10)   NULL                         │
│                              Values: sms, voice, push                   │
│   mfa_option_id              SMALLINT      NULL                         │
│                              CHECK: BETWEEN 1 AND 6                     │
│   mfa_options                JSONB         NULL                         │
│                              Format: [{"phone_last_four": "1234", ...}] │
│   mobile_approve_status      VARCHAR(20)   NULL                         │
│                              Values: NOT_REGISTERED, ENABLED, DISABLED  │
│   display_number             INT           NULL                         │
│   selected_number            INT           NULL                         │
│   verification_result        VARCHAR(20)   NULL                         │
│                              Values: CORRECT, INCORRECT, TIMEOUT        │
│   attempt_number             INT           NULL                         │
│                                                                          │
│ ✍️  ESIGN PHASE FIELDS                                                   │
│   esign_document_id          VARCHAR(100)  NULL                         │
│   esign_action               VARCHAR(20)   NULL                         │
│                              Values: PRESENTED, ACCEPTED                │
│                                                                          │
│ 📲 DEVICE BIND PHASE FIELDS                                              │
│   device_bind_decision       VARCHAR(20)   NULL                         │
│                              Values: OFFERED, ACCEPTED, DECLINED        │
│                                                                          │
│ ⏰ LIFECYCLE                                                             │
│   consumed_at                TIMESTAMPTZ   NULL                         │
│   created_at                 TIMESTAMPTZ   NOT NULL, DEFAULT NOW()      │
│   expires_at                 TIMESTAMPTZ   NOT NULL                     │
│                              DEFAULT NOW() + 5 min                      │
│                              CHECK: expires_at > created_at (v1.1)      │
│                                                                          │
│ ⚙️  CONSTRAINTS                                                          │
│   check_consumed: status=PENDING → consumed_at IS NULL                  │
│                   status!=PENDING → consumed_at IS NOT NULL             │
│   check_sequence_positive: sequence_number > 0                          │
│   check_transaction_expiry_future: expires_at > created_at              │
│                                                                          │
│ 📊 INDEXES                                                               │
│   idx_auth_tx_context: (context_id, sequence_number)                    │
│   idx_auth_tx_parent: (parent_transaction_id)                           │
│   idx_auth_tx_status: (transaction_status, expires_at)                  │
│   idx_auth_tx_context_pending: UNIQUE(context_id)                       │
│                                WHERE transaction_status = 'PENDING'     │
│                                                                          │
│ 🔗 RELATIONSHIPS                                                         │
│   ← auth_contexts (N:1)                                                 │
│   ↔ auth_transactions (parent chain, self-referencing)                  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

### TABLE 3: sessions

**Purpose:** Active user sessions (supports multi-device)
**Lifecycle:** Created after successful auth, expires or gets revoked
**Records:** ~500K active sessions at any time
**Retention:** Active only, deleted after expiry/revocation

```
┌──────────────────────────────────────────────────────────────────────────┐
│ sessions                                                                 │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ 🔑 PRIMARY KEY                                                           │
│   session_id                 UUID          PK, DEFAULT gen_random_uuid()│
│                                                                          │
│ 🔗 FOREIGN KEYS                                                          │
│   context_id                 UUID          NOT NULL                     │
│                              FK → auth_contexts(context_id)             │
│                                                                          │
│ 👤 USER IDENTITY                                                         │
│   cupid                      VARCHAR(50)   NOT NULL                     │
│                                                                          │
│ 🌐 DEVICE & NETWORK                                                      │
│   device_fingerprint         TEXT          NULL                         │
│   ip_address                 INET          NOT NULL                     │
│   user_agent                 TEXT          NULL                         │
│                                                                          │
│ 🎯 SESSION STATE                                                         │
│   status                     VARCHAR(20)   NOT NULL, DEFAULT 'ACTIVE'   │
│                              Values: ACTIVE, EXPIRED, REVOKED,          │
│                                      LOGGED_OUT                         │
│                                                                          │
│ ⏰ LIFECYCLE                                                             │
│   created_at                 TIMESTAMPTZ   NOT NULL, DEFAULT NOW()      │
│   last_activity_at           TIMESTAMPTZ   NOT NULL, DEFAULT NOW()      │
│   expires_at                 TIMESTAMPTZ   NOT NULL                     │
│                              DEFAULT NOW() + 30 days                    │
│                              CHECK: expires_at > created_at (v1.1)      │
│                                                                          │
│ 🚫 REVOCATION                                                            │
│   revoked_at                 TIMESTAMPTZ   NULL                         │
│   revoked_by                 VARCHAR(100)  NULL                         │
│                              Values: Agent ID or SYSTEM                 │
│   revocation_reason          TEXT          NULL                         │
│                                                                          │
│ ⚙️  CONSTRAINTS                                                          │
│   check_revoked: status!=REVOKED → revoked_at IS NULL                   │
│                  status=REVOKED → revoked_at IS NOT NULL                │
│   check_session_expiry_future: expires_at > created_at                  │
│                                                                          │
│ 📊 INDEXES                                                               │
│   idx_sessions_cupid: (cupid) WHERE status = 'ACTIVE'                   │
│   idx_sessions_context: (context_id)                                    │
│   idx_sessions_status_expires: (status, expires_at)                     │
│   idx_sessions_created: (created_at DESC)                               │
│                                                                          │
│ 🔗 RELATIONSHIPS                                                         │
│   ← auth_contexts (1:1)                                                 │
│   → tokens (1:N)                                                        │
└──────────────────────────────────────────────────────────────────────────┘
```

---

### TABLE 4: tokens

**Purpose:** Access/Refresh/ID tokens with rotation chain tracking
**Lifecycle:** Created with session, rotated on refresh, revoked on logout
**Records:** ~1.5M active tokens (3 per session)
**Retention:** Active only, cleaned up with session

```
┌──────────────────────────────────────────────────────────────────────────┐
│ tokens                                                                   │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ 🔑 PRIMARY KEY                                                           │
│   token_id                   UUID          PK, DEFAULT gen_random_uuid()│
│                                                                          │
│ 🔗 FOREIGN KEYS                                                          │
│   session_id                 UUID          NOT NULL                     │
│                              FK → sessions(session_id)                  │
│                              ON DELETE CASCADE                           │
│   parent_token_id            UUID          NULL                         │
│                              FK → tokens(token_id)                      │
│                              (rotation chain, self-referencing)         │
│                                                                          │
│ 🎫 TOKEN IDENTITY                                                        │
│   token_type                 VARCHAR(20)   NOT NULL                     │
│                              Values: ACCESS, REFRESH, ID                │
│   token_value                TEXT          NOT NULL                     │
│                              (JWT or opaque token)                      │
│   token_value_hash           VARCHAR(64)   NOT NULL                     │
│                              (SHA256 for fast lookup)                   │
│                                                                          │
│ 🎯 TOKEN STATE                                                           │
│   status                     VARCHAR(20)   NOT NULL, DEFAULT 'ACTIVE'   │
│                              Values: ACTIVE, ROTATED, REVOKED, EXPIRED  │
│                                                                          │
│ ⏰ LIFECYCLE                                                             │
│   created_at                 TIMESTAMPTZ   NOT NULL, DEFAULT NOW()      │
│   expires_at                 TIMESTAMPTZ   NOT NULL                     │
│                              ACCESS/ID: 15 min, REFRESH: 30 days        │
│                              CHECK: expires_at > created_at (v1.1)      │
│   revoked_at                 TIMESTAMPTZ   NULL                         │
│                                                                          │
│ ⚙️  CONSTRAINTS                                                          │
│   check_token_revoked: status!=REVOKED → revoked_at IS NULL             │
│                        status=REVOKED → revoked_at IS NOT NULL          │
│   check_token_expiry_future: expires_at > created_at                    │
│                                                                          │
│ 📊 INDEXES                                                               │
│   idx_tokens_value_hash: UNIQUE(token_value_hash)                       │
│                          WHERE status = 'ACTIVE'                        │
│   idx_tokens_session: (session_id, token_type)                          │
│   idx_tokens_parent: (parent_token_id)                                  │
│   idx_tokens_expires: (expires_at) WHERE status = 'ACTIVE'              │
│   idx_tokens_session_type_active: UNIQUE(session_id, token_type)        │
│                                   WHERE status = 'ACTIVE'               │
│                                                                          │
│ 🔗 RELATIONSHIPS                                                         │
│   ← sessions (N:1)                                                      │
│   ↔ tokens (rotation chain, self-referencing)                           │
│                                                                          │
│ 🔐 SECURITY NOTE                                                         │
│   Rotation chain enables stolen token detection (OAuth 2.1)             │
│   Example: token1(ROTATED) → token2(ROTATED) → token3(ACTIVE)           │
└──────────────────────────────────────────────────────────────────────────┘
```

---

### TABLE 5: trusted_devices

**Purpose:** Device binding for MFA skip on trusted devices
**Lifecycle:** Created on device bind acceptance, revoked manually or expires
**Records:** ~100K trusted devices per 1M users
**Retention:** Until revoked or expired

```
┌──────────────────────────────────────────────────────────────────────────┐
│ trusted_devices                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ 🔑 PRIMARY KEY                                                           │
│   device_id                  UUID          PK, DEFAULT gen_random_uuid()│
│                                                                          │
│ 🏢 CUSTOMER & USER IDENTITY                                              │
│   guid                       VARCHAR(50)   NOT NULL                     │
│                              (Customer level identifier)                │
│   cupid                      VARCHAR(50)   NOT NULL                     │
│                              (User identifier)                          │
│                                                                          │
│ 📱 APPLICATION CONTEXT                                                   │
│   app_id                     VARCHAR(50)   NOT NULL                     │
│                              (Device trust scoped per application)      │
│                                                                          │
│ 📱 DEVICE IDENTITY                                                       │
│   device_fingerprint         TEXT          NOT NULL                     │
│                              (Raw fingerprint data)                     │
│   device_fingerprint_hash    VARCHAR(64)   NOT NULL                     │
│                              (SHA256 for fast lookup)                   │
│                                                                          │
│ ℹ️  DEVICE METADATA                                                      │
│   device_name                VARCHAR(200)  NULL                         │
│                              (User-friendly name)                       │
│   device_type                VARCHAR(50)   NULL                         │
│                              Values: BROWSER, MOBILE_APP, TABLET,       │
│                                      DESKTOP_APP                        │
│                                                                          │
│ 🎯 TRUST STATE                                                           │
│   status                     VARCHAR(20)   NOT NULL, DEFAULT 'ACTIVE'   │
│                              Values: ACTIVE, REVOKED, EXPIRED           │
│                                                                          │
│ ⏰ LIFECYCLE                                                             │
│   trusted_at                 TIMESTAMPTZ   NOT NULL, DEFAULT NOW()      │
│   last_used_at               TIMESTAMPTZ   NOT NULL, DEFAULT NOW()      │
│   revoked_at                 TIMESTAMPTZ   NULL                         │
│                                                                          │
│ ⚙️  CONSTRAINTS                                                          │
│   check_device_revoked: status!=REVOKED → revoked_at IS NULL            │
│                         status=REVOKED → revoked_at IS NOT NULL         │
│                                                                          │
│ 📊 INDEXES                                                               │
│   idx_devices_guid: (guid)                                               │
│   idx_devices_cupid_app: (cupid, app_id) WHERE status = 'ACTIVE'        │
│   idx_devices_fingerprint_hash: (device_fingerprint_hash)               │
│   idx_devices_trusted: (trusted_at DESC)                                │
│   idx_devices_unique_per_user_app: UNIQUE(cupid, app_id,                │
│                                    device_fingerprint_hash)             │
│                                    WHERE status = 'ACTIVE'              │
│                                                                          │
│ 🔗 RELATIONSHIPS                                                         │
│   Logical: cupid links to LDAP user (no FK to LDAP)                    │
│   Multi-device: One CUPID → Multiple trusted devices per app            │
│   Scoping: Device trust is app-specific                                 │
└──────────────────────────────────────────────────────────────────────────┘
```

---

### TABLE 6: drs_evaluations

**Purpose:** Device Recognition Service (Transmit DRS) risk assessments
**Lifecycle:** Created on each login attempt with DRS token
**Records:** ~1M per day (one per login attempt)
**Retention:** 90 days

```
┌──────────────────────────────────────────────────────────────────────────┐
│ drs_evaluations                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ 🔑 PRIMARY KEY                                                           │
│   evaluation_id              UUID          PK, DEFAULT gen_random_uuid()│
│                                                                          │
│ 🔗 FOREIGN KEYS                                                          │
│   context_id                 UUID          NOT NULL                     │
│                              FK → auth_contexts(context_id)             │
│                              ON DELETE CASCADE                           │
│                                                                          │
│ 🏢 CUSTOMER & USER IDENTITY                                              │
│   guid                       VARCHAR(50)   NOT NULL                     │
│                              (Customer level identifier)                │
│   cupid                      VARCHAR(50)   NOT NULL                     │
│                              (User identifier)                          │
│                                                                          │
│ 🎫 DRS REQUEST                                                           │
│   action_token_hash          VARCHAR(64)   NOT NULL                     │
│                              (SHA256 of DRS action token)               │
│                              Indexed for deduplication (v1.1)           │
│                                                                          │
│ 📊 DRS RESPONSE                                                          │
│   device_id                  VARCHAR(100)  NULL                         │
│                              (DRS device identifier)                    │
│   recommendation             VARCHAR(20)   NOT NULL                     │
│                              Values: ALLOW, CHALLENGE, DENY, TRUST      │
│   risk_score                 INT           NOT NULL                     │
│                              CHECK: BETWEEN 0 AND 100                   │
│                              0-30=Low, 31-70=Medium, 71-100=High        │
│                                                                          │
│ 🖥️  DEVICE ATTRIBUTES (FLATTENED)                                        │
│   browser                    VARCHAR(100)  NULL                         │
│   browser_version            VARCHAR(50)   NULL                         │
│   operating_system           VARCHAR(100)  NULL                         │
│   os_version                 VARCHAR(50)   NULL                         │
│   device_type                VARCHAR(50)   NULL                         │
│                              (mobile, desktop, tablet)                  │
│   is_mobile                  BOOLEAN       NULL                         │
│   screen_resolution          VARCHAR(20)   NULL                         │
│   user_agent                 TEXT          NULL                         │
│   ip_location                VARCHAR(100)  NULL                         │
│                              (City, State, Country from IP)             │
│                                                                          │
│ 🚨 RISK SIGNALS (FLATTENED)                                              │
│   primary_signal_type        VARCHAR(50)   NULL                         │
│                              (Most significant signal)                  │
│   signal_count               INT           NULL                         │
│                              (Total number of signals)                  │
│   has_high_risk_signals      BOOLEAN       NULL                         │
│                              (Any HIGH severity signals)                │
│   signal_types               TEXT[]        NULL                         │
│                              (Array of all signal types)                │
│                              Example: {NEW_DEVICE,VPN_DETECTED}         │
│                                                                          │
│ 📝 FULL RESPONSE                                                         │
│   raw_response               JSONB         NOT NULL                     │
│                              (Complete DRS response for audit)          │
│                                                                          │
│ ⏰ LIFECYCLE                                                             │
│   created_at                 TIMESTAMPTZ   NOT NULL, DEFAULT NOW()      │
│                                                                          │
│ ⚙️  CONSTRAINTS                                                          │
│   CHECK: risk_score BETWEEN 0 AND 100                                   │
│                                                                          │
│ 📊 INDEXES                                                               │
│   idx_drs_context: (context_id)                                         │
│   idx_drs_guid: (guid)                                                  │
│   idx_drs_cupid_time: (cupid, created_at DESC)                          │
│   idx_drs_recommendation: (recommendation)                              │
│   idx_drs_risk_score: (risk_score)                                      │
│   idx_drs_created: (created_at DESC)                                    │
│   idx_drs_action_token: (action_token_hash) [v1.1 - deduplication]     │
│   idx_drs_browser: (browser)                                            │
│   idx_drs_os: (operating_system)                                        │
│   idx_drs_device_type: (device_type)                                    │
│   idx_drs_is_mobile: (is_mobile)                                        │
│   idx_drs_primary_signal: (primary_signal_type)                         │
│   idx_drs_high_risk: (has_high_risk_signals) WHERE TRUE                 │
│   idx_drs_signal_types: GIN(signal_types)                               │
│                                                                          │
│ 🔗 RELATIONSHIPS                                                         │
│   ← auth_contexts (N:1)                                                 │
│                                                                          │
│ 🎯 USE CASES                                                             │
│   - Fraud detection and monitoring                                      │
│   - Adaptive authentication decisions                                   │
│   - Risk-based security policies                                        │
│   - Device analytics (browser/OS distribution)                          │
│   - Signal pattern analysis for security research                       │
│                                                                          │
│ 📝 NOTES                                                                 │
│   Flattened attributes enable efficient querying without JSONB          │
│   extraction. raw_response retained for audit and future fields.        │
└──────────────────────────────────────────────────────────────────────────┘
```

---

### TABLE 7: audit_logs (PARTITIONED)

**Purpose:** Comprehensive event timeline for all system activity
**Lifecycle:** INSERT only (immutable), partitioned monthly for retention
**Records:** ~10M per day (all events)
**Retention:** 2 years (partitioned by month)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ audit_logs (PARTITIONED BY MONTH)                                        │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ 🔑 PRIMARY KEY                                                           │
│   audit_id                   UUID          NOT NULL                     │
│                              DEFAULT gen_random_uuid()                  │
│                              Note: PK defined on each partition          │
│                                                                          │
│ 🏷️  EVENT CLASSIFICATION                                                 │
│   event_type                 VARCHAR(100)  NOT NULL                     │
│                              Examples: LOGIN_SUCCESS, MFA_VERIFY_FAILED,│
│                                          TOKEN_REFRESHED                │
│   event_category             VARCHAR(50)   NOT NULL                     │
│                              Values: AUTH, MFA, ESIGN, DEVICE, TOKEN,   │
│                                      SESSION, SECURITY                  │
│   severity                   VARCHAR(20)   NOT NULL, DEFAULT 'INFO'     │
│                              Values: INFO, WARN, ERROR, CRITICAL        │
│                                                                          │
│ 🔗 ENTITY REFERENCES (NULLABLE)                                          │
│   cupid                      VARCHAR(50)   NULL                         │
│   context_id                 UUID          NULL                         │
│   transaction_id             UUID          NULL                         │
│   session_id                 UUID          NULL                         │
│                                                                          │
│ 🌐 REQUEST CONTEXT                                                       │
│   correlation_id             UUID          NULL                         │
│                              (for distributed tracing)                  │
│   ip_address                 INET          NULL                         │
│   user_agent                 TEXT          NULL                         │
│                                                                          │
│ 📋 EVENT DETAILS                                                         │
│   event_data                 JSONB         NOT NULL                     │
│                              (Flexible event-specific details)          │
│                                                                          │
│ ⏰ LIFECYCLE                                                             │
│   created_at                 TIMESTAMPTZ   NOT NULL, DEFAULT NOW()      │
│                              (Partition key)                            │
│                                                                          │
│ 📊 INDEXES                                                               │
│   idx_audit_cupid_time: (cupid, created_at DESC)                        │
│   idx_audit_event_type: (event_type, created_at DESC)                   │
│   idx_audit_event_category: (event_category, created_at DESC)           │
│   idx_audit_context: (context_id)                                       │
│   idx_audit_transaction: (transaction_id)                               │
│   idx_audit_session: (session_id)                                       │
│   idx_audit_correlation: (correlation_id)                               │
│   idx_audit_severity: (severity, created_at DESC)                       │
│                       WHERE severity IN ('ERROR', 'CRITICAL')           │
│                                                                          │
│ 🗂️  PARTITIONS                                                           │
│   PARTITION BY RANGE (created_at)                                       │
│   Example partitions:                                                   │
│     - audit_logs_2025_10: Oct 1-31, 2025                                │
│     - audit_logs_2025_11: Nov 1-30, 2025                                │
│     - audit_logs_2025_12: Dec 1-31, 2025                                │
│   Auto-created monthly via create_next_audit_partition()                │
│                                                                          │
│ 🔗 RELATIONSHIPS                                                         │
│   No FKs (allows event logging even after entity deletion)              │
│   Soft links via UUID references                                        │
│                                                                          │
│ 🎯 USE CASES                                                             │
│   - Complete audit trail for compliance                                 │
│   - Security monitoring and incident response                           │
│   - User activity timeline                                              │
│   - Fraud detection and analytics                                       │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Relationships and Foreign Keys

### Foreign Key Relationships Diagram

```
auth_contexts
    │
    ├─[1:N]─→ auth_transactions (context_id)
    │           │
    │           └─[self-ref]─→ auth_transactions (parent_transaction_id)
    │
    ├─[1:N]─→ drs_evaluations (context_id)
    │
    └─[1:1]─→ sessions (context_id)
                │
                └─[1:N]─→ tokens (session_id)
                            │
                            └─[self-ref]─→ tokens (parent_token_id)

trusted_devices
    (Logical relationship to LDAP via cupid, no FK)

audit_logs
    (No FKs - soft references via UUIDs)
```

### Foreign Key Details

| Child Table | Child Column | Parent Table | Parent Column | Delete Behavior |
|------------|--------------|--------------|---------------|-----------------|
| auth_transactions | context_id | auth_contexts | context_id | CASCADE |
| auth_transactions | parent_transaction_id | auth_transactions | transaction_id | (none) |
| drs_evaluations | context_id | auth_contexts | context_id | CASCADE |
| sessions | context_id | auth_contexts | context_id | (none) |
| tokens | session_id | sessions | session_id | CASCADE |
| tokens | parent_token_id | tokens | token_id | (none) |

**CASCADE Behavior:**
- Deleting an `auth_contexts` row cascades to `auth_transactions` and `drs_evaluations`
- Deleting a `sessions` row cascades to all associated `tokens`

---

## Index Strategy

### Performance-Critical Indexes

**Token Validation (Sub-1ms requirement):**
```sql
idx_tokens_value_hash: UNIQUE(token_value_hash) WHERE status = 'ACTIVE'
-- Enables: SELECT * FROM tokens WHERE token_value_hash = ? AND status = 'ACTIVE'
```

**Active Transaction Lookup:**
```sql
idx_auth_tx_context_pending: UNIQUE(context_id) WHERE transaction_status = 'PENDING'
-- Ensures: Only 1 pending transaction per context
-- Enables: SELECT * FROM auth_transactions WHERE context_id = ? AND status = 'PENDING'
```

**Session Queries:**
```sql
idx_sessions_cupid: (cupid) WHERE status = 'ACTIVE'
-- Enables: SELECT * FROM sessions WHERE cupid = ? AND status = 'ACTIVE'
```

### Partial Indexes (Space Efficient)

Partial indexes only index rows matching the WHERE clause, saving space:

```sql
-- Only index active sessions (most queries filter on status = 'ACTIVE')
idx_sessions_cupid: (cupid) WHERE status = 'ACTIVE'

-- Only index incomplete contexts (completed ones aren't queried)
idx_auth_ctx_expires: (expires_at) WHERE auth_outcome IS NULL

-- Only index active tokens for validation
idx_tokens_expires: (expires_at) WHERE status = 'ACTIVE'

-- Only index error/critical audit logs for monitoring
idx_audit_severity: (severity, created_at DESC) WHERE severity IN ('ERROR', 'CRITICAL')
```

### Index Coverage Analysis

**All Foreign Keys Have Indexes:**
- ✅ auth_transactions.context_id → idx_auth_tx_context
- ✅ auth_transactions.parent_transaction_id → idx_auth_tx_parent
- ✅ drs_evaluations.context_id → idx_drs_context
- ✅ sessions.context_id → idx_sessions_context
- ✅ tokens.session_id → idx_tokens_session
- ✅ tokens.parent_token_id → idx_tokens_parent

**Verification Query:**
```sql
-- Run this to verify all FKs have indexes
SELECT
    tc.table_name,
    kcu.column_name AS fk_column,
    ccu.table_name AS referenced_table,
    CASE
        WHEN i.indexname IS NULL THEN '❌ MISSING INDEX'
        ELSE '✅ INDEX EXISTS: ' || i.indexname
    END AS index_status
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
LEFT JOIN pg_indexes i
    ON i.tablename = tc.table_name
    AND i.indexdef LIKE '%' || kcu.column_name || '%'
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;
```

---

## Views

### VIEW 1: v_active_sessions

**Purpose:** Active sessions with token counts for monitoring

```sql
CREATE VIEW v_active_sessions AS
SELECT
    s.session_id,
    s.cupid,
    s.device_fingerprint,
    s.ip_address,
    s.user_agent,
    s.created_at,
    s.last_activity_at,
    s.expires_at,
    COUNT(t.token_id) FILTER (WHERE t.status = 'ACTIVE') as active_token_count,
    COUNT(t.token_id) FILTER (WHERE t.token_type = 'ACCESS' AND t.status = 'ACTIVE') as has_access_token,
    COUNT(t.token_id) FILTER (WHERE t.token_type = 'REFRESH' AND t.status = 'ACTIVE') as has_refresh_token
FROM sessions s
LEFT JOIN tokens t ON t.session_id = s.session_id
WHERE s.status = 'ACTIVE'
GROUP BY s.session_id;
```

**Use Case:** Dashboard showing active sessions and token health

---

### VIEW 2: v_pending_transactions

**Purpose:** Currently active transactions awaiting user action

```sql
CREATE VIEW v_pending_transactions AS
SELECT
    t.transaction_id,
    t.context_id,
    c.cupid,
    t.transaction_type,
    t.transaction_status,
    t.phase,
    t.sequence_number,
    t.attempt_number,
    t.created_at,
    t.expires_at,
    EXTRACT(EPOCH FROM (t.expires_at - NOW())) as seconds_until_expiry
FROM auth_transactions t
JOIN auth_contexts c ON c.context_id = t.context_id
WHERE t.transaction_status = 'PENDING'
  AND t.expires_at > NOW()
ORDER BY t.created_at DESC;
```

**Use Case:** Monitor incomplete authentication flows

---

### VIEW 3: v_high_risk_logins

**Purpose:** Login attempts with DRS risk score >= 70 for fraud monitoring

```sql
CREATE VIEW v_high_risk_logins AS
SELECT
    d.evaluation_id,
    d.cupid,
    d.context_id,
    d.recommendation,
    d.risk_score,
    d.signals,
    c.ip_address,
    c.auth_outcome,
    c.created_at
FROM drs_evaluations d
JOIN auth_contexts c ON c.context_id = d.context_id
WHERE d.risk_score >= 70
ORDER BY d.created_at DESC;
```

**Use Case:** Security monitoring dashboard

---

### VIEW 4: v_token_rotation_chains

**Purpose:** Token rotation history showing complete chain from original to current

```sql
CREATE VIEW v_token_rotation_chains AS
WITH RECURSIVE token_chain AS (
    -- Base: tokens without parents
    SELECT
        token_id, session_id, token_type, status, parent_token_id,
        created_at, revoked_at, 1 as generation
    FROM tokens
    WHERE parent_token_id IS NULL

    UNION ALL

    -- Recursive: tokens with parents
    SELECT
        t.token_id, t.session_id, t.token_type, t.status, t.parent_token_id,
        t.created_at, t.revoked_at, tc.generation + 1
    FROM tokens t
    JOIN token_chain tc ON t.parent_token_id = tc.token_id
)
SELECT
    session_id, token_type, token_id, parent_token_id, status, generation,
    created_at, revoked_at,
    EXTRACT(EPOCH FROM (COALESCE(revoked_at, NOW()) - created_at)) as lifetime_seconds
FROM token_chain
ORDER BY session_id, token_type, generation;
```

**Use Case:** Token rotation audit and stolen token detection

---

### VIEW 5: v_failed_login_attempts (v1.1)

**Purpose:** Failed login attempts in last hour (3+ attempts) for fraud detection

```sql
CREATE VIEW v_failed_login_attempts AS
SELECT
    a.cupid,
    a.ip_address,
    a.event_data->>'error_code' as error_code,
    COUNT(*) as attempt_count,
    MAX(a.created_at) as last_attempt_at,
    MIN(a.created_at) as first_attempt_at
FROM audit_logs a
WHERE a.event_type IN ('LOGIN_FAILED', 'MFA_VERIFY_FAILED', 'INVALID_CREDENTIALS')
  AND a.severity IN ('WARN', 'ERROR')
  AND a.created_at > NOW() - INTERVAL '1 hour'
GROUP BY a.cupid, a.ip_address, a.event_data->>'error_code'
HAVING COUNT(*) >= 3
ORDER BY attempt_count DESC, last_attempt_at DESC;
```

**Use Case:** Rate limiting and brute force detection

---

## Data Flow Examples

### Example 1: Simple Login (No MFA)

**API Flow:**
```
POST /auth/login {username, password}
```

**Database Operations:**
```sql
-- Step 1: Create auth context
INSERT INTO auth_contexts (context_id, cupid, app_id, ip_address, ...)
VALUES ('ctx-1', 'user123', 'mobile-app', '192.168.1.100', ...);

-- Step 2: DRS evaluation
INSERT INTO drs_evaluations (evaluation_id, context_id, cupid, recommendation, risk_score, ...)
VALUES ('eval-1', 'ctx-1', 'user123', 'ALLOW', 15, ...);

-- Step 3: DRS says ALLOW → create session
INSERT INTO sessions (session_id, context_id, cupid, ip_address, ...)
VALUES ('sess-1', 'ctx-1', 'user123', '192.168.1.100', ...);

-- Step 4: Create tokens (batch insert)
INSERT INTO tokens (token_id, session_id, token_type, token_value, expires_at, ...)
VALUES
  ('tok-1', 'sess-1', 'ACCESS', 'eyJ...', NOW() + INTERVAL '15 min', ...),
  ('tok-2', 'sess-1', 'REFRESH', 'eyJ...', NOW() + INTERVAL '30 days', ...),
  ('tok-3', 'sess-1', 'ID', 'eyJ...', NOW() + INTERVAL '15 min', ...);

-- Step 5: Update context outcome
UPDATE auth_contexts
SET auth_outcome = 'SUCCESS', completed_at = NOW()
WHERE context_id = 'ctx-1';

-- Step 6: Log audit events
INSERT INTO audit_logs (audit_id, event_type, cupid, context_id, event_data, ...)
VALUES
  ('audit-1', 'DRS_EVALUATION', 'user123', 'ctx-1', '{"recommendation": "ALLOW"}', ...),
  ('audit-2', 'LOGIN_SUCCESS', 'user123', 'ctx-1', '{"method": "password"}', ...);
```

**Final Database State:**
- auth_contexts: 1 row
- auth_transactions: 0 rows (no MFA required)
- drs_evaluations: 1 row
- sessions: 1 row
- tokens: 3 rows
- audit_logs: 2 entries

---

### Example 2: Complex Login (MFA → eSign → Device Bind)

**API Flow:**
```
POST /auth/login → POST /mfa/initiate → POST /mfa/verify → POST /esign/accept → POST /device/bind
```

**Database Operations:**

```sql
-- STEP 1: POST /auth/login
INSERT INTO auth_contexts (context_id, cupid, requires_additional_steps, ...)
VALUES ('ctx-1', 'user123', TRUE, ...);

INSERT INTO drs_evaluations (evaluation_id, context_id, recommendation, ...)
VALUES ('eval-1', 'ctx-1', 'CHALLENGE', ...);

INSERT INTO auth_transactions (transaction_id, context_id, transaction_type, transaction_status, sequence_number, phase, ...)
VALUES ('tx-1', 'ctx-1', 'MFA_INITIATE', 'PENDING', 1, 'MFA', ...);

-- STEP 2: POST /mfa/initiate
UPDATE auth_transactions
SET transaction_status = 'CONSUMED', consumed_at = NOW()
WHERE transaction_id = 'tx-1';

INSERT INTO auth_transactions (transaction_id, context_id, parent_transaction_id, transaction_type, transaction_status, sequence_number, phase, mfa_method, ...)
VALUES ('tx-2', 'ctx-1', 'tx-1', 'MFA_VERIFY', 'PENDING', 2, 'MFA', 'sms', ...);

-- STEP 3: POST /mfa/verify
UPDATE auth_transactions
SET transaction_status = 'CONSUMED', consumed_at = NOW(), verification_result = 'CORRECT'
WHERE transaction_id = 'tx-2';

INSERT INTO auth_transactions (transaction_id, context_id, parent_transaction_id, transaction_type, transaction_status, sequence_number, phase, ...)
VALUES ('tx-3', 'ctx-1', 'tx-2', 'ESIGN_PRESENT', 'PENDING', 3, 'ESIGN', ...);

-- STEP 4: POST /esign/accept
UPDATE auth_transactions
SET transaction_status = 'CONSUMED', consumed_at = NOW(), esign_action = 'ACCEPTED'
WHERE transaction_id = 'tx-3';

INSERT INTO auth_transactions (transaction_id, context_id, parent_transaction_id, transaction_type, transaction_status, sequence_number, phase, ...)
VALUES ('tx-4', 'ctx-1', 'tx-3', 'DEVICE_BIND', 'PENDING', 4, 'DEVICE_BIND', ...);

-- STEP 5: POST /device/bind (ACCEPTED)
UPDATE auth_transactions
SET transaction_status = 'CONSUMED', consumed_at = NOW(), device_bind_decision = 'ACCEPTED'
WHERE transaction_id = 'tx-4';

UPDATE auth_contexts
SET auth_outcome = 'SUCCESS', completed_at = NOW()
WHERE context_id = 'ctx-1';

INSERT INTO sessions (session_id, context_id, cupid, ...)
VALUES ('sess-1', 'ctx-1', 'user123', ...);

INSERT INTO tokens (token_id, session_id, token_type, token_value, ...)
VALUES
  ('tok-1', 'sess-1', 'ACCESS', 'eyJ...', ...),
  ('tok-2', 'sess-1', 'REFRESH', 'eyJ...', ...),
  ('tok-3', 'sess-1', 'ID', 'eyJ...', ...);

INSERT INTO trusted_devices (device_id, cupid, device_fingerprint, ...)
VALUES ('dev-1', 'user123', 'fp-abc123', ...);
```

**Final Database State:**
- auth_contexts: 1 row (auth_outcome = 'SUCCESS')
- auth_transactions: 4 rows (all CONSUMED, sequence 1-4)
- drs_evaluations: 1 row
- sessions: 1 row
- tokens: 3 rows
- trusted_devices: 1 row
- audit_logs: 8+ entries (DRS, MFA_INITIATE, MFA_VERIFY, ESIGN, DEVICE_BIND, LOGIN_SUCCESS)

---

### Example 3: Token Refresh

**API Flow:**
```
POST /auth/token/refresh {refresh_token}
```

**Database Operations:**

```sql
-- Step 1: Validate refresh token
SELECT token_id, session_id, token_value, expires_at
FROM tokens
WHERE token_value_hash = SHA256('refresh_token')
  AND token_type = 'REFRESH'
  AND status = 'ACTIVE'
  AND expires_at > NOW();

-- Step 2: Mark old tokens as ROTATED
UPDATE tokens
SET status = 'ROTATED', revoked_at = NOW()
WHERE session_id = 'sess-1'
  AND token_type IN ('ACCESS', 'REFRESH')
  AND status = 'ACTIVE';

-- Step 3: Create new tokens (with parent_token_id linking to old refresh token)
INSERT INTO tokens (token_id, session_id, parent_token_id, token_type, token_value, ...)
VALUES
  ('tok-4', 'sess-1', NULL, 'ACCESS', 'new_access', ...),
  ('tok-5', 'sess-1', 'tok-2', 'REFRESH', 'new_refresh', ...); -- parent_token_id = old refresh token

-- Step 4: Update session activity
UPDATE sessions
SET last_activity_at = NOW()
WHERE session_id = 'sess-1';

-- Step 5: Audit log
INSERT INTO audit_logs (audit_id, event_type, session_id, event_data, ...)
VALUES ('audit-3', 'TOKEN_REFRESHED', 'sess-1', '{"token_type": "REFRESH"}', ...);
```

**Rotation Chain:**
```
tok-2 (REFRESH, ROTATED) → tok-5 (REFRESH, ACTIVE)
   ↓ parent_token_id
```

---

## Query Performance Expectations

| Query Type | Expected Time | Index Used | Notes |
|-----------|---------------|------------|-------|
| Token validation | <1ms | idx_tokens_value_hash | Most critical query |
| Active transaction lookup | <1ms | idx_auth_tx_context_pending | Single row, unique index |
| Session by CUPID | <5ms | idx_sessions_cupid | Multiple sessions possible |
| Audit log by CUPID (24h) | <10ms | idx_audit_cupid_time | Partition pruning helps |
| MFA verification | <2ms | PK + FK indexes | Simple lookups |
| DRS risk check | <3ms | idx_drs_context | JOIN with auth_contexts |
| Failed login attempts | <15ms | idx_audit_event_type | Aggregation query (v1.1 view) |

---

## Schema Refinements (v1.1)

**Date:** October 2025

### Changes from v1.0

1. **ENUM to VARCHAR Migration**
   - Replaced all 8 ENUM types with VARCHAR for API-layer flexibility
   - Added comprehensive value documentation for DBAs and engineers
   - Enables value additions without database migrations

2. **Performance Optimizations**
   - Added `idx_drs_action_token` on `drs_evaluations(action_token_hash)` for deduplication
   - FK index verification query for DBA performance audits

3. **Data Integrity Constraints**
   - Timestamp validation: `expires_at > created_at` on all time-sensitive tables
   - App version format validation: semver pattern on `auth_contexts.app_version`
   - Idempotent constraint additions (safe to re-run)

4. **Fraud Detection**
   - `v_failed_login_attempts` view for rate limiting and brute force detection
   - Aggregates failures by CUPID + IP + error_code in last hour

**Impact:** Zero breaking changes, enhanced flexibility and data quality

---

## Documented Value Sets (VARCHAR Fields)

All status/type fields use VARCHAR instead of ENUMs for flexibility. API layer handles validation.

### auth_transactions.transaction_type
- `MFA_INITIATE` - User selects MFA method
- `MFA_VERIFY` - User submits OTP code
- `MFA_PUSH_VERIFY` - User approves push notification
- `ESIGN_PRESENT` - eSign document presented
- `ESIGN_ACCEPT` - User accepts eSign document
- `DEVICE_BIND` - Device binding offered/accepted/declined

### auth_transactions.transaction_status
- `PENDING` - Awaiting user action
- `CONSUMED` - Completed, moved to next step
- `EXPIRED` - Time limit exceeded
- `REJECTED` - User declined or verification failed

### tokens.token_type
- `ACCESS` - Short-lived access token (15 min)
- `REFRESH` - Long-lived refresh token (30 days)
- `ID` - OpenID Connect ID token (15 min)

### tokens.status
- `ACTIVE` - Currently valid
- `ROTATED` - Replaced by new token
- `REVOKED` - Manually invalidated
- `EXPIRED` - Time-based expiration

### sessions.status
- `ACTIVE` - Session in use
- `EXPIRED` - Time-based expiry
- `REVOKED` - Manually revoked
- `LOGGED_OUT` - User-initiated logout

### trusted_devices.status
- `ACTIVE` - Device trusted
- `REVOKED` - Trust revoked
- `EXPIRED` - Trust expired

### drs_evaluations.recommendation
- `ALLOW` - Low risk, allow login
- `CHALLENGE` - Medium risk, require MFA
- `DENY` - High risk, block login
- `TRUST` - Known good device

### audit_logs.severity
- `INFO` - Normal operations
- `WARN` - Potential issues
- `ERROR` - Failures
- `CRITICAL` - Security events

---

**Document Version:** 1.1
**Last Updated:** October 2025
**Status:** ✅ Production-Ready
