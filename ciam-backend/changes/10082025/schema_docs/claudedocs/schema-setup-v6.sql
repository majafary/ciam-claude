-- ============================================================================
-- CIAM Database Schema Setup Script - Version 6.0 (Simplified Token Management)
-- ============================================================================
-- Database: PostgreSQL 14+
-- Purpose: Customer Identity and Access Management (CIAM) Backend
-- Version: 6.0 - v3.0 Architecture with Eliminated tokens_inactive Table
-- Date: October 2025
--
-- IMPORTANT: This script is idempotent - safe to run multiple times
--
-- NEW IN V6 (Simplified Token Management):
--   - All PKs use date-prefixed format (YYYY-MM-DD_uuid) for optimal purges
--   - Automatic partition pruning via ID extraction (no cache needed)
--   - Merged audit_logs + drs_evaluations into single context_events table
--   - **ELIMINATED tokens_inactive table entirely**
--   - Expired tokens retained in tokens_active for 1-hour (better error messages)
--   - Token rotation deletes immediately (no retention for rotated tokens)
--   - Events stored as JSONB array (97% row reduction vs v4.0)
--   - 85% storage reduction (1.23TB vs 8.1TB)
--   - 56% fewer operations (107.3M vs 242.6M ops/day)
--   - Instant partition drops (vs 30+ min DELETE)
--   - 166x faster partition-pruned queries
--
-- DESIGN PHILOSOPHY:
--   - Temporal Locality: IDs embed creation time for fast queries + easy purges
--   - Event Aggregation: Related events stored together in JSONB arrays
--   - Simplified Token Management: Single tokens_active table with expired buffer
--   - Partition-Native: Tables designed for partitioned storage from ground up
--   - Greenfield: No migration complexity, optimal from day one
--   - Capacity: 2.4M daily logins, 5.3x headroom to 12.7M
-- ============================================================================

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

-- UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Query performance monitoring
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Cron job scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================================
-- UTILITY TABLES
-- ============================================================================

-- Purge metrics for monitoring
CREATE TABLE IF NOT EXISTS purge_metrics (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    rows_deleted BIGINT NOT NULL,
    duration_ms INT NOT NULL,
    run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purge_metrics_run_at ON purge_metrics(run_at DESC);
CREATE INDEX IF NOT EXISTS idx_purge_metrics_table ON purge_metrics(table_name, run_at DESC);

COMMENT ON TABLE purge_metrics IS 'Tracks purge job performance for monitoring and alerting';

-- ============================================================================
-- DOCUMENTED VALUE CONSTANTS
-- ============================================================================
-- These are NOT database constraints - validation happens at API layer.
-- ============================================================================

-- ID FORMAT: Date-prefixed for automatic partition pruning
--   Format: [prefix_]YYYY-MM-DD_uuid
--   Example: ctx_2024-01-15_550e8400-e29b-41d4-a716-446655440000
--   Benefit: Extract date from ID for partition pruning (no cache needed)

-- AUTH_TYPE: 'INITIAL' | 'STEP_UP'
-- TRANSACTION_TYPE: 'MFA_INITIATE' | 'MFA_VERIFY' | 'MFA_PUSH_VERIFY' | 'ESIGN_PRESENT' | 'ESIGN_ACCEPT' | 'DEVICE_BIND'
-- TRANSACTION_STATUS: 'PENDING' | 'CONSUMED' | 'EXPIRED' | 'REJECTED'
-- TOKEN_TYPE: 'ACCESS' | 'REFRESH' | 'ID'
-- TOKEN_STATUS: 'ACTIVE' | 'EXPIRED' (v6: rotated tokens deleted immediately, no ROTATED status in table)
-- SESSION_STATUS: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'LOGGED_OUT'
-- DEVICE_STATUS: 'ACTIVE' | 'REVOKED'
-- DRS_RECOMMENDATION: 'ALLOW' | 'CHALLENGE' | 'DENY' | 'TRUST'
-- EVENT_SEVERITY: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL'

-- ============================================================================
-- HYBRID TABLES (Partitioned with High Transactional Volume)
-- ============================================================================

-- ============================================================================
-- TABLE 1: auth_contexts (Partitioned)
-- ============================================================================
-- Purpose: Immutable container for authentication journey
-- Lifecycle: INSERT once → UPDATE once (final outcome)
-- Retention: 25 hours (purged via partition DROP every hour)
-- Volume: ~2.5M records at steady state
-- ID Format: ctx_YYYY-MM-DD_uuid (date-prefixed)
-- Partitioning: Hourly partitions by created_at
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_contexts (
    -- Primary Key (date-prefixed)
    context_id VARCHAR(60) NOT NULL,

    -- Customer & User Identity
    guid VARCHAR(50) NOT NULL,
    cupid VARCHAR(50) NOT NULL,
    username VARCHAR(100) NOT NULL,

    -- Application Context
    app_id VARCHAR(50) NOT NULL,
    app_version VARCHAR(20) NOT NULL,

    -- Device & Network
    device_fingerprint TEXT,
    ip_address INET NOT NULL,

    -- Tracing
    correlation_id UUID,

    -- Multi-Context Session Support (set post-auth)
    session_id VARCHAR(60),  -- FK to sessions (date-prefixed)
    auth_type VARCHAR(20) NOT NULL DEFAULT 'INITIAL' CHECK (auth_type IN ('INITIAL', 'STEP_UP')),

    -- Journey Metadata
    requires_additional_steps BOOLEAN DEFAULT FALSE,

    -- Final Outcome (updated once at completion)
    auth_outcome VARCHAR(50),
    completed_at TIMESTAMPTZ,

    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '21 minutes'),

    -- Composite Primary Key (required for partitioning)
    PRIMARY KEY (context_id, created_at),

    -- Constraints
    CONSTRAINT check_outcome_completed CHECK (
        (auth_outcome IS NULL AND completed_at IS NULL) OR
        (auth_outcome IS NOT NULL AND completed_at IS NOT NULL)
    ),
    CONSTRAINT check_context_expiry_future CHECK (expires_at > created_at)
) PARTITION BY RANGE (created_at);

-- Create initial hourly partitions (25 hours worth)
DO $$
DECLARE
    start_time TIMESTAMPTZ := DATE_TRUNC('hour', NOW());
    partition_time TIMESTAMPTZ;
    partition_name TEXT;
BEGIN
    FOR i IN 0..24 LOOP
        partition_time := start_time + (i || ' hours')::INTERVAL;
        partition_name := 'auth_contexts_' || TO_CHAR(partition_time, 'YYYY_MM_DD_HH24');

        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF auth_contexts
             FOR VALUES FROM (%L) TO (%L)',
            partition_name,
            partition_time,
            partition_time + INTERVAL '1 hour'
        );
    END LOOP;
END $$;

-- Indexes (applied to each partition)
CREATE INDEX IF NOT EXISTS idx_auth_ctx_guid ON auth_contexts(guid);
CREATE INDEX IF NOT EXISTS idx_auth_ctx_cupid ON auth_contexts(cupid);
CREATE INDEX IF NOT EXISTS idx_auth_ctx_correlation ON auth_contexts(correlation_id);
CREATE INDEX IF NOT EXISTS idx_auth_ctx_expires ON auth_contexts(expires_at)
    WHERE auth_outcome IS NULL;
CREATE INDEX IF NOT EXISTS idx_auth_ctx_created ON auth_contexts(created_at DESC);

-- Session Support Indexes
CREATE INDEX IF NOT EXISTS idx_auth_ctx_session_time ON auth_contexts(session_id, created_at DESC)
    WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auth_ctx_type ON auth_contexts(auth_type);

-- Comments
COMMENT ON TABLE auth_contexts IS 'V6: Authentication journey container with date-prefixed context_id, partitioned hourly. Purged after 25 hours via partition DROP.';
COMMENT ON COLUMN auth_contexts.context_id IS 'V6: Date-prefixed format (ctx_YYYY-MM-DD_uuid) for partition pruning';
COMMENT ON COLUMN auth_contexts.expires_at IS 'Authentication context expires after 21 minutes';

-- ============================================================================
-- TRANSACTIONAL TABLES (Non-Partitioned)
-- ============================================================================

