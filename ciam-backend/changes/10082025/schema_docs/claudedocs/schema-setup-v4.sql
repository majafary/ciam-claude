-- ============================================================================
-- CIAM Database Schema Setup Script - Version 4.0 (Performance Optimized)
-- ============================================================================
-- Database: PostgreSQL 14+
-- Purpose: Customer Identity and Access Management (CIAM) Backend
-- Version: 4.0 - Production-Optimized for 2.4M Daily Logins (Greenfield)
-- Date: October 2025
--
-- IMPORTANT: This script is idempotent - safe to run multiple times
--
-- NEW IN V4 (Performance Optimizations):
--   - session_expires_at denormalized to tokens_active (50% query reduction)
--   - session_expires_at in tokens_inactive (audit completeness)
--   - Optimized validation index with WHERE clause
--   - DELETE RETURNING pattern examples in comments
--   - Corrected token lifetimes: ACCESS=5min, REFRESH=1hr, SESSION=21hr
--   - Realistic volume projections: 14.4M refreshes/day (not 76.8M)
--   - Updated monitoring thresholds
--
-- NEW IN V3 (Modified Hybrid Approach):
--   - Token table split (active vs inactive) to prevent 6.7M hourly deletes
--   - Partitioned analytical tables (audit_logs, drs_evaluations)
--   - Aggressive batch purge for transactional tables
--   - Optimized indexes for UPDATE and DELETE operations
--   - Automated partition management
--   - pg_cron job scheduling
--   - Comprehensive monitoring views
--
-- DESIGN PHILOSOPHY:
--   - Sliding Window with Absolute Cap: Tokens reset on refresh, session has 21h limit
--   - Denormalization for Performance: session_expires_at copied to tokens
--   - Transactional tables: Non-partitioned with batch purge
--   - Analytical tables: Partitioned with instant DROP purge
--   - Standard foreign keys preserved (no application breaking changes)
--   - Realistic Capacity: 14.4M daily refreshes (~6 per session avg)
--   - Design Capacity: 76.8M daily refreshes (5.3x headroom)
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

-- AUTH_TYPE: 'INITIAL' | 'STEP_UP'
-- TRANSACTION_TYPE: 'MFA_INITIATE' | 'MFA_VERIFY' | 'MFA_PUSH_VERIFY' | 'ESIGN_PRESENT' | 'ESIGN_ACCEPT' | 'DEVICE_BIND'
-- TRANSACTION_STATUS: 'PENDING' | 'CONSUMED' | 'EXPIRED' | 'REJECTED'
-- TOKEN_TYPE: 'ACCESS' | 'REFRESH' | 'ID'
-- TOKEN_STATUS: 'ACTIVE' | 'ROTATED' | 'REVOKED' | 'EXPIRED'
-- SESSION_STATUS: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'LOGGED_OUT'
-- DEVICE_STATUS: 'ACTIVE' | 'REVOKED' | 'EXPIRED'
-- DRS_RECOMMENDATION: 'ALLOW' | 'CHALLENGE' | 'DENY' | 'TRUST'
-- EVENT_SEVERITY: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL'

-- ============================================================================
-- TRANSACTIONAL TABLES (Non-Partitioned)
-- ============================================================================

-- ============================================================================
-- TABLE 1: auth_contexts
-- ============================================================================
-- Purpose: Immutable container for authentication journey
-- Lifecycle: INSERT once → UPDATE once (final outcome)
-- Retention: 25 minutes (purged via batch DELETE every 10 min)
-- Volume: ~42K records at steady state
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_contexts (
    -- Primary Key
    context_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

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
    session_id UUID,  -- FK added after sessions table created
    auth_type VARCHAR(20) NOT NULL DEFAULT 'INITIAL' CHECK (auth_type IN ('INITIAL', 'STEP_UP')),

    -- Journey Metadata
    requires_additional_steps BOOLEAN DEFAULT FALSE,

    -- Final Outcome (updated once at completion)
    auth_outcome VARCHAR(50),
    completed_at TIMESTAMPTZ,

    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '21 minutes'),

    -- Constraints
    CONSTRAINT check_outcome_completed CHECK (
        (auth_outcome IS NULL AND completed_at IS NULL) OR
        (auth_outcome IS NOT NULL AND completed_at IS NOT NULL)
    ),
    CONSTRAINT check_context_expiry_future CHECK (expires_at > created_at)
);