-- ============================================================================
-- TABLE 2: auth_transactions
-- ============================================================================
-- Purpose: Step-by-step event log with single-use transaction tokens
-- Lifecycle: INSERT → status=PENDING → UPDATE to CONSUMED
-- Retention: 25 minutes (purged via batch DELETE every 10 min)
-- Volume: ~140K records at steady state
-- ID Format: txn_YYYY-MM-DD_uuid (date-prefixed)
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_transactions (
    -- Primary Key (date-prefixed)
    transaction_id VARCHAR(60) PRIMARY KEY,

    -- Foreign Keys (date-prefixed)
    context_id VARCHAR(60) NOT NULL REFERENCES auth_contexts(context_id) ON DELETE CASCADE,
    parent_transaction_id VARCHAR(60) REFERENCES auth_transactions(transaction_id),

    -- Transaction Identity
    transaction_type VARCHAR(50) NOT NULL,
    transaction_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    sequence_number INT NOT NULL,
    phase VARCHAR(50) NOT NULL,

    -- ==================== MFA PHASE ====================
    mfa_method VARCHAR(10),
    mfa_option_id SMALLINT CHECK (mfa_option_id BETWEEN 1 AND 6),
    mfa_options JSONB,
    mobile_approve_status VARCHAR(20),
    display_number INT,
    selected_number INT,
    verification_result VARCHAR(20),
    attempt_number INT,

    -- ==================== ESIGN PHASE ====================
    esign_document_id VARCHAR(100),
    esign_action VARCHAR(20),

    -- ==================== DEVICE BIND PHASE ====================
    device_bind_decision VARCHAR(20),

    -- Lifecycle
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),

    -- Constraints
    CONSTRAINT check_consumed CHECK (
        (transaction_status = 'PENDING' AND consumed_at IS NULL) OR
        (transaction_status != 'PENDING' AND consumed_at IS NOT NULL)
    ),
    CONSTRAINT check_sequence_positive CHECK (sequence_number > 0),
    CONSTRAINT check_transaction_expiry_future CHECK (expires_at > created_at)
);

-- Query Indexes (CRITICAL for performance)
CREATE INDEX IF NOT EXISTS idx_auth_tx_context ON auth_transactions(context_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_auth_tx_parent ON auth_transactions(parent_transaction_id);
CREATE INDEX IF NOT EXISTS idx_auth_tx_status ON auth_transactions(transaction_status, expires_at);

-- Unique constraint: Only one PENDING transaction per context
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_tx_context_pending
    ON auth_transactions(context_id)
    WHERE transaction_status = 'PENDING';

-- Purge Optimization Index
CREATE INDEX IF NOT EXISTS idx_auth_tx_purge ON auth_transactions(created_at, transaction_status)
    WHERE transaction_status IN ('CONSUMED', 'EXPIRED', 'REJECTED');

-- Comments
COMMENT ON TABLE auth_transactions IS 'V6: Step-by-step event log with date-prefixed transaction_id. Purged after 25 minutes via batch DELETE.';
COMMENT ON COLUMN auth_transactions.transaction_id IS 'V6: Date-prefixed format (txn_YYYY-MM-DD_uuid), single-use token consumed after one use';

-- ============================================================================
-- TABLE 3: sessions
-- ============================================================================
-- Purpose: Active user sessions (supports multi-device)
-- Lifecycle: Created after successful auth, expires or gets revoked
-- Retention: 25 hours (purged via batch DELETE every hour)
-- Volume: ~2.5M records at steady state
-- Token Lifecycle: ACCESS=5min, REFRESH=1hr (sliding), SESSION=21hr (absolute)
-- ID Format: sess_YYYY-MM-DD_uuid (date-prefixed)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sessions (
    -- Primary Key (date-prefixed)
    session_id VARCHAR(60) PRIMARY KEY,

    -- Foreign Keys (date-prefixed)
    context_id VARCHAR(60) NOT NULL REFERENCES auth_contexts(context_id),

    -- User Identity
    cupid VARCHAR(50) NOT NULL,

    -- Device & Network
    device_fingerprint TEXT,
    ip_address INET NOT NULL,
    user_agent TEXT,

    -- Session State
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',

    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '21 hours'),

    -- Revocation (manual termination)
    revoked_at TIMESTAMPTZ,
    revoked_by VARCHAR(100),
    revocation_reason TEXT,

    -- Constraints
    CONSTRAINT check_revoked CHECK (
        (status != 'REVOKED' AND revoked_at IS NULL) OR
        (status = 'REVOKED' AND revoked_at IS NOT NULL)
    ),
    CONSTRAINT check_session_expiry_future CHECK (expires_at > created_at)
);

-- Query Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_cupid ON sessions(cupid)
    WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_sessions_context ON sessions(context_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status_expires ON sessions(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at DESC);

-- Purge Optimization Index
CREATE INDEX IF NOT EXISTS idx_sessions_purge ON sessions(created_at, status)
    WHERE status IN ('EXPIRED', 'LOGGED_OUT', 'REVOKED');

-- Comments
COMMENT ON TABLE sessions IS 'V6: Active user sessions with date-prefixed session_id, 21-hour absolute limit. Purged after 25 hours via batch DELETE.';
COMMENT ON COLUMN sessions.session_id IS 'V6: Date-prefixed format (sess_YYYY-MM-DD_uuid)';
COMMENT ON COLUMN sessions.expires_at IS 'IMMUTABLE: Set once at creation to NOW() + 21 hours, never updated (absolute cap)';
COMMENT ON COLUMN sessions.last_activity_at IS 'NOTE: Not updated on token refresh to reduce write load. Token expires_at handles inactivity.';

-- Add FK from auth_contexts to sessions (now that sessions exists)
ALTER TABLE auth_contexts
    DROP CONSTRAINT IF EXISTS auth_contexts_session_id_fkey;
ALTER TABLE auth_contexts
    ADD CONSTRAINT auth_contexts_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES sessions(session_id);

-- ============================================================================
-- TABLE 4: tokens_active (v6 with status and expired_at columns)
-- ============================================================================
-- Purpose: Active AND recently expired tokens (1-hour buffer)
-- Lifecycle:
--   - Created on login/refresh
--   - ROTATED tokens: Deleted immediately (no retention)
--   - EXPIRED tokens: Status updated to EXPIRED, retained for 1 hour, then deleted
-- Retention: Active + 1-hour expired buffer for better error messages
-- Volume: ~6.15M records at steady state (6M active + 150K expired buffer)
-- ID Format: tok_YYYY-MM-DD_uuid (date-prefixed)
-- Optimization: session_expires_at denormalized for single-query validation
-- v3.0 CHANGE: tokens_inactive table eliminated entirely
-- ============================================================================

CREATE TABLE IF NOT EXISTS tokens_active (
    -- Primary Key (date-prefixed)
    token_id VARCHAR(60) PRIMARY KEY,

    -- Foreign Keys (date-prefixed)
    session_id VARCHAR(60) NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    parent_token_id VARCHAR(60),  -- Reference to previous token in rotation chain

    -- Token Identity
    token_type VARCHAR(20) NOT NULL CHECK (token_type IN ('ACCESS', 'REFRESH', 'ID')),
    token_value TEXT NOT NULL,
    token_value_hash VARCHAR(64) NOT NULL,

    -- V6: Status tracking for expired tokens
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED')),

    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,

    -- V6: Track when token was marked expired (for 1-hour purge window)
    expired_at TIMESTAMPTZ,

    -- V4 OPTIMIZATION: Denormalized for single-query validation
    session_expires_at TIMESTAMPTZ NOT NULL,

    -- Constraints
    CONSTRAINT check_token_expiry CHECK (expires_at > created_at),
    CONSTRAINT check_session_expiry CHECK (session_expires_at > created_at),
    CONSTRAINT check_expired_status CHECK (
        (status = 'ACTIVE' AND expired_at IS NULL) OR
        (status = 'EXPIRED' AND expired_at IS NOT NULL)
    )
);

-- CRITICAL Indexes for token validation (performance-critical path)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_active_hash
    ON tokens_active(token_value_hash);

CREATE INDEX IF NOT EXISTS idx_tokens_active_session ON tokens_active(session_id, token_type);

-- Unique constraint: Only one ACTIVE token per type per session
CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_active_session_type
    ON tokens_active(session_id, token_type)
    WHERE status = 'ACTIVE';

-- Purge expired tokens (partial index for efficiency)
CREATE INDEX IF NOT EXISTS idx_tokens_active_expired ON tokens_active(expired_at)
    WHERE status = 'EXPIRED';

-- V4 OPTIMIZATION: Partial index for validation queries (WHERE both conditions)
CREATE INDEX IF NOT EXISTS idx_tokens_active_hash_valid
    ON tokens_active(token_value_hash)
    WHERE status = 'ACTIVE' AND expires_at > NOW() AND session_expires_at > NOW();

-- Comments
COMMENT ON TABLE tokens_active IS 'V6: Active tokens + 1hr expired buffer. Rotated tokens deleted immediately. ~6.15M records at steady state (6M active + 150K expired).';
COMMENT ON COLUMN tokens_active.token_id IS 'V6: Date-prefixed format (tok_YYYY-MM-DD_uuid)';
COMMENT ON COLUMN tokens_active.status IS 'V6: ACTIVE or EXPIRED. Rotated tokens are deleted, not marked with status.';
COMMENT ON COLUMN tokens_active.expired_at IS 'V6: Timestamp when token was marked EXPIRED. Used for 1-hour purge window.';
COMMENT ON COLUMN tokens_active.token_value_hash IS 'SHA256 hash for fast lookup without exposing token value';
COMMENT ON COLUMN tokens_active.expires_at IS 'SLIDING WINDOW: Reset on each rotation (5min for ACCESS/ID, 1hr for REFRESH)';
COMMENT ON COLUMN tokens_active.session_expires_at IS 'V4 OPTIMIZATION: Denormalized from sessions.expires_at for single-query validation. IMMUTABLE (copy from session).';
COMMENT ON INDEX idx_tokens_active_hash IS 'CRITICAL: Unique index for sub-millisecond token lookup';
COMMENT ON INDEX idx_tokens_active_hash_valid IS 'V4 OPTIMIZATION: Partial index for validation queries with both conditions';
COMMENT ON INDEX idx_tokens_active_expired IS 'V6: Partial index for efficient purging of expired tokens after 1-hour buffer';

-- ============================================================================
-- TABLE 5: trusted_devices
-- ============================================================================
-- Purpose: Device binding for MFA skip on trusted devices
-- Lifecycle: Created on device bind acceptance, revoked manually or expires
-- Retention: Indefinite (manual revocation only)
-- Volume: ~8.6M records (cumulative)
-- ID Format: Standard UUID (NO date prefix - indefinite retention)
-- ============================================================================

-- ============================================================================
-- TABLE 5: trusted_devices (HASH PARTITIONED)
-- ============================================================================
-- Purpose: Trusted device records for MFA skip (10-device limit per user)
-- Partitioning: HASH by cupid (16 partitions for even distribution)
-- Lifecycle: INSERT → UPDATEs (last_used_at) → DELETE (round-robin by application)
-- Retention: Application-enforced 10-device limit per user (oldest deleted)
-- Growth: Capped at 24M devices (2.4M users × 10 devices/user)
-- Partition size: ~1.5M devices/partition (~600 MB each)
-- ============================================================================

CREATE TABLE IF NOT EXISTS trusted_devices (
    -- Primary Key (standard UUID - no date prefix, application-managed lifecycle)
    device_id UUID DEFAULT gen_random_uuid(),

    -- Customer & User Identity
    guid VARCHAR(50) NOT NULL,
    cupid VARCHAR(50) NOT NULL,  -- PARTITION KEY (must be in all queries)

    -- Application Context
    app_id VARCHAR(50) NOT NULL,

    -- Device Identity
    device_fingerprint TEXT NOT NULL,
    device_fingerprint_hash VARCHAR(64) NOT NULL,

    -- Device Metadata
    device_name VARCHAR(200),
    device_type VARCHAR(50),

    -- Trust State
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',

    -- Lifecycle
    trusted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,

    -- Constraints
    PRIMARY KEY (device_id, cupid),  -- Composite PK including partition key
    CONSTRAINT check_device_revoked CHECK (
        (status != 'REVOKED' AND revoked_at IS NULL) OR
        (status = 'REVOKED' AND revoked_at IS NOT NULL)
    )
) PARTITION BY HASH (cupid);

-- Create 16 hash partitions (distributes users evenly)
CREATE TABLE trusted_devices_p0 PARTITION OF trusted_devices
    FOR VALUES WITH (MODULUS 16, REMAINDER 0);
CREATE TABLE trusted_devices_p1 PARTITION OF trusted_devices
    FOR VALUES WITH (MODULUS 16, REMAINDER 1);
CREATE TABLE trusted_devices_p2 PARTITION OF trusted_devices
    FOR VALUES WITH (MODULUS 16, REMAINDER 2);
CREATE TABLE trusted_devices_p3 PARTITION OF trusted_devices
    FOR VALUES WITH (MODULUS 16, REMAINDER 3);
CREATE TABLE trusted_devices_p4 PARTITION OF trusted_devices
    FOR VALUES WITH (MODULUS 16, REMAINDER 4);
CREATE TABLE trusted_devices_p5 PARTITION OF trusted_devices
    FOR VALUES WITH (MODULUS 16, REMAINDER 5);
CREATE TABLE trusted_devices_p6 PARTITION OF trusted_devices
    FOR VALUES WITH (MODULUS 16, REMAINDER 6);
CREATE TABLE trusted_devices_p7 PARTITION OF trusted_devices
    FOR VALUES WITH (MODULUS 16, REMAINDER 7);
CREATE TABLE trusted_devices_p8 PARTITION OF trusted_devices
    FOR VALUES WITH (MODULUS 16, REMAINDER 8);
CREATE TABLE trusted_devices_p9 PARTITION OF trusted_devices
    FOR VALUES WITH (MODULUS 16, REMAINDER 9);
CREATE TABLE trusted_devices_p10 PARTITION OF trusted_devices
    FOR VALUES WITH (MODULUS 16, REMAINDER 10);
CREATE TABLE trusted_devices_p11 PARTITION OF trusted_devices
    FOR VALUES WITH (MODULUS 16, REMAINDER 11);
CREATE TABLE trusted_devices_p12 PARTITION OF trusted_devices
    FOR VALUES WITH (MODULUS 16, REMAINDER 12);
CREATE TABLE trusted_devices_p13 PARTITION OF trusted_devices
    FOR VALUES WITH (MODULUS 16, REMAINDER 13);
CREATE TABLE trusted_devices_p14 PARTITION OF trusted_devices
    FOR VALUES WITH (MODULUS 16, REMAINDER 14);
CREATE TABLE trusted_devices_p15 PARTITION OF trusted_devices
    FOR VALUES WITH (MODULUS 16, REMAINDER 15);

-- Indexes (automatically created on all partitions)
CREATE INDEX IF NOT EXISTS idx_devices_guid ON trusted_devices(guid);
CREATE INDEX IF NOT EXISTS idx_devices_cupid_app ON trusted_devices(cupid, app_id)
    WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_devices_fingerprint_hash ON trusted_devices(device_fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_devices_trusted ON trusted_devices(trusted_at DESC);

-- Unique constraint: one device can only be trusted once per user per app
-- Must include partition key (cupid) for partitioned tables
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_unique_per_user_app
    ON trusted_devices(cupid, app_id, device_fingerprint_hash)
    WHERE status = 'ACTIVE';

-- Comments
COMMENT ON TABLE trusted_devices IS 'V6: Hash partitioned trusted device records (16 partitions by cupid). Application enforces 10-device limit per user via round-robin deletion. Capped at 24M devices total (1.5M/partition).';
COMMENT ON COLUMN trusted_devices.device_id IS 'V6: Standard UUID (not date-prefixed) - application-managed lifecycle';
COMMENT ON COLUMN trusted_devices.cupid IS 'V6: PARTITION KEY - must be included in all WHERE clauses for single-partition queries';

-- ============================================================================
-- ANALYTICAL TABLES (Partitioned)
-- ============================================================================

-- ============================================================================
-- TABLE 6: context_events (NEW V5 - Replaces audit_logs + drs_evaluations)
-- ============================================================================
-- Purpose: Unified event timeline and DRS evaluation per authentication context
-- Lifecycle: INSERT → UPDATEs (append events) → PURGE via partition DROP after 90 days
-- Retention: 90 days (purged via partition DROP daily)
-- Volume: ~216M records at steady state (vs 8.1B rows in v4.0)
-- ID Format: ctx_YYYY-MM-DD_uuid (date-prefixed, matches auth_contexts)
-- Partitioning: Daily partitions by created_at
-- Storage: ~1.2TB (vs 8.1TB in v4.0 - 85% reduction)
-- Events: JSONB array (avg 15 events per context as array elements, not rows)
-- v3.0 NOTE: Includes TOKEN_ROTATED and TOKEN_EXPIRED events for forensics
-- ============================================================================

CREATE TABLE IF NOT EXISTS context_events (
    -- Primary Key (date-prefixed, same as auth_contexts)
    context_id VARCHAR(60) NOT NULL,

    -- User Identity
    cupid VARCHAR(50) NOT NULL,
    guid VARCHAR(50) NOT NULL,
    session_id VARCHAR(60),  -- FK to sessions (date-prefixed)

    -- All audit events as JSONB array (ordered by timestamp)
    -- Average 15 events per context stored as array elements
    -- Example: [
    --   {"type": "LOGIN_INITIATED", "timestamp": "...", "ip_address": "..."},
    --   {"type": "DRS_EVALUATED", "timestamp": "...", "evaluation_id": "..."},
    --   {"type": "MFA_REQUIRED", "timestamp": "...", "method": "sms"},
    --   {"type": "MFA_VERIFIED", "timestamp": "...", "attempt": 1},
    --   {"type": "SESSION_CREATED", "timestamp": "...", "session_id": "..."},
    --   {"type": "TOKEN_ROTATED", "timestamp": "...", "old_token_id": "...", "new_token_id": "..."},
    --   {"type": "TOKEN_EXPIRED", "timestamp": "...", "token_id": "...", "token_type": "..."}
    -- ]
    events JSONB[] DEFAULT ARRAY[]::JSONB[],

    -- Single DRS evaluation (one per context)
    -- Example: {
    --   "evaluation_id": "eval_123",
    --   "risk_score": 15,
    --   "recommendation": "ALLOW",
    --   "device_id": "device_abc",
    --   "signals": ["new_device"],
    --   "raw_response": {...}
    -- }
    drs_evaluation JSONB,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_count INT DEFAULT 0,

    -- Composite Primary Key (required for partitioning)
    PRIMARY KEY (context_id, created_at)
) PARTITION BY RANGE (created_at);

-- Create initial daily partitions (7 days)
DO $$
DECLARE
    start_date DATE := CURRENT_DATE;
    partition_date DATE;
    partition_name TEXT;
BEGIN
    FOR i IN 0..6 LOOP
        partition_date := start_date + i;
        partition_name := 'context_events_' || TO_CHAR(partition_date, 'YYYY_MM_DD');

        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF context_events
             FOR VALUES FROM (%L) TO (%L)',
            partition_name,
            partition_date,
            partition_date + INTERVAL '1 day'
        );
    END LOOP;
END $$;

-- Indexes (applied to each partition)
CREATE INDEX IF NOT EXISTS idx_context_events_cupid ON context_events(cupid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_context_events_guid ON context_events(guid);
CREATE INDEX IF NOT EXISTS idx_context_events_session ON context_events(session_id)
    WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_context_events_updated ON context_events(updated_at);

-- GIN index for event array searches
CREATE INDEX IF NOT EXISTS idx_context_events_events_gin
    ON context_events USING GIN(events jsonb_path_ops);

-- Comments
COMMENT ON TABLE context_events IS 'V6: Unified event storage replacing audit_logs + drs_evaluations. 216M contexts vs 8.1B rows (97% reduction). Partitioned daily, purged via partition DROP after 90 days. v3.0: Primary token forensics source (replaces tokens_inactive).';
COMMENT ON COLUMN context_events.context_id IS 'V6: Date-prefixed format (ctx_YYYY-MM-DD_uuid) matching auth_contexts for partition pruning';
COMMENT ON COLUMN context_events.events IS 'V6: JSONB array storing all audit events chronologically. Average 15 events per context. Use array_append() for updates. Includes TOKEN_ROTATED and TOKEN_EXPIRED events for forensics.';
COMMENT ON COLUMN context_events.drs_evaluation IS 'V6: Single DRS risk assessment per context. Replaces separate drs_evaluations table.';
COMMENT ON COLUMN context_events.event_count IS 'Cached count for performance. Equals array_length(events, 1).';

-- ============================================================================
-- MONITORING VIEWS
-- ============================================================================

-- ============================================================================
-- VIEW 1: v_active_sessions
-- ============================================================================
CREATE OR REPLACE VIEW v_active_sessions AS
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
    COUNT(t.token_id) FILTER (WHERE t.token_type = 'REFRESH' AND t.status = 'ACTIVE') as has_refresh_token,
    COUNT(t.token_id) FILTER (WHERE t.status = 'EXPIRED') as expired_token_count
FROM sessions s
LEFT JOIN tokens_active t ON t.session_id = s.session_id
WHERE s.status = 'ACTIVE'
GROUP BY s.session_id;

COMMENT ON VIEW v_active_sessions IS 'V6: Active sessions with active and expired token counts for monitoring';

-- ============================================================================
-- VIEW 2: v_pending_transactions
-- ============================================================================
CREATE OR REPLACE VIEW v_pending_transactions AS
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

COMMENT ON VIEW v_pending_transactions IS 'V6: Currently active transactions awaiting user action';

-- ============================================================================
-- VIEW 3: v_table_health
-- ============================================================================
CREATE OR REPLACE VIEW v_table_health AS
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) -
                   pg_relation_size(schemaname||'.'||tablename)) AS index_size,
    n_live_tup AS live_rows,
    n_dead_tup AS dead_rows,
    ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup, 0), 2) AS dead_pct,
    last_vacuum,
    last_autovacuum,
    CASE
        WHEN n_dead_tup > 100000 THEN '🚨 CRITICAL'
        WHEN n_dead_tup > 50000 THEN '⚠️ WARNING'
        ELSE '✅ HEALTHY'
    END AS health_status
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_dead_tup DESC;