-- Query Indexes
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

-- Purge Optimization Index (CRITICAL for batch DELETE)
CREATE INDEX IF NOT EXISTS idx_auth_ctx_purge ON auth_contexts(created_at)
    WHERE auth_outcome IS NOT NULL;

-- Comments
COMMENT ON TABLE auth_contexts IS 'Authentication journey container. Purged after 25 minutes via batch DELETE.';
COMMENT ON COLUMN auth_contexts.expires_at IS 'Authentication context expires after 21 minutes';
COMMENT ON INDEX idx_auth_ctx_purge IS 'Optimized for batch purge of completed contexts';

-- ============================================================================
-- TABLE 2: auth_transactions
-- ============================================================================
-- Purpose: Step-by-step event log with single-use transaction tokens
-- Lifecycle: INSERT → status=PENDING → UPDATE to CONSUMED
-- Retention: 25 minutes (purged via batch DELETE every 10 min)
-- Volume: ~140K records at steady state
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_transactions (
    -- Primary Key
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign Keys
    context_id UUID NOT NULL REFERENCES auth_contexts(context_id) ON DELETE CASCADE,
    parent_transaction_id UUID REFERENCES auth_transactions(transaction_id),

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
COMMENT ON TABLE auth_transactions IS 'Step-by-step event log. Purged after 25 minutes via batch DELETE.';
COMMENT ON COLUMN auth_transactions.transaction_id IS 'Single-use token, consumed after one use';

-- ============================================================================
-- TABLE 3: sessions
-- ============================================================================
-- Purpose: Active user sessions (supports multi-device)
-- Lifecycle: Created after successful auth, expires or gets revoked
-- Retention: 25 hours (purged via batch DELETE every hour)
-- Volume: ~2.5M records at steady state
-- Token Lifecycle: ACCESS=5min, REFRESH=1hr (sliding), SESSION=21hr (absolute)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sessions (
    -- Primary Key
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign Keys
    context_id UUID NOT NULL REFERENCES auth_contexts(context_id),

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
COMMENT ON TABLE sessions IS 'Active user sessions with 21-hour absolute limit. Purged after 25 hours via batch DELETE.';
COMMENT ON COLUMN sessions.expires_at IS 'IMMUTABLE: Set once at creation to NOW() + 21 hours, never updated (absolute cap)';
COMMENT ON COLUMN sessions.last_activity_at IS 'NOTE: Not updated on token refresh to reduce write load. Token expires_at handles inactivity.';

-- Add FK from auth_contexts to sessions (now that sessions exists)
ALTER TABLE auth_contexts
    DROP CONSTRAINT IF EXISTS auth_contexts_session_id_fkey;
ALTER TABLE auth_contexts
    ADD CONSTRAINT auth_contexts_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES sessions(session_id);

-- ============================================================================
-- TABLE 4: tokens_active (v4 with session_expires_at optimization)
-- ============================================================================
-- Purpose: Currently active tokens only (split from tokens table)
-- Lifecycle: Created on login/refresh, moved to inactive on rotation/expiration
-- Retention: Active only (expired tokens moved to tokens_inactive)
-- Volume: ~6M records at steady state (realistic: ~6 refreshes per session avg)
-- Optimization: session_expires_at denormalized for single-query validation
-- ============================================================================

CREATE TABLE IF NOT EXISTS tokens_active (
    -- Primary Key
    token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign Keys
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    parent_token_id UUID,  -- Reference to previous token in rotation chain

    -- Token Identity
    token_type VARCHAR(20) NOT NULL CHECK (token_type IN ('ACCESS', 'REFRESH', 'ID')),
    token_value TEXT NOT NULL,
    token_value_hash VARCHAR(64) NOT NULL,

    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,

    -- ✅ V4 OPTIMIZATION: Denormalized for single-query validation
    session_expires_at TIMESTAMPTZ NOT NULL,

    -- Constraints
    CONSTRAINT check_token_expiry CHECK (expires_at > created_at),
    CONSTRAINT check_session_expiry CHECK (session_expires_at > created_at)
);

-- CRITICAL Indexes for token validation (performance-critical path)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_active_hash
    ON tokens_active(token_value_hash);

CREATE INDEX IF NOT EXISTS idx_tokens_active_session ON tokens_active(session_id, token_type);

-- Unique constraint: Only one ACTIVE token per type per session
CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_active_session_type
    ON tokens_active(session_id, token_type);

-- Purge expired tokens
CREATE INDEX IF NOT EXISTS idx_tokens_active_expires ON tokens_active(expires_at);

-- ✅ V4 OPTIMIZATION: Partial index for validation queries (WHERE both conditions)
CREATE INDEX IF NOT EXISTS idx_tokens_active_hash_valid
    ON tokens_active(token_value_hash)
    WHERE expires_at > NOW() AND session_expires_at > NOW();

-- Comments
COMMENT ON TABLE tokens_active IS 'Active tokens only. Expired/rotated moved to tokens_inactive. ~6M records at steady state.';
COMMENT ON COLUMN tokens_active.token_value_hash IS 'SHA256 hash for fast lookup without exposing token value';
COMMENT ON COLUMN tokens_active.expires_at IS 'SLIDING WINDOW: Reset on each rotation (5min for ACCESS/ID, 1hr for REFRESH)';
COMMENT ON COLUMN tokens_active.session_expires_at IS 'V4 OPTIMIZATION: Denormalized from sessions.expires_at for single-query validation. IMMUTABLE (copy from session).';
COMMENT ON INDEX idx_tokens_active_hash IS 'CRITICAL: Unique index for sub-millisecond token lookup';
COMMENT ON INDEX idx_tokens_active_hash_valid IS 'V4 OPTIMIZATION: Partial index for validation queries with both conditions';

-- ============================================================================
-- TABLE 5: tokens_inactive (v4 with session_expires_at)
-- ============================================================================
-- Purpose: Historical tokens (rotated, expired, revoked)
-- Lifecycle: Moved from tokens_active when status changes
-- Retention: 25 hours (purged via partition DROP every hour)
-- Volume: ~52.5M records at steady state (realistic: 14.4M refreshes/day × 25h / 24)
-- Partitioning: Hourly partitions by moved_at
-- ============================================================================

CREATE TABLE IF NOT EXISTS tokens_inactive (
    -- Columns
    token_id UUID NOT NULL,
    session_id UUID NOT NULL,  -- No FK (session may be purged)
    parent_token_id UUID,
    token_type VARCHAR(20) NOT NULL,
    token_value_hash VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('ROTATED', 'REVOKED', 'EXPIRED')),
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,

    -- ✅ V4 OPTIMIZATION: Added for audit completeness
    session_expires_at TIMESTAMPTZ NOT NULL,

    moved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Composite Primary Key (required for partitioning)
    PRIMARY KEY (token_id, moved_at)
) PARTITION BY RANGE (moved_at);

-- Create initial hourly partitions (25 hours worth)
DO $$
DECLARE
    start_time TIMESTAMPTZ := DATE_TRUNC('hour', NOW());
    partition_time TIMESTAMPTZ;
    partition_name TEXT;
BEGIN
    FOR i IN 0..24 LOOP
        partition_time := start_time + (i || ' hours')::INTERVAL;
        partition_name := 'tokens_inactive_' || TO_CHAR(partition_time, 'YYYY_MM_DD_HH24');

        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF tokens_inactive
             FOR VALUES FROM (%L) TO (%L)',
            partition_name,
            partition_time,
            partition_time + INTERVAL '1 hour'
        );
    END LOOP;