COMMENT ON VIEW v_table_health IS 'V6: Table size and bloat monitoring for all tables';

-- ============================================================================
-- VIEW 4: v_partition_status
-- ============================================================================
CREATE OR REPLACE VIEW v_partition_status AS
SELECT
    parent.relname AS parent_table,
    COUNT(*) AS partition_count,
    pg_size_pretty(SUM(pg_relation_size(child.oid))) AS total_size,
    MIN(child.relname) AS oldest_partition,
    MAX(child.relname) AS newest_partition
FROM pg_inherits
JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
JOIN pg_class child ON pg_inherits.inhrelid = child.oid
WHERE parent.relnamespace = 'public'::regnamespace
GROUP BY parent.relname
ORDER BY parent.relname;

COMMENT ON VIEW v_partition_status IS 'V6: Partition count and size monitoring';

-- ============================================================================
-- VIEW 5: v_purge_performance
-- ============================================================================
CREATE OR REPLACE VIEW v_purge_performance AS
SELECT
    table_name,
    COUNT(*) AS runs_last_24h,
    SUM(rows_deleted) AS total_deleted_24h,
    ROUND(AVG(rows_deleted)) AS avg_rows_per_run,
    ROUND(AVG(duration_ms)) AS avg_duration_ms,
    MAX(duration_ms) AS max_duration_ms,
    MIN(run_at) AS oldest_run,
    MAX(run_at) AS latest_run
FROM purge_metrics
WHERE run_at > NOW() - INTERVAL '24 hours'
GROUP BY table_name
ORDER BY table_name;

COMMENT ON VIEW v_purge_performance IS 'V6: Purge job performance over last 24 hours';

-- ============================================================================
-- VIEW 6: v_replication_status
-- ============================================================================
CREATE OR REPLACE VIEW v_replication_status AS
SELECT
    client_addr,
    state,
    sync_state,
    CASE
        WHEN pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn() THEN 0
        ELSE EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp()))
    END AS lag_seconds,
    pg_size_pretty(pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn())) AS lag_bytes
FROM pg_stat_replication;

COMMENT ON VIEW v_replication_status IS 'V6: Replication lag monitoring';

-- ============================================================================
-- VIEW 7: v_context_events_stats (NEW V5)
-- ============================================================================
CREATE OR REPLACE VIEW v_context_events_stats AS
SELECT
    COUNT(*) AS total_contexts,
    AVG(event_count) AS avg_events_per_context,
    MAX(event_count) AS max_events_per_context,
    AVG(array_length(events, 1)) AS avg_array_length,
    COUNT(*) FILTER (WHERE drs_evaluation IS NOT NULL) AS contexts_with_drs,
    COUNT(*) FILTER (WHERE array_length(events, 1) > 20) AS contexts_with_many_events,
    pg_size_pretty(pg_total_relation_size('context_events')) AS total_size,
    pg_size_pretty(AVG(pg_column_size(events))) AS avg_events_size,
    pg_size_pretty(AVG(pg_column_size(drs_evaluation))) AS avg_drs_size
FROM context_events
WHERE created_at > NOW() - INTERVAL '24 hours';

COMMENT ON VIEW v_context_events_stats IS 'V6: Statistics for unified context_events table over last 24 hours';

-- ============================================================================
-- VIEW 8: v_token_status (NEW V6)
-- ============================================================================
CREATE OR REPLACE VIEW v_token_status AS
SELECT
    COUNT(*) FILTER (WHERE status = 'ACTIVE') as active_tokens,
    COUNT(*) FILTER (WHERE status = 'EXPIRED') as expired_tokens,
    COUNT(*) as total_tokens,
    ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'EXPIRED') / NULLIF(COUNT(*), 0), 2) as expired_pct,
    COUNT(*) FILTER (WHERE status = 'EXPIRED' AND expired_at < NOW() - INTERVAL '1 hour') as overdue_purge,
    MIN(expired_at) FILTER (WHERE status = 'EXPIRED') as oldest_expired,
    MAX(expired_at) FILTER (WHERE status = 'EXPIRED') as newest_expired
FROM tokens_active;

COMMENT ON VIEW v_token_status IS 'V6: Token status monitoring including expired buffer tracking';

-- ============================================================================
-- VIEW 9: v_trusted_devices_partition_health (NEW V6)
-- ============================================================================
CREATE OR REPLACE VIEW v_trusted_devices_partition_health AS
WITH partition_stats AS (
    SELECT
        child.relname AS partition_name,
        SUBSTRING(child.relname FROM 'p(\d+)$')::INTEGER AS partition_number,
        pg_relation_size(child.oid) AS partition_size_bytes,
        pg_size_pretty(pg_relation_size(child.oid)) AS partition_size,
        (SELECT COUNT(*) FROM ONLY trusted_devices td
         WHERE tableoid = child.oid) AS device_count,
        (SELECT COUNT(*) FROM ONLY trusted_devices td
         WHERE tableoid = child.oid AND status = 'ACTIVE') AS active_device_count,
        (SELECT COUNT(*) FROM ONLY trusted_devices td
         WHERE tableoid = child.oid AND status = 'REVOKED') AS revoked_device_count
    FROM pg_inherits
    JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
    JOIN pg_class child ON pg_inherits.inhrelid = child.oid
    WHERE parent.relname = 'trusted_devices'
      AND parent.relnamespace = 'public'::regnamespace
),
summary AS (
    SELECT
        COUNT(*) AS total_partitions,
        SUM(device_count) AS total_devices,
        SUM(active_device_count) AS total_active_devices,
        ROUND(AVG(device_count)) AS avg_devices_per_partition,
        MAX(device_count) AS max_devices_in_partition,
        MIN(device_count) AS min_devices_in_partition,
        SUM(partition_size_bytes) AS total_size_bytes,
        ROUND(AVG(partition_size_bytes)) AS avg_partition_size_bytes,
        -- Calculate distribution evenness (coefficient of variation)
        CASE
            WHEN AVG(device_count) > 0 THEN
                ROUND((STDDEV(device_count) / NULLIF(AVG(device_count), 0) * 100)::NUMERIC, 2)
            ELSE 0
        END AS distribution_cv_pct
    FROM partition_stats
)
SELECT
    ps.partition_name,
    ps.partition_number,
    ps.device_count,
    ps.active_device_count,
    ps.revoked_device_count,
    ps.partition_size,
    -- Show deviation from average
    ROUND(100.0 * (ps.device_count - s.avg_devices_per_partition) / NULLIF(s.avg_devices_per_partition, 0), 1) AS deviation_from_avg_pct,
    -- Show if partition is within expected range (±20% of average)
    CASE
        WHEN ps.device_count BETWEEN s.avg_devices_per_partition * 0.8 AND s.avg_devices_per_partition * 1.2
        THEN 'OK'
        WHEN ps.device_count < s.avg_devices_per_partition * 0.8
        THEN 'UNDER'
        ELSE 'OVER'
    END AS balance_status,
    -- Summary row indicator
    FALSE AS is_summary
FROM partition_stats ps
CROSS JOIN summary s
UNION ALL
SELECT
    'TOTAL/AVG' AS partition_name,
    NULL AS partition_number,
    s.total_devices AS device_count,
    s.total_active_devices AS active_device_count,
    s.total_devices - s.total_active_devices AS revoked_device_count,
    pg_size_pretty(s.total_size_bytes) AS partition_size,
    s.distribution_cv_pct AS deviation_from_avg_pct,
    CASE
        WHEN s.distribution_cv_pct < 10 THEN 'EXCELLENT'
        WHEN s.distribution_cv_pct < 20 THEN 'GOOD'
        WHEN s.distribution_cv_pct < 30 THEN 'FAIR'
        ELSE 'UNBALANCED'
    END AS balance_status,
    TRUE AS is_summary
FROM summary s
ORDER BY is_summary, partition_number NULLS LAST;

COMMENT ON VIEW v_trusted_devices_partition_health IS 'V6: Hash partition distribution monitoring for trusted_devices. Shows device count per partition, size, and balance metrics. CV < 20% indicates good hash distribution.';

-- ============================================================================
-- VIEW 10: v_trusted_devices_user_distribution (NEW V6)
-- ============================================================================
CREATE OR REPLACE VIEW v_trusted_devices_user_distribution AS
SELECT
    COUNT(DISTINCT cupid) AS total_users_with_devices,
    COUNT(*) AS total_devices,
    ROUND(AVG(device_count), 2) AS avg_devices_per_user,
    MIN(device_count) AS min_devices_per_user,
    MAX(device_count) AS max_devices_per_user,
    COUNT(*) FILTER (WHERE device_count = 10) AS users_at_limit,
    ROUND(100.0 * COUNT(*) FILTER (WHERE device_count = 10) / NULLIF(COUNT(DISTINCT cupid), 0), 2) AS pct_users_at_limit,
    COUNT(*) FILTER (WHERE device_count > 5) AS users_with_many_devices,
    COUNT(*) FILTER (WHERE device_count = 1) AS users_with_one_device
FROM (
    SELECT cupid, COUNT(*) AS device_count
    FROM trusted_devices
    WHERE status = 'ACTIVE'
    GROUP BY cupid
) user_device_counts;

COMMENT ON VIEW v_trusted_devices_user_distribution IS 'V6: User device distribution statistics. Monitor round-robin effectiveness and users approaching 10-device limit.';

-- ============================================================================
-- VIEW 11: v_partition_pruning_verification (NEW V6)
-- ============================================================================
CREATE OR REPLACE VIEW v_partition_pruning_verification AS
WITH test_cupids AS (
    -- Sample 5 distinct cupids for testing
    SELECT DISTINCT cupid
    FROM trusted_devices
    LIMIT 5
)
SELECT
    tc.cupid,
    (SELECT COUNT(*) FROM trusted_devices td WHERE td.cupid = tc.cupid) AS devices_for_user,
    -- Show which partition this cupid maps to
    (SELECT child.relname
     FROM pg_inherits
     JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
     JOIN pg_class child ON pg_inherits.inhrelid = child.oid
     WHERE parent.relname = 'trusted_devices'
       AND EXISTS (SELECT 1 FROM ONLY trusted_devices td2
                   WHERE td2.cupid = tc.cupid
                   AND td2.tableoid = child.oid)
     LIMIT 1
    ) AS partition_name,
    -- Example query that should hit single partition
    format('EXPLAIN SELECT * FROM trusted_devices WHERE cupid = %L AND status = ''ACTIVE'';', tc.cupid) AS test_query
FROM test_cupids tc;

COMMENT ON VIEW v_partition_pruning_verification IS 'V6: Helper view to verify hash partition pruning. Shows sample cupids and their partition assignment. Use test_query with EXPLAIN to verify single-partition access.';

-- ============================================================================
-- PARTITION MANAGEMENT FUNCTIONS
-- ============================================================================

-- ============================================================================
-- FUNCTION: create_future_partitions
-- ============================================================================
CREATE OR REPLACE FUNCTION create_future_partitions()
RETURNS TEXT AS $$
DECLARE
    v_result TEXT := '';
    v_partition_name TEXT;
    v_exists BOOLEAN;
BEGIN
    -- auth_contexts: Create hourly partitions (48 hours ahead)
    FOR i IN 0..47 LOOP
        v_partition_name := 'auth_contexts_' ||
            TO_CHAR(DATE_TRUNC('hour', NOW()) + (i || ' hours')::INTERVAL, 'YYYY_MM_DD_HH24');

        SELECT EXISTS(
            SELECT 1 FROM pg_tables WHERE tablename = v_partition_name
        ) INTO v_exists;

        IF NOT v_exists THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF auth_contexts
                 FOR VALUES FROM (%L) TO (%L)',
                v_partition_name,
                DATE_TRUNC('hour', NOW()) + (i || ' hours')::INTERVAL,
                DATE_TRUNC('hour', NOW()) + ((i+1) || ' hours')::INTERVAL
            );
            v_result := v_result || 'Created ' || v_partition_name || E'\n';
        END IF;
    END LOOP;

    -- context_events: Create daily partitions (7 days ahead)
    FOR i IN 0..6 LOOP
        v_partition_name := 'context_events_' ||
            TO_CHAR(CURRENT_DATE + i, 'YYYY_MM_DD');

        SELECT EXISTS(
            SELECT 1 FROM pg_tables WHERE tablename = v_partition_name
        ) INTO v_exists;

        IF NOT v_exists THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF context_events
                 FOR VALUES FROM (%L) TO (%L)',
                v_partition_name,
                CURRENT_DATE + i,
                CURRENT_DATE + i + 1
            );
            v_result := v_result || 'Created ' || v_partition_name || E'\n';
        END IF;
    END LOOP;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_future_partitions IS