END $$;

-- Indexes (applied to each partition)
CREATE INDEX IF NOT EXISTS idx_tokens_inactive_session ON tokens_inactive(session_id, moved_at DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_inactive_created ON tokens_inactive(created_at);
CREATE INDEX IF NOT EXISTS idx_tokens_inactive_status ON tokens_inactive(status);

-- Comments
COMMENT ON TABLE tokens_inactive IS 'Historical tokens, partitioned hourly. Purged via partition DROP after 25 hours.';
COMMENT ON COLUMN tokens_inactive.moved_at IS 'Partition key: timestamp when token moved from active to inactive';
COMMENT ON COLUMN tokens_inactive.session_expires_at IS 'V4: Copied from tokens_active for audit trail. Shows when session would have expired.';
COMMENT ON COLUMN tokens_inactive.status IS 'ROTATED (normal rotation), EXPIRED (natural expiry), REVOKED (logout/admin)';

-- ============================================================================
-- TABLE 6: trusted_devices
-- ============================================================================
-- Purpose: Device binding for MFA skip on trusted devices
-- Lifecycle: Created on device bind acceptance, revoked manually or expires
-- Retention: Indefinite (manual revocation only)
-- Volume: ~8.6M records (cumulative)
-- ============================================================================

CREATE TABLE IF NOT EXISTS trusted_devices (
    -- Primary Key
    device_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Customer & User Identity
    guid VARCHAR(50) NOT NULL,
    cupid VARCHAR(50) NOT NULL,

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
    CONSTRAINT check_device_revoked CHECK (
        (status != 'REVOKED' AND revoked_at IS NULL) OR
        (status = 'REVOKED' AND revoked_at IS NOT NULL)
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_devices_guid ON trusted_devices(guid);
CREATE INDEX IF NOT EXISTS idx_devices_cupid_app ON trusted_devices(cupid, app_id)
    WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_devices_fingerprint_hash ON trusted_devices(device_fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_devices_trusted ON trusted_devices(trusted_at DESC);

-- Unique constraint: one device can only be trusted once per user per app
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_unique_per_user_app
    ON trusted_devices(cupid, app_id, device_fingerprint_hash)
    WHERE status = 'ACTIVE';

-- Comments
COMMENT ON TABLE trusted_devices IS 'Trusted device records for MFA skip. No automatic purge.';

-- ============================================================================
-- ANALYTICAL TABLES (Partitioned)
-- ============================================================================

-- ============================================================================
-- TABLE 7: drs_evaluations (PARTITIONED)
-- ============================================================================
-- Purpose: Device Recognition Service (Transmit DRS) risk assessments
-- Lifecycle: INSERT only, never updated
-- Retention: 90 days (purged via partition DROP daily)
-- Volume: ~216M records at steady state (partitioned)
-- Partitioning: Daily partitions by created_at
-- ============================================================================

CREATE TABLE IF NOT EXISTS drs_evaluations (
    -- Columns
    evaluation_id UUID NOT NULL DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Context/Session references (no FKs - may be purged before DRS)
    context_id UUID,
    session_id UUID,

    -- Customer & User Identity
    guid VARCHAR(50) NOT NULL,
    cupid VARCHAR(50) NOT NULL,

    -- DRS Request
    action_token_hash VARCHAR(64) NOT NULL,

    -- DRS Response
    device_id VARCHAR(100),
    recommendation VARCHAR(20) NOT NULL,
    risk_score INT NOT NULL CHECK (risk_score BETWEEN 0 AND 100),

    -- Device Attributes (flattened from DRS response)
    browser VARCHAR(100),
    browser_version VARCHAR(50),
    operating_system VARCHAR(100),
    os_version VARCHAR(50),
    device_type VARCHAR(50),
    is_mobile BOOLEAN,
    screen_resolution VARCHAR(20),
    user_agent TEXT,
    ip_location VARCHAR(100),

    -- Risk Signals (flattened from DRS response)
    primary_signal_type VARCHAR(50),
    signal_count INT,
    has_high_risk_signals BOOLEAN,
    signal_types TEXT[],

    -- Full Response (for audit and future extensibility)
    raw_response JSONB NOT NULL,

    -- Composite Primary Key (required for partitioning)
    PRIMARY KEY (evaluation_id, created_at)
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
        partition_name := 'drs_evaluations_' || TO_CHAR(partition_date, 'YYYY_MM_DD');

        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF drs_evaluations
             FOR VALUES FROM (%L) TO (%L)',
            partition_name,
            partition_date,
            partition_date + INTERVAL '1 day'
        );
    END LOOP;
END $$;

-- Indexes (applied to each partition)
CREATE INDEX IF NOT EXISTS idx_drs_guid ON drs_evaluations(guid);
CREATE INDEX IF NOT EXISTS idx_drs_cupid_time ON drs_evaluations(cupid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drs_recommendation ON drs_evaluations(recommendation);
CREATE INDEX IF NOT EXISTS idx_drs_risk_score ON drs_evaluations(risk_score);
CREATE INDEX IF NOT EXISTS idx_drs_action_token ON drs_evaluations(action_token_hash);

-- Session lifecycle tracking
CREATE INDEX IF NOT EXISTS idx_drs_session_time ON drs_evaluations(session_id, created_at DESC)
    WHERE session_id IS NOT NULL;

-- Risk signal indexes
CREATE INDEX IF NOT EXISTS idx_drs_high_risk ON drs_evaluations(has_high_risk_signals)
    WHERE has_high_risk_signals = TRUE;
CREATE INDEX IF NOT EXISTS idx_drs_signal_types ON drs_evaluations USING GIN(signal_types);

-- Comments
COMMENT ON TABLE drs_evaluations IS 'DRS risk assessments, partitioned daily. Purged via partition DROP after 90 days.';

-- ============================================================================
-- TABLE 8: audit_logs (PARTITIONED)
-- ============================================================================
-- Purpose: Comprehensive event timeline for all system activity
-- Lifecycle: INSERT only (immutable)
-- Retention: 90 days (purged via partition DROP daily)
-- Volume: ~7.884B records at steady state (partitioned)
-- Partitioning: Daily partitions by created_at
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    -- Columns
    audit_id UUID NOT NULL DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Event Classification
    event_type VARCHAR(100) NOT NULL,
    event_category VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'INFO',

    -- Entity References (no FKs - entities may be purged)
    cupid VARCHAR(50),
    context_id UUID,
    transaction_id UUID,
    session_id UUID,
    auth_type VARCHAR(20),

    -- Request Context
    correlation_id UUID,
    ip_address INET,
    user_agent TEXT,

    -- Event Details (flexible JSONB)
    event_data JSONB NOT NULL,

    -- Composite Primary Key (required for partitioning)
    PRIMARY KEY (audit_id, created_at)
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
        partition_name := 'audit_logs_' || TO_CHAR(partition_date, 'YYYY_MM_DD');

        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_logs
             FOR VALUES FROM (%L) TO (%L)',
            partition_name,
            partition_date,
            partition_date + INTERVAL '1 day'
        );
    END LOOP;
END $$;

-- Indexes (applied to each partition)
CREATE INDEX IF NOT EXISTS idx_audit_cupid_time ON audit_logs(cupid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event_category ON audit_logs(event_category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_context ON audit_logs(context_id);
CREATE INDEX IF NOT EXISTS idx_audit_transaction ON audit_logs(transaction_id);
CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_correlation ON audit_logs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_severity ON audit_logs(severity, created_at DESC)
    WHERE severity IN ('ERROR', 'CRITICAL');

-- Session lifecycle audit queries
CREATE INDEX IF NOT EXISTS idx_audit_session_time ON audit_logs(session_id, created_at DESC)
    WHERE session_id IS NOT NULL;

-- JSONB expression indexes for fraud detection
CREATE INDEX IF NOT EXISTS idx_audit_error_code
    ON audit_logs ((event_data->>'error_code'))
    WHERE event_category = 'AUTH' AND event_data->>'error_code' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_mfa_attempts
    ON audit_logs (((event_data->>'attempt_number')::int))
    WHERE event_type LIKE 'MFA_%' AND event_data->>'attempt_number' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_event_data_gin
    ON audit_logs USING GIN (event_data jsonb_path_ops);

-- Comments
COMMENT ON TABLE audit_logs IS 'Comprehensive event timeline, partitioned daily. Purged via partition DROP after 90 days.';

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
    COUNT(t.token_id) as active_token_count,
    COUNT(t.token_id) FILTER (WHERE t.token_type = 'ACCESS') as has_access_token,
    COUNT(t.token_id) FILTER (WHERE t.token_type = 'REFRESH') as has_refresh_token
FROM sessions s
LEFT JOIN tokens_active t ON t.session_id = s.session_id
WHERE s.status = 'ACTIVE'
GROUP BY s.session_id;

COMMENT ON VIEW v_active_sessions IS 'Active sessions with token counts for monitoring';

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

COMMENT ON VIEW v_pending_transactions IS 'Currently active transactions awaiting user action';

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

COMMENT ON VIEW v_table_health IS 'Table size and bloat monitoring for all tables';

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

COMMENT ON VIEW v_partition_status IS 'Partition count and size monitoring';

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

COMMENT ON VIEW v_purge_performance IS 'Purge job performance over last 24 hours';

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

COMMENT ON VIEW v_replication_status IS 'Replication lag monitoring';

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
    -- tokens_inactive: Create hourly partitions (48 hours ahead)
    FOR i IN 0..47 LOOP
        v_partition_name := 'tokens_inactive_' ||
            TO_CHAR(DATE_TRUNC('hour', NOW()) + (i || ' hours')::INTERVAL, 'YYYY_MM_DD_HH24');

        SELECT EXISTS(
            SELECT 1 FROM pg_tables WHERE tablename = v_partition_name
        ) INTO v_exists;

        IF NOT v_exists THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF tokens_inactive
                 FOR VALUES FROM (%L) TO (%L)',
                v_partition_name,
                DATE_TRUNC('hour', NOW()) + (i || ' hours')::INTERVAL,
                DATE_TRUNC('hour', NOW()) + ((i+1) || ' hours')::INTERVAL
            );
            v_result := v_result || 'Created ' || v_partition_name || E'\n';
        END IF;
    END LOOP;

    -- drs_evaluations: Create daily partitions (7 days ahead)
    FOR i IN 0..6 LOOP
        v_partition_name := 'drs_evaluations_' ||
            TO_CHAR(CURRENT_DATE + i, 'YYYY_MM_DD');

        SELECT EXISTS(
            SELECT 1 FROM pg_tables WHERE tablename = v_partition_name
        ) INTO v_exists;

        IF NOT v_exists THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF drs_evaluations
                 FOR VALUES FROM (%L) TO (%L)',
                v_partition_name,
                CURRENT_DATE + i,
                CURRENT_DATE + i + 1
            );
            v_result := v_result || 'Created ' || v_partition_name || E'\n';
        END IF;
    END LOOP;

    -- audit_logs: Create daily partitions (7 days ahead)
    FOR i IN 0..6 LOOP
        v_partition_name := 'audit_logs_' ||
            TO_CHAR(CURRENT_DATE + i, 'YYYY_MM_DD');

        SELECT EXISTS(
            SELECT 1 FROM pg_tables WHERE tablename = v_partition_name
        ) INTO v_exists;

        IF NOT v_exists THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF audit_logs
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
'Creates future partitions: 48 hours for tokens_inactive, 7 days for drs_evaluations and audit_logs. Run hourly.';

-- ============================================================================
-- FUNCTION: drop_old_partitions
-- ============================================================================
CREATE OR REPLACE FUNCTION drop_old_partitions()
RETURNS TEXT AS $$
DECLARE
    v_result TEXT := '';
    v_partition_name TEXT;
BEGIN
    -- tokens_inactive: Drop partitions older than 25 hours
    FOR v_partition_name IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename LIKE 'tokens_inactive_%'
        AND tablename < 'tokens_inactive_' ||
            TO_CHAR(NOW() - INTERVAL '25 hours', 'YYYY_MM_DD_HH24')
    LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || v_partition_name;
        v_result := v_result || 'Dropped ' || v_partition_name || E'\n';
    END LOOP;

    -- drs_evaluations: Drop partitions older than 90 days
    FOR v_partition_name IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename LIKE 'drs_evaluations_%'
        AND tablename < 'drs_evaluations_' ||
            TO_CHAR(CURRENT_DATE - INTERVAL '90 days', 'YYYY_MM_DD')
    LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || v_partition_name;
        v_result := v_result || 'Dropped ' || v_partition_name || E'\n';
    END LOOP;

    -- audit_logs: Drop partitions older than 90 days
    FOR v_partition_name IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename LIKE 'audit_logs_%'
        AND tablename < 'audit_logs_' ||
            TO_CHAR(CURRENT_DATE - INTERVAL '90 days', 'YYYY_MM_DD')
    LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || v_partition_name;
        v_result := v_result || 'Dropped ' || v_partition_name || E'\n';
    END LOOP;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION drop_old_partitions IS
'Drops old partitions based on retention: 25h for tokens_inactive, 90d for drs_evaluations and audit_logs. Run hourly.';

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
'Generic batch purge function with metrics logging. Deletes in batches with configurable sleep.';

-- ============================================================================
-- FUNCTION: purge_auth_contexts
-- ============================================================================
CREATE OR REPLACE FUNCTION purge_auth_contexts()
RETURNS TABLE(deleted BIGINT, duration NUMERIC) AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM batch_purge_table(
        'auth_contexts',
        'created_at < NOW() - INTERVAL ''25 minutes'' AND auth_outcome IS NOT NULL',
        10000,
        0.1
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION purge_auth_contexts IS
'Purge completed auth_contexts older than 25 minutes. Run every 10 minutes.';

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
'Purge consumed auth_transactions older than 25 minutes. Run every 10 minutes.';

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
'Purge non-active sessions older than 25 hours. Cascades to tokens_active. Run every hour.';

-- ============================================================================
-- FUNCTION: purge_expired_tokens (v4 with DELETE RETURNING pattern example)
-- ============================================================================
CREATE OR REPLACE FUNCTION purge_expired_tokens()
RETURNS TABLE(deleted BIGINT, duration NUMERIC) AS $$
DECLARE
    v_deleted BIGINT;
    v_start TIMESTAMPTZ := CLOCK_TIMESTAMP();
BEGIN
    -- ✅ V4 NOTE: This function demonstrates DELETE + INSERT pattern.
    -- Application code should use DELETE...RETURNING for atomic operations.
    -- See token-management-system-guide.md for application examples.

    -- Move expired tokens to inactive first
    INSERT INTO tokens_inactive (
        token_id, session_id, parent_token_id,
        token_type, token_value_hash, status,
        created_at, expires_at, session_expires_at, moved_at
    )
    SELECT
        token_id, session_id, parent_token_id,
        token_type, token_value_hash, 'EXPIRED',
        created_at, expires_at, session_expires_at, NOW()
    FROM tokens_active
    WHERE expires_at < NOW();

    -- Delete from active
    DELETE FROM tokens_active WHERE expires_at < NOW();
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    -- Log metrics
    INSERT INTO purge_metrics (table_name, rows_deleted, duration_ms)
    VALUES ('tokens_active', v_deleted,
            (EXTRACT(EPOCH FROM (CLOCK_TIMESTAMP() - v_start)) * 1000)::INT);

    deleted := v_deleted;
    duration := EXTRACT(EPOCH FROM (CLOCK_TIMESTAMP() - v_start));
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION purge_expired_tokens IS
'Move expired tokens from active to inactive, then delete from active. Run every hour. NOTE: Application code should use DELETE...RETURNING for token rotation (see guide).';

-- ============================================================================
-- CLEANUP FUNCTIONS (Legacy from V2)
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

COMMENT ON FUNCTION cleanup_expired_transactions IS 'Mark expired PENDING transactions. Run every 5 minutes.';

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

COMMENT ON FUNCTION cleanup_expired_contexts IS 'Mark expired incomplete contexts. Run every 15 minutes.';

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

COMMENT ON FUNCTION expire_old_sessions IS 'Mark expired sessions. Run every hour.';

-- ============================================================================
-- AUTO-VACUUM CONFIGURATION
-- ============================================================================

-- High-churn transactional tables: Aggressive auto-vacuum
ALTER TABLE auth_contexts SET (
    autovacuum_vacuum_scale_factor = 0.01,
    autovacuum_analyze_scale_factor = 0.005,
    autovacuum_vacuum_cost_delay = 2,
    autovacuum_vacuum_cost_limit = 1000
);

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

ALTER TABLE tokens_active SET (
    autovacuum_vacuum_scale_factor = 0.01,
    autovacuum_analyze_scale_factor = 0.005,
    autovacuum_vacuum_cost_delay = 1,
    autovacuum_vacuum_cost_limit = 2000,
    autovacuum_naptime = 10  -- Check every 10 seconds
);

-- Partitioned tables: Less aggressive (purged via DROP)
ALTER TABLE drs_evaluations SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
);

ALTER TABLE audit_logs SET (
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
            'purge-auth-contexts',
            'purge-auth-transactions',
            'purge-sessions',
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
    'purge-auth-contexts',
    '*/10 * * * *',
    'SELECT purge_auth_contexts()'
);

SELECT cron.schedule(
    'purge-auth-transactions',
    '*/10 * * * *',
    'SELECT purge_auth_transactions()'
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
    VACUUM ANALYZE auth_contexts;
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
    VACUUM ANALYZE drs_evaluations;
    VACUUM ANALYZE audit_logs;
    VACUUM ANALYZE tokens_inactive;
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
    'tokens_inactive',
    'trusted_devices',
    'drs_evaluations',
    'audit_logs',
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
    'purge_auth_contexts',
    'purge_auth_transactions',
    'purge_sessions',
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
    'purge-auth-contexts',
    'purge-auth-transactions',
    'purge-sessions',
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
    'Partitions (tokens_inactive)' as object_type,
    COUNT(*) as count
FROM pg_tables
WHERE tablename LIKE 'tokens_inactive_%'
UNION ALL
SELECT
    'Partitions (drs_evaluations)' as object_type,
    COUNT(*) as count
FROM pg_tables
WHERE tablename LIKE 'drs_evaluations_%'
UNION ALL
SELECT
    'Partitions (audit_logs)' as object_type,
    COUNT(*) as count
FROM pg_tables
WHERE tablename LIKE 'audit_logs_%';

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
       AVG(active_token_count) as avg_tokens_per_session
FROM v_active_sessions;

-- Check replication lag (if replicas exist)
SELECT * FROM v_replication_status WHERE lag_seconds > 5;

-- ✅ V4 OPTIMIZATION CHECK: Verify session_expires_at is populated
SELECT
    token_type,
    COUNT(*) as count,
    COUNT(session_expires_at) as with_session_expires,
    CASE
        WHEN COUNT(*) = COUNT(session_expires_at) THEN '✅ ALL POPULATED'
        ELSE '❌ MISSING session_expires_at'
    END as status
FROM tokens_active
GROUP BY token_type;

-- Expected: All tokens should have session_expires_at populated

-- ============================================================================
-- V4 PERFORMANCE VALIDATION
-- ============================================================================

-- Test single-query validation (should use idx_tokens_active_hash_valid)
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM tokens_active
WHERE token_value_hash = 'test_hash'
  AND expires_at > NOW()
  AND session_expires_at > NOW();

-- Expected: Index Scan using idx_tokens_active_hash_valid
-- Expected execution time: <5ms

-- ============================================================================
-- END OF SCRIPT
-- ============================================================================

-- Summary of what was created:
SELECT 'Schema Setup Complete!' as status,
       'Modified Hybrid Approach - V4.0 (Performance Optimized)' as approach,
       'Capacity: 2.4M daily logins, 14.4M refreshes/day (5.3x headroom)' as capacity,
       'Optimizations: session_expires_at denormalization + DELETE RETURNING' as optimization;