'V6: Creates future partitions: 48h for auth_contexts, 7d for context_events. tokens_inactive eliminated. Run hourly.';

-- ============================================================================
-- FUNCTION: drop_old_partitions
-- ============================================================================
CREATE OR REPLACE FUNCTION drop_old_partitions()
RETURNS TEXT AS $$
DECLARE
    v_result TEXT := '';
    v_partition_name TEXT;
BEGIN
    -- auth_contexts: Drop partitions older than 25 hours
    FOR v_partition_name IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename LIKE 'auth_contexts_%'
        AND tablename < 'auth_contexts_' ||
            TO_CHAR(NOW() - INTERVAL '25 hours', 'YYYY_MM_DD_HH24')
    LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || v_partition_name;
        v_result := v_result || 'Dropped ' || v_partition_name || E'\n';
    END LOOP;

    -- context_events: Drop partitions older than 90 days
    FOR v_partition_name IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename LIKE 'context_events_%'
        AND tablename < 'context_events_' ||
            TO_CHAR(CURRENT_DATE - INTERVAL '90 days', 'YYYY_MM_DD')
    LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || v_partition_name;
        v_result := v_result || 'Dropped ' || v_partition_name || E'\n';
    END LOOP;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION drop_old_partitions IS
'V6: Drops old partitions based on retention: 25h for auth_contexts, 90d for context_events. tokens_inactive eliminated. Run hourly.';

-- ============================================================================
-- PURGE FUNCTIONS (Batch DELETE)
-- ============================================================================

-- ============================================================================
-- FUNCTION: batch_purge_table (Generic)
-- ============================================================================
CREATE OR REPLACE FUNCTION batch_purge_table(
    p_table_name TEXT,
    p_where_clause TEXT,
    p_batch_size INT DEFAULT 10000,
    p_sleep_seconds NUMERIC DEFAULT 0.1
)
RETURNS TABLE(total_deleted BIGINT, duration_seconds NUMERIC) AS $$
DECLARE
    v_deleted_count BIGINT := 0;
    v_rows_affected INT;
    v_start_time TIMESTAMPTZ := CLOCK_TIMESTAMP();
    v_sql TEXT;
BEGIN
    v_sql := format(
        'DELETE FROM %I WHERE ctid IN (
            SELECT ctid FROM %I WHERE %s LIMIT %L
        )',
        p_table_name, p_table_name, p_where_clause, p_batch_size
    );

    LOOP
        EXECUTE v_sql;
        GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
        v_deleted_count := v_deleted_count + v_rows_affected;

        EXIT WHEN v_rows_affected < p_batch_size;

        -- Small sleep to release locks
        PERFORM pg_sleep(p_sleep_seconds);
    END LOOP;

    total_deleted := v_deleted_count;
    duration_seconds := EXTRACT(EPOCH FROM (CLOCK_TIMESTAMP() - v_start_time));

    -- Log metrics
    INSERT INTO purge_metrics (table_name, rows_deleted, duration_ms)
    VALUES (p_table_name, v_deleted_count, (duration_seconds * 1000)::INT);

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION batch_purge_table IS
'V6: Generic batch purge function with metrics logging. Deletes in batches with configurable sleep.';

-- ============================================================================
-- FUNCTION: purge_auth_transactions
-- ============================================================================
CREATE OR REPLACE FUNCTION purge_auth_transactions()
RETURNS TABLE(deleted BIGINT, duration NUMERIC) AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM batch_purge_table(
        'auth_transactions',
        'created_at < NOW() - INTERVAL ''25 minutes''
         AND transaction_status IN (''CONSUMED'', ''EXPIRED'', ''REJECTED'')',
        10000,
        0.1
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION purge_auth_transactions IS
'V6: Purge consumed auth_transactions older than 25 minutes. Run every 10 minutes.';

-- ============================================================================
-- FUNCTION: purge_sessions
-- ============================================================================
CREATE OR REPLACE FUNCTION purge_sessions()
RETURNS TABLE(deleted BIGINT, duration NUMERIC) AS $$
BEGIN
    -- Note: This cascades to tokens_active
    RETURN QUERY
    SELECT * FROM batch_purge_table(
        'sessions',
        'created_at < NOW() - INTERVAL ''25 hours''
         AND status IN (''EXPIRED'', ''LOGGED_OUT'', ''REVOKED'')',
        5000,  -- Smaller batch due to cascade deletes
        0.2    -- Longer sleep due to cascade impact
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION purge_sessions IS
'V6: Purge non-active sessions older than 25 hours. Cascades to tokens_active. Run every hour.';

-- ============================================================================
-- FUNCTION: mark_expired_tokens (NEW V6)
-- ============================================================================
CREATE OR REPLACE FUNCTION mark_expired_tokens()
RETURNS TABLE(marked BIGINT, duration NUMERIC) AS $$
DECLARE
    v_marked BIGINT;
    v_start TIMESTAMPTZ := CLOCK_TIMESTAMP();
BEGIN
    -- Mark tokens as EXPIRED when they pass their expires_at time
    UPDATE tokens_active
    SET status = 'EXPIRED', expired_at = NOW()
    WHERE status = 'ACTIVE'
      AND expires_at < NOW();

    GET DIAGNOSTICS v_marked = ROW_COUNT;

    -- Log metrics
    INSERT INTO purge_metrics (table_name, rows_deleted, duration_ms)
    VALUES ('tokens_active_marked', v_marked,
            (EXTRACT(EPOCH FROM (CLOCK_TIMESTAMP() - v_start)) * 1000)::INT);

    marked := v_marked;
    duration := EXTRACT(EPOCH FROM (CLOCK_TIMESTAMP() - v_start));
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mark_expired_tokens IS
'V6: Mark naturally expired tokens as EXPIRED (status update). Rotated tokens are deleted immediately. Run every 10 minutes.';

-- ============================================================================
-- FUNCTION: purge_expired_tokens (NEW V6)
-- ============================================================================
CREATE OR REPLACE FUNCTION purge_expired_tokens()
RETURNS TABLE(deleted BIGINT, duration NUMERIC) AS $$
DECLARE
    v_deleted BIGINT := 0;
    v_rows_affected INT;
    v_start TIMESTAMPTZ := CLOCK_TIMESTAMP();
    v_cutoff TIMESTAMPTZ := NOW() - INTERVAL '1 hour';
BEGIN
    -- Delete expired tokens after 1-hour buffer
    LOOP
        DELETE FROM tokens_active
        WHERE ctid IN (
            SELECT ctid FROM tokens_active
            WHERE status = 'EXPIRED'
              AND expired_at < v_cutoff
            LIMIT 10000
        );

        GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
        v_deleted := v_deleted + v_rows_affected;

        EXIT WHEN v_rows_affected < 10000;

        -- Small sleep to release locks
        PERFORM pg_sleep(0.1);
    END LOOP;

    -- Run VACUUM if deleted significant rows
    IF v_deleted > 50000 THEN
        EXECUTE 'VACUUM ANALYZE tokens_active';
    END IF;

    -- Log metrics
    INSERT INTO purge_metrics (table_name, rows_deleted, duration_ms)
    VALUES ('tokens_active_purged', v_deleted,
            (EXTRACT(EPOCH FROM (CLOCK_TIMESTAMP() - v_start)) * 1000)::INT);

    deleted := v_deleted;
    duration := EXTRACT(EPOCH FROM (CLOCK_TIMESTAMP() - v_start));
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION purge_expired_tokens IS
'V6: Purge expired tokens after 1-hour buffer. Runs in batches of 10K. VACUUMs if >50K deleted. Run every hour.';

-- ============================================================================
-- CLEANUP FUNCTIONS (Legacy)
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_transactions()
RETURNS TABLE(expired_count INTEGER) AS $$
BEGIN
    UPDATE auth_transactions
    SET transaction_status = 'EXPIRED'
    WHERE transaction_status = 'PENDING'
      AND expires_at < NOW();

    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_transactions IS 'V6: Mark expired PENDING transactions. Run every 5 minutes.';

CREATE OR REPLACE FUNCTION cleanup_expired_contexts()
RETURNS TABLE(expired_count INTEGER) AS $$
BEGIN
    UPDATE auth_contexts
    SET auth_outcome = 'EXPIRED',
        completed_at = NOW()
    WHERE auth_outcome IS NULL
      AND expires_at < NOW();

    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_contexts IS 'V6: Mark expired incomplete contexts. Run every 15 minutes.';

CREATE OR REPLACE FUNCTION expire_old_sessions()
RETURNS TABLE(expired_count INTEGER) AS $$
BEGIN
    UPDATE sessions
    SET status = 'EXPIRED'
    WHERE status = 'ACTIVE'
      AND expires_at < NOW();

    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION expire_old_sessions IS 'V6: Mark expired sessions. Run every hour.';

-- ============================================================================
-- DEVICE MANAGEMENT HELPER FUNCTIONS (for hash partitioned trusted_devices)
-- ============================================================================

-- ============================================================================
-- FUNCTION: bind_trusted_device
-- Purpose: Add new trusted device with automatic round-robin deletion
-- Notes: Enforces 10-device limit per user. Must include cupid for partition pruning.
-- ============================================================================
CREATE OR REPLACE FUNCTION bind_trusted_device(
    p_cupid VARCHAR(50),
    p_guid VARCHAR(50),
    p_app_id VARCHAR(50),
    p_device_fingerprint TEXT,
    p_device_name VARCHAR(200) DEFAULT NULL,
    p_device_type VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE(
    device_id UUID,
    trusted_at TIMESTAMPTZ,
    deleted_old_device BOOLEAN
) AS $$
DECLARE
    v_device_count INTEGER;
    v_device_hash VARCHAR(64);
    v_deleted BOOLEAN := FALSE;
BEGIN
    -- Hash the device fingerprint
    v_device_hash := encode(digest(p_device_fingerprint, 'sha256'), 'hex');

    -- Check current device count for this user/app
    -- Query hits single partition (cupid-based routing)
    SELECT COUNT(*) INTO v_device_count
    FROM trusted_devices
    WHERE cupid = p_cupid
      AND app_id = p_app_id
      AND status = 'ACTIVE';

    -- If at 10-device limit, delete oldest device (round-robin)
    IF v_device_count >= 10 THEN
        DELETE FROM trusted_devices
        WHERE device_id = (
            SELECT td.device_id FROM trusted_devices td
            WHERE td.cupid = p_cupid
              AND td.app_id = p_app_id
              AND td.status = 'ACTIVE'
            ORDER BY td.trusted_at ASC
            LIMIT 1
        ) AND cupid = p_cupid;  -- Include partition key for single-partition operation

        v_deleted := TRUE;
    END IF;

    -- Insert new device (automatically routed to correct partition by cupid)
    INSERT INTO trusted_devices (
        cupid, guid, app_id,
        device_fingerprint, device_fingerprint_hash,
        device_name, device_type
    ) VALUES (
        p_cupid, p_guid, p_app_id,
        p_device_fingerprint, v_device_hash,
        p_device_name, p_device_type
    )
    RETURNING trusted_devices.device_id, trusted_devices.trusted_at
    INTO device_id, trusted_at;

    deleted_old_device := v_deleted;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION bind_trusted_device IS 'V6: Bind new trusted device with automatic round-robin deletion. Enforces 10-device limit per user/app. All queries include cupid for single-partition operations.';

-- ============================================================================
-- FUNCTION: check_device_trust
-- Purpose: Check if device is trusted for the user
-- Returns: device_id and metadata if trusted, NULL if not
-- ============================================================================
CREATE OR REPLACE FUNCTION check_device_trust(
    p_cupid VARCHAR(50),
    p_device_fingerprint TEXT,
    p_app_id VARCHAR(50)
)
RETURNS TABLE(
    device_id UUID,
    trusted_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    device_name VARCHAR(200)
) AS $$
DECLARE
    v_device_hash VARCHAR(64);
BEGIN
    -- Hash the device fingerprint
    v_device_hash := encode(digest(p_device_fingerprint, 'sha256'), 'hex');

    -- Query hits single partition (based on cupid hash)
    RETURN QUERY
    SELECT td.device_id, td.trusted_at, td.last_used_at, td.device_name
    FROM trusted_devices td
    WHERE td.cupid = p_cupid  -- Partition key: single partition scan
      AND td.device_fingerprint_hash = v_device_hash
      AND td.app_id = p_app_id
      AND td.status = 'ACTIVE';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_device_trust IS 'V6: Check if device is trusted. Returns device info if trusted, empty if not. Single-partition query via cupid.';

-- ============================================================================
-- FUNCTION: update_device_last_used
-- Purpose: Update device last_used_at timestamp
-- Notes: MUST include cupid for partition pruning
-- ============================================================================
CREATE OR REPLACE FUNCTION update_device_last_used(
    p_device_id UUID,
    p_cupid VARCHAR(50)  -- Required for partition pruning
)
RETURNS BOOLEAN AS $$
DECLARE
    v_updated BOOLEAN;
BEGIN
    -- IMPORTANT: Must include cupid for partition pruning
    -- Query without cupid would scan all 16 partitions
    UPDATE trusted_devices
    SET last_used_at = NOW()
    WHERE device_id = p_device_id
      AND cupid = p_cupid;  -- Both required

    GET DIAGNOSTICS v_updated = FOUND;
    RETURN v_updated;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_device_last_used IS 'V6: Update device last used timestamp. Requires both device_id and cupid for single-partition operation.';

-- ============================================================================
-- FUNCTION: get_user_devices
-- Purpose: Get all active devices for a user
-- Returns: List of devices with metadata
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_devices(
    p_cupid VARCHAR(50),
    p_app_id VARCHAR(50)
)
RETURNS TABLE(
    device_id UUID,
    device_name VARCHAR(200),
    device_type VARCHAR(50),
    trusted_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ
) AS $$
BEGIN
    -- Hits single partition (cupid-based routing)
    RETURN QUERY
    SELECT td.device_id, td.device_name, td.device_type,
           td.trusted_at, td.last_used_at
    FROM trusted_devices td
    WHERE td.cupid = p_cupid
      AND td.app_id = p_app_id
      AND td.status = 'ACTIVE'
    ORDER BY td.last_used_at DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_user_devices IS 'V6: Get all active devices for user/app. Single-partition query via cupid.';

-- ============================================================================
-- FUNCTION: revoke_device
-- Purpose: Revoke a trusted device
-- Returns: TRUE if device was revoked, FALSE if not found
-- ============================================================================
CREATE OR REPLACE FUNCTION revoke_device(
    p_device_id UUID,
    p_cupid VARCHAR(50)  -- Required for partition pruning
)
RETURNS BOOLEAN AS $$
DECLARE
    v_revoked BOOLEAN;
BEGIN
    UPDATE trusted_devices
    SET status = 'REVOKED',
        revoked_at = NOW()
    WHERE device_id = p_device_id
      AND cupid = p_cupid  -- Include for single-partition operation
      AND status = 'ACTIVE';

    GET DIAGNOSTICS v_revoked = FOUND;
    RETURN v_revoked;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION revoke_device IS 'V6: Revoke trusted device. Requires both device_id and cupid for single-partition operation.';

-- ============================================================================
-- FUNCTION: get_device_count
-- Purpose: Get count of active devices for user
-- Returns: Number of active devices
-- ============================================================================
CREATE OR REPLACE FUNCTION get_device_count(
    p_cupid VARCHAR(50),
    p_app_id VARCHAR(50)
)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Single-partition query via cupid
    SELECT COUNT(*) INTO v_count
    FROM trusted_devices
    WHERE cupid = p_cupid
      AND app_id = p_app_id
      AND status = 'ACTIVE';

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_device_count IS 'V6: Get count of active devices for user/app. Single-partition query via cupid.';

-- ============================================================================
-- AUTO-VACUUM CONFIGURATION
-- ============================================================================

-- High-churn transactional tables: Aggressive auto-vacuum
ALTER TABLE auth_transactions SET (
    autovacuum_vacuum_scale_factor = 0.01,
    autovacuum_analyze_scale_factor = 0.005,
    autovacuum_vacuum_cost_delay = 2,
    autovacuum_vacuum_cost_limit = 1000
);

ALTER TABLE sessions SET (
    autovacuum_vacuum_scale_factor = 0.02,
    autovacuum_analyze_scale_factor = 0.01,
    autovacuum_vacuum_cost_delay = 2,
    autovacuum_vacuum_cost_limit = 1000
);

-- V6: tokens_active needs more aggressive vacuum due to expired token churn
ALTER TABLE tokens_active SET (
    autovacuum_vacuum_scale_factor = 0.01,
    autovacuum_analyze_scale_factor = 0.005,
    autovacuum_vacuum_cost_delay = 1,
    autovacuum_vacuum_cost_limit = 2000,
    autovacuum_naptime = 10  -- Check every 10 seconds
);

-- Partitioned tables: Less aggressive (purged via DROP)
ALTER TABLE auth_contexts SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
);

ALTER TABLE context_events SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
);

-- ============================================================================
-- PG_CRON JOB SCHEDULING
-- ============================================================================

-- Clear existing schedules (idempotent)
DO $$
DECLARE
    job_rec RECORD;
BEGIN
    FOR job_rec IN
        SELECT jobname FROM cron.job
        WHERE jobname IN (
            'purge-auth-transactions',
            'purge-sessions',
            'mark-expired-tokens',
            'purge-expired-tokens',
            'create-partitions-hourly',
            'drop-old-partitions-hourly',
            'cleanup-expired-transactions',
            'cleanup-expired-contexts',
            'expire-old-sessions',
            'vacuum-analyze-transactional',
            'vacuum-analyze-partitioned'
        )
    LOOP
        PERFORM cron.unschedule(job_rec.jobname);
    END LOOP;
END $$;

-- ============================================================
-- High-frequency purges (every 10 minutes)
-- ============================================================
SELECT cron.schedule(
    'purge-auth-transactions',
    '*/10 * * * *',
    'SELECT purge_auth_transactions()'
);

-- V6: Mark expired tokens every 10 minutes
SELECT cron.schedule(
    'mark-expired-tokens',
    '*/10 * * * *',
    'SELECT mark_expired_tokens()'
);

-- ============================================================
-- Cleanup expired records (mark as EXPIRED)
-- ============================================================
SELECT cron.schedule(
    'cleanup-expired-transactions',
    '*/5 * * * *',
    'SELECT cleanup_expired_transactions()'
);

SELECT cron.schedule(
    'cleanup-expired-contexts',
    '*/15 * * * *',
    'SELECT cleanup_expired_contexts()'
);

SELECT cron.schedule(
    'expire-old-sessions',
    '0 * * * *',
    'SELECT expire_old_sessions()'
);

-- ============================================================
-- Hourly purges
-- ============================================================
SELECT cron.schedule(
    'purge-sessions',
    '30 * * * *',  -- At :30 past each hour
    'SELECT purge_sessions()'
);

-- V6: Purge expired tokens after 1-hour buffer
SELECT cron.schedule(
    'purge-expired-tokens',
    '35 * * * *',  -- At :35 past each hour
    'SELECT purge_expired_tokens()'
);

-- ============================================================
-- Partition management (hourly)
-- ============================================================
SELECT cron.schedule(
    'create-partitions-hourly',
    '0 * * * *',  -- Top of each hour
    'SELECT create_future_partitions()'
);

SELECT cron.schedule(
    'drop-old-partitions-hourly',
    '5 * * * *',  -- :05 past each hour
    'SELECT drop_old_partitions()'
);

-- ============================================================
-- Daily maintenance
-- ============================================================
SELECT cron.schedule(
    'vacuum-analyze-transactional',
    '0 3 * * *',  -- 3 AM daily
    $$
    VACUUM ANALYZE auth_transactions;
    VACUUM ANALYZE sessions;
    VACUUM ANALYZE tokens_active;
    VACUUM ANALYZE trusted_devices;
    $$
);

SELECT cron.schedule(
    'vacuum-analyze-partitioned',
    '0 4 * * 0',  -- 4 AM Sundays
    $$
    VACUUM ANALYZE auth_contexts;
    VACUUM ANALYZE context_events;
    $$
);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT
    'Tables' as object_type,
    COUNT(*) as count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'auth_contexts',
    'auth_transactions',
    'sessions',
    'tokens_active',
    'trusted_devices',
    'context_events',
    'purge_metrics'
  )
UNION ALL
SELECT
    'Views' as object_type,
    COUNT(*) as count
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name LIKE 'v_%'
UNION ALL
SELECT
    'Functions' as object_type,
    COUNT(*) as count
FROM pg_proc
WHERE proname IN (
    'create_future_partitions',
    'drop_old_partitions',
    'batch_purge_table',
    'purge_auth_transactions',
    'purge_sessions',
    'mark_expired_tokens',
    'purge_expired_tokens',
    'cleanup_expired_transactions',
    'cleanup_expired_contexts',
    'expire_old_sessions'
)
UNION ALL
SELECT
    'pg_cron Jobs' as object_type,
    COUNT(*) as count
FROM cron.job
WHERE jobname IN (
    'purge-auth-transactions',
    'purge-sessions',
    'mark-expired-tokens',
    'purge-expired-tokens',
    'create-partitions-hourly',
    'drop-old-partitions-hourly',
    'cleanup-expired-transactions',
    'cleanup-expired-contexts',
    'expire-old-sessions',
    'vacuum-analyze-transactional',
    'vacuum-analyze-partitioned'
)
UNION ALL
SELECT
    'Partitions (auth_contexts)' as object_type,
    COUNT(*) as count
FROM pg_tables
WHERE tablename LIKE 'auth_contexts_%'
UNION ALL
SELECT
    'Partitions (context_events)' as object_type,
    COUNT(*) as count
FROM pg_tables
WHERE tablename LIKE 'context_events_%';

-- ============================================================================
-- MONITORING QUERY EXAMPLES
-- ============================================================================

-- Check table health
SELECT * FROM v_table_health WHERE health_status != '✅ HEALTHY';

-- Check partition status
SELECT * FROM v_partition_status;

-- Check purge performance
SELECT * FROM v_purge_performance;

-- Check active sessions
SELECT COUNT(*),
       AVG(active_token_count) as avg_tokens_per_session,
       SUM(expired_token_count) as total_expired_buffer
FROM v_active_sessions;

-- V6 CHECK: Token status monitoring
SELECT * FROM v_token_status;

-- Check replication lag (if replicas exist)
SELECT * FROM v_replication_status WHERE lag_seconds > 5;

-- V6 CHECK: context_events statistics
SELECT * FROM v_context_events_stats;

-- V6 CHECK: Verify date-prefixed IDs
SELECT
    'auth_contexts' as table_name,
    context_id,
    SUBSTRING(context_id, 1, 10) as extracted_date,
    created_at::date as actual_date,
    SUBSTRING(context_id, 1, 10)::date = created_at::date as dates_match
FROM auth_contexts
LIMIT 5;

-- Expected: All rows should have dates_match = TRUE

-- ============================================================================
-- V6 PERFORMANCE VALIDATION
-- ============================================================================

-- Test partition pruning with date-prefixed ID
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM context_events
WHERE context_id = 'ctx_2024-01-15_550e8400-e29b-41d4-a716-446655440000'
  AND created_at::date = '2024-01-15'::date;

-- Expected: Single partition scan (not all 90 partitions)
-- Expected execution time: <5ms

-- Test event array query
EXPLAIN (ANALYZE, BUFFERS)
SELECT context_id, event_count
FROM context_events
WHERE created_at >= CURRENT_DATE
  AND EXISTS (
      SELECT 1 FROM unnest(events) AS e
      WHERE e->>'type' = 'MFA_FAILED'
  )
LIMIT 100;

-- Expected: GIN index scan on events array
-- Expected execution time: <50ms

-- V6 TEST: Token status query performance
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM v_token_status;

-- Expected execution time: <100ms

-- ============================================================================
-- END OF SCRIPT
-- ============================================================================

-- Summary of what was created:
SELECT 'Schema Setup Complete!' as status,
       'Simplified Token Management - V6.0 (v3.0 Architecture)' as approach,
       'Capacity: 2.4M daily logins, 14.4M refreshes/day (5.3x headroom)' as capacity,
       'Key Features: Date-prefixed IDs + Unified Events + Eliminated tokens_inactive' as features,
       'Storage: 1.23TB (vs 8.1TB in v4.0) - 85% reduction' as storage,
       'Tables: 6 (4 transactional + 2 partitioned), Rows: 235.9M (vs 8.38B in v4.0)' as efficiency,
       'Operations: 107.3M ops/day (vs 242.6M in v4.0) - 56% reduction' as performance;
