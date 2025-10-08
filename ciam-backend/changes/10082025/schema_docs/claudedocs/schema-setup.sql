-- ============================================================================
-- CIAM Database Schema Setup Script
-- ============================================================================
-- Database: PostgreSQL 14+
-- Purpose: Customer Identity and Access Management (CIAM) Backend
-- Version: 1.0
-- Date: October 2025
--
-- IMPORTANT: This script is idempotent - safe to run multiple times
-- ============================================================================

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

-- UUID generation (choose one based on PostgreSQL version)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- OR for PostgreSQL 13+:
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Query performance monitoring (recommended)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- ============================================================================
-- CUSTOM TYPES (ENUMS)
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE transaction_type AS ENUM (
        'MFA_INITIATE',
        'MFA_VERIFY',
        'MFA_PUSH_VERIFY',
        'ESIGN_PRESENT',
        'ESIGN_ACCEPT',
        'DEVICE_BIND'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE transaction_status AS ENUM (
        'PENDING',
        'CONSUMED',
        'EXPIRED',
        'REJECTED'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE token_type AS ENUM (
        'ACCESS',
        'REFRESH',
        'ID'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE token_status AS ENUM (
        'ACTIVE',
        'ROTATED',
        'REVOKED',
        'EXPIRED'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE session_status AS ENUM (
        'ACTIVE',
        'EXPIRED',
        'REVOKED',
        'LOGGED_OUT'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE device_status AS ENUM (
        'ACTIVE',
        'REVOKED',
        'EXPIRED'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE drs_recommendation AS ENUM (
        'ALLOW',
        'CHALLENGE',
        'DENY',
        'TRUST'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE event_severity AS ENUM (
        'INFO',
        'WARN',
        'ERROR',
        'CRITICAL'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- TABLE 1: auth_contexts
-- ============================================================================
-- Purpose: Immutable container for authentication journey
-- Lifecycle: INSERT once → UPDATE once (final outcome)
-- Records: ~1M per day (all login attempts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_contexts (
    -- Primary Key
    context_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User Identity (from LDAP)
    cupid VARCHAR(50) NOT NULL,

    -- Application Context
    app_id VARCHAR(50) NOT NULL,
    app_version VARCHAR(20) NOT NULL,

    -- Device & Network
    device_fingerprint TEXT,
    ip_address INET NOT NULL,

    -- Tracing
    correlation_id UUID,

    -- Journey Metadata
    requires_additional_steps BOOLEAN DEFAULT FALSE,

    -- Final Outcome (updated once at completion)
    auth_outcome VARCHAR(50), -- SUCCESS, EXPIRED, ABANDONED, FAILED
    completed_at TIMESTAMPTZ,

    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),

    -- Constraints
    CONSTRAINT check_outcome_completed CHECK (
        (auth_outcome IS NULL AND completed_at IS NULL) OR
        (auth_outcome IS NOT NULL AND completed_at IS NOT NULL)
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_auth_ctx_cupid ON auth_contexts(cupid);
CREATE INDEX IF NOT EXISTS idx_auth_ctx_correlation ON auth_contexts(correlation_id);
CREATE INDEX IF NOT EXISTS idx_auth_ctx_expires ON auth_contexts(expires_at)
    WHERE auth_outcome IS NULL;
CREATE INDEX IF NOT EXISTS idx_auth_ctx_created ON auth_contexts(created_at DESC);

-- Comments
COMMENT ON TABLE auth_contexts IS 'Immutable container for authentication journey. One per login attempt.';
COMMENT ON COLUMN auth_contexts.context_id IS 'Unique identifier for authentication journey, bridges pre-auth to post-auth';
COMMENT ON COLUMN auth_contexts.cupid IS 'User identifier from LDAP system';
COMMENT ON COLUMN auth_contexts.requires_additional_steps IS 'TRUE if MFA/eSign/device bind required';
COMMENT ON COLUMN auth_contexts.auth_outcome IS 'Final result: SUCCESS, EXPIRED, ABANDONED, FAILED';

-- ============================================================================
-- TABLE 2: auth_transactions
-- ============================================================================
-- Purpose: Step-by-step event log with single-use transaction tokens
-- Lifecycle: INSERT → status=PENDING → UPDATE to CONSUMED → INSERT next
-- Records: ~3-5 per context (with MFA/eSign/device bind flow)
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_transactions (
    -- Primary Key
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign Keys
    context_id UUID NOT NULL REFERENCES auth_contexts(context_id) ON DELETE CASCADE,
    parent_transaction_id UUID REFERENCES auth_transactions(transaction_id),

    -- Transaction Identity
    transaction_type transaction_type NOT NULL,
    transaction_status transaction_status NOT NULL DEFAULT 'PENDING',
    sequence_number INT NOT NULL,
    phase VARCHAR(50) NOT NULL, -- MFA, ESIGN, DEVICE_BIND

    -- ==================== MFA PHASE ====================
    -- MFA method selection
    mfa_method VARCHAR(10), -- sms, voice, push
    mfa_option_id SMALLINT CHECK (mfa_option_id BETWEEN 1 AND 6),

    -- MFA options from LDAP (stored on first MFA transaction)
    mfa_options JSONB,
    -- Example: [{"phone_last_four": "1234", "mfa_option_id": 1}]

    mobile_approve_status VARCHAR(20), -- NOT_REGISTERED, ENABLED, DISABLED

    -- Push notification specifics
    display_number INT,
    selected_number INT,

    -- MFA verification tracking
    verification_result VARCHAR(20), -- CORRECT, INCORRECT, TIMEOUT
    attempt_number INT,

    -- ==================== ESIGN PHASE ====================
    esign_document_id VARCHAR(100),
    esign_action VARCHAR(20), -- PRESENTED, ACCEPTED

    -- ==================== DEVICE BIND PHASE ====================
    device_bind_decision VARCHAR(20), -- OFFERED, ACCEPTED, DECLINED

    -- Lifecycle
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),

    -- Constraints
    CONSTRAINT check_consumed CHECK (
        (transaction_status = 'PENDING' AND consumed_at IS NULL) OR
        (transaction_status != 'PENDING' AND consumed_at IS NOT NULL)
    ),
    CONSTRAINT check_sequence_positive CHECK (sequence_number > 0)
);

-- Indexes (CRITICAL for performance)
CREATE INDEX IF NOT EXISTS idx_auth_tx_context ON auth_transactions(context_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_auth_tx_parent ON auth_transactions(parent_transaction_id);
CREATE INDEX IF NOT EXISTS idx_auth_tx_status ON auth_transactions(transaction_status, expires_at);

-- Unique constraint: Only one PENDING transaction per context
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_tx_context_pending
    ON auth_transactions(context_id)
    WHERE transaction_status = 'PENDING';

-- Comments
COMMENT ON TABLE auth_transactions IS 'Step-by-step event log with single-use transaction tokens';
COMMENT ON COLUMN auth_transactions.transaction_id IS 'Single-use token, consumed after one use';
COMMENT ON COLUMN auth_transactions.sequence_number IS 'Sequential order within context (1, 2, 3...)';
COMMENT ON COLUMN auth_transactions.parent_transaction_id IS 'Links to previous transaction for chain tracking';
COMMENT ON COLUMN auth_transactions.mfa_options IS 'JSONB array of OTP methods from LDAP';

-- ============================================================================
-- TABLE 3: sessions
-- ============================================================================
-- Purpose: Active user sessions (supports multi-device)
-- Lifecycle: Created after successful auth, expires or gets revoked
-- Records: ~500K active sessions at any time
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
    status session_status NOT NULL DEFAULT 'ACTIVE',

    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),

    -- Revocation (manual termination)
    revoked_at TIMESTAMPTZ,
    revoked_by VARCHAR(100), -- Agent ID or system
    revocation_reason TEXT,

    -- Constraints
    CONSTRAINT check_revoked CHECK (
        (status != 'REVOKED' AND revoked_at IS NULL) OR
        (status = 'REVOKED' AND revoked_at IS NOT NULL)
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_cupid ON sessions(cupid)
    WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_sessions_context ON sessions(context_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status_expires ON sessions(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at DESC);

-- Comments
COMMENT ON TABLE sessions IS 'Active user sessions. One CUPID can have multiple sessions (multi-device).';
COMMENT ON COLUMN sessions.context_id IS 'Links back to authentication journey that created this session';
COMMENT ON COLUMN sessions.last_activity_at IS 'Updated on token refresh or API activity';
COMMENT ON COLUMN sessions.revoked_by IS 'Agent ID if manually revoked, or SYSTEM for automatic revocation';

-- ============================================================================
-- TABLE 4: tokens
-- ============================================================================
-- Purpose: Access/Refresh/ID tokens with rotation chain tracking
-- Lifecycle: Created with session, rotated on refresh, revoked on logout
-- Records: ~1.5M active tokens (3 per session)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tokens (
    -- Primary Key
    token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign Keys
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    parent_token_id UUID REFERENCES tokens(token_id),

    -- Token Identity
    token_type token_type NOT NULL,
    token_value TEXT NOT NULL,
    token_value_hash VARCHAR(64) NOT NULL, -- SHA256 for fast lookup

    -- Token State
    status token_status NOT NULL DEFAULT 'ACTIVE',

    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT check_token_revoked CHECK (
        (status != 'REVOKED' AND revoked_at IS NULL) OR
        (status = 'REVOKED' AND revoked_at IS NOT NULL)
    )
);

-- Indexes (CRITICAL for token validation performance)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_value_hash
    ON tokens(token_value_hash)
    WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_tokens_session ON tokens(session_id, token_type);
CREATE INDEX IF NOT EXISTS idx_tokens_parent ON tokens(parent_token_id);
CREATE INDEX IF NOT EXISTS idx_tokens_expires ON tokens(expires_at)
    WHERE status = 'ACTIVE';

-- Unique constraint: Only one ACTIVE token per type per session
CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_session_type_active
    ON tokens(session_id, token_type)
    WHERE status = 'ACTIVE';

-- Comments
COMMENT ON TABLE tokens IS 'Access/Refresh/ID tokens with rotation chain for security';
COMMENT ON COLUMN tokens.token_value_hash IS 'SHA256 hash for fast lookup without exposing token value';
COMMENT ON COLUMN tokens.parent_token_id IS 'Links to previous token in rotation chain (for refresh tokens)';
COMMENT ON COLUMN tokens.status IS 'ACTIVE=current, ROTATED=replaced, REVOKED=manually invalidated, EXPIRED=time-based';

-- ============================================================================
-- TABLE 5: trusted_devices
-- ============================================================================
-- Purpose: Device binding for MFA skip on trusted devices
-- Lifecycle: Created on device bind acceptance, revoked manually or expires
-- Records: ~100K trusted devices per 1M users
-- ============================================================================

CREATE TABLE IF NOT EXISTS trusted_devices (
    -- Primary Key
    device_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User Identity
    cupid VARCHAR(50) NOT NULL,

    -- Device Identity
    device_fingerprint TEXT NOT NULL,
    device_fingerprint_hash VARCHAR(64) NOT NULL, -- SHA256 for fast lookup

    -- Device Metadata
    device_name VARCHAR(200), -- User-friendly name
    device_type VARCHAR(50), -- BROWSER, MOBILE_APP, TABLET, DESKTOP_APP

    -- Trust State
    status device_status NOT NULL DEFAULT 'ACTIVE',

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
CREATE INDEX IF NOT EXISTS idx_devices_cupid ON trusted_devices(cupid)
    WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_devices_fingerprint_hash ON trusted_devices(device_fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_devices_trusted ON trusted_devices(trusted_at DESC);

-- Comments
COMMENT ON TABLE trusted_devices IS 'Trusted device records for MFA skip on known devices';
COMMENT ON COLUMN trusted_devices.device_fingerprint_hash IS 'SHA256 hash for fast device lookup';
COMMENT ON COLUMN trusted_devices.last_used_at IS 'Updated each time device is used for login';

-- ============================================================================
-- TABLE 6: drs_evaluations
-- ============================================================================
-- Purpose: Device Recognition Service (Transmit DRS) risk assessments
-- Lifecycle: Created on each login attempt with DRS token
-- Records: ~1M per day (one per login attempt)
-- ============================================================================

CREATE TABLE IF NOT EXISTS drs_evaluations (
    -- Primary Key
    evaluation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign Keys
    context_id UUID NOT NULL REFERENCES auth_contexts(context_id) ON DELETE CASCADE,

    -- User Identity
    cupid VARCHAR(50) NOT NULL,

    -- DRS Request
    action_token_hash VARCHAR(64) NOT NULL, -- SHA256 of DRS action token

    -- DRS Response
    device_id VARCHAR(100), -- DRS device identifier
    recommendation drs_recommendation NOT NULL,
    risk_score INT NOT NULL CHECK (risk_score BETWEEN 0 AND 100),

    -- Detailed Signals (JSONB)
    signals JSONB,
    -- Example: [{"type": "NEW_DEVICE", "severity": "MEDIUM", "description": "..."}]

    device_attributes JSONB,
    -- Example: {"browser": "Chrome 120", "os": "Windows 11", "is_mobile": false}

    -- Full Response (for audit)
    raw_response JSONB NOT NULL,

    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_drs_context ON drs_evaluations(context_id);
CREATE INDEX IF NOT EXISTS idx_drs_cupid_time ON drs_evaluations(cupid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drs_recommendation ON drs_evaluations(recommendation);
CREATE INDEX IF NOT EXISTS idx_drs_risk_score ON drs_evaluations(risk_score);
CREATE INDEX IF NOT EXISTS idx_drs_created ON drs_evaluations(created_at DESC);

-- Comments
COMMENT ON TABLE drs_evaluations IS 'Device Recognition Service risk assessments from Transmit DRS';
COMMENT ON COLUMN drs_evaluations.recommendation IS 'ALLOW, CHALLENGE (require MFA), DENY, or TRUST';
COMMENT ON COLUMN drs_evaluations.risk_score IS '0-100 risk score (0=low, 100=high)';
COMMENT ON COLUMN drs_evaluations.signals IS 'Array of risk indicators from DRS';

-- ============================================================================
-- TABLE 7: audit_logs (PARTITIONED BY MONTH)
-- ============================================================================
-- Purpose: Comprehensive event timeline for all system activity
-- Lifecycle: INSERT only (immutable), partitioned monthly for retention
-- Records: ~10M per day (all events)
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    -- Primary Key
    audit_id UUID NOT NULL DEFAULT gen_random_uuid(),

    -- Event Classification
    event_type VARCHAR(100) NOT NULL,
    event_category VARCHAR(50) NOT NULL, -- AUTH, MFA, ESIGN, DEVICE, TOKEN, SESSION, SECURITY
    severity event_severity NOT NULL DEFAULT 'INFO',

    -- Entity References (nullable - not all events have all refs)
    cupid VARCHAR(50),
    context_id UUID,
    transaction_id UUID,
    session_id UUID,

    -- Request Context
    correlation_id UUID,
    ip_address INET,
    user_agent TEXT,

    -- Event Details (flexible JSONB)
    event_data JSONB NOT NULL,

    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Create initial partitions (October 2025 - December 2025)
CREATE TABLE IF NOT EXISTS audit_logs_2025_10 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');

CREATE TABLE IF NOT EXISTS audit_logs_2025_11 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

CREATE TABLE IF NOT EXISTS audit_logs_2025_12 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

-- Indexes (applied to all partitions)
CREATE INDEX IF NOT EXISTS idx_audit_cupid_time ON audit_logs(cupid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event_category ON audit_logs(event_category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_context ON audit_logs(context_id);
CREATE INDEX IF NOT EXISTS idx_audit_transaction ON audit_logs(transaction_id);
CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_correlation ON audit_logs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_severity ON audit_logs(severity, created_at DESC)
    WHERE severity IN ('ERROR', 'CRITICAL');

-- Comments
COMMENT ON TABLE audit_logs IS 'Comprehensive event timeline, partitioned monthly. Immutable.';
COMMENT ON COLUMN audit_logs.event_type IS 'Specific event: LOGIN_SUCCESS, MFA_VERIFY_FAILED, etc.';
COMMENT ON COLUMN audit_logs.event_category IS 'Broad category for grouping';
COMMENT ON COLUMN audit_logs.event_data IS 'Flexible JSONB for event-specific details';

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: Active Sessions with Token Counts
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
    COUNT(t.token_id) FILTER (WHERE t.token_type = 'REFRESH' AND t.status = 'ACTIVE') as has_refresh_token
FROM sessions s
LEFT JOIN tokens t ON t.session_id = s.session_id
WHERE s.status = 'ACTIVE'
GROUP BY s.session_id;

COMMENT ON VIEW v_active_sessions IS 'Active sessions with token counts for monitoring';

-- View: Pending Transactions (Active User Flows)
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

-- View: High Risk Login Attempts
CREATE OR REPLACE VIEW v_high_risk_logins AS
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

COMMENT ON VIEW v_high_risk_logins IS 'Login attempts with DRS risk score >= 70 for fraud monitoring';

-- View: Token Rotation History
CREATE OR REPLACE VIEW v_token_rotation_chains AS
WITH RECURSIVE token_chain AS (
    -- Base case: tokens without parents (original tokens)
    SELECT
        token_id,
        session_id,
        token_type,
        status,
        parent_token_id,
        created_at,
        revoked_at,
        1 as generation
    FROM tokens
    WHERE parent_token_id IS NULL

    UNION ALL

    -- Recursive case: tokens with parents
    SELECT
        t.token_id,
        t.session_id,
        t.token_type,
        t.status,
        t.parent_token_id,
        t.created_at,
        t.revoked_at,
        tc.generation + 1
    FROM tokens t
    JOIN token_chain tc ON t.parent_token_id = tc.token_id
)
SELECT
    session_id,
    token_type,
    token_id,
    parent_token_id,
    status,
    generation,
    created_at,
    revoked_at,
    EXTRACT(EPOCH FROM (COALESCE(revoked_at, NOW()) - created_at)) as lifetime_seconds
FROM token_chain
ORDER BY session_id, token_type, generation;

COMMENT ON VIEW v_token_rotation_chains IS 'Token rotation history showing complete chain from original to current';

-- ============================================================================
-- UTILITY FUNCTIONS
-- ============================================================================

-- Function: Clean up expired transactions
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

COMMENT ON FUNCTION cleanup_expired_transactions IS 'Mark expired PENDING transactions. Run every 5 minutes via cron.';

-- Function: Clean up expired contexts
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

COMMENT ON FUNCTION cleanup_expired_contexts IS 'Mark expired incomplete contexts. Run every 15 minutes via cron.';

-- Function: Expire old sessions
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

COMMENT ON FUNCTION expire_old_sessions IS 'Mark expired sessions. Run every hour via cron.';

-- Function: Create next month partition for audit_logs
CREATE OR REPLACE FUNCTION create_next_audit_partition()
RETURNS TEXT AS $$
DECLARE
    next_month DATE;
    month_after DATE;
    partition_name TEXT;
    create_sql TEXT;
BEGIN
    -- Calculate next month
    next_month := DATE_TRUNC('month', NOW() + INTERVAL '1 month');
    month_after := next_month + INTERVAL '1 month';

    -- Generate partition name
    partition_name := 'audit_logs_' || TO_CHAR(next_month, 'YYYY_MM');

    -- Check if partition already exists
    IF EXISTS (
        SELECT 1 FROM pg_tables
        WHERE tablename = partition_name
    ) THEN
        RETURN 'Partition ' || partition_name || ' already exists';
    END IF;

    -- Create partition
    create_sql := FORMAT(
        'CREATE TABLE %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)',
        partition_name,
        next_month,
        month_after
    );

    EXECUTE create_sql;

    RETURN 'Created partition ' || partition_name;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_next_audit_partition IS 'Auto-create next month partition. Run at start of each month.';

-- ============================================================================
-- MAINTENANCE PROCEDURES
-- ============================================================================

-- Recommended cron schedule (use pg_cron extension or external scheduler)
/*
-- Every 5 minutes: Expire transactions
SELECT cleanup_expired_transactions();

-- Every 15 minutes: Expire contexts
SELECT cleanup_expired_contexts();

-- Every hour: Expire sessions
SELECT expire_old_sessions();

-- First day of each month: Create next partition
SELECT create_next_audit_partition();

-- Weekly: Vacuum and analyze
VACUUM ANALYZE auth_contexts;
VACUUM ANALYZE auth_transactions;
VACUUM ANALYZE sessions;
VACUUM ANALYZE tokens;
VACUUM ANALYZE audit_logs;
*/

-- ============================================================================
-- SAMPLE QUERIES (FOR TESTING)
-- ============================================================================

-- Query: Find active transaction for context
/*
SELECT * FROM auth_transactions
WHERE context_id = 'YOUR_CONTEXT_ID'
  AND transaction_status = 'PENDING'
  AND expires_at > NOW();
*/

-- Query: Get all sessions for user
/*
SELECT * FROM v_active_sessions
WHERE cupid = 'YOUR_CUPID'
ORDER BY created_at DESC;
*/

-- Query: Token rotation history for session
/*
SELECT * FROM v_token_rotation_chains
WHERE session_id = 'YOUR_SESSION_ID'
  AND token_type = 'REFRESH';
*/

-- Query: High risk logins today
/*
SELECT * FROM v_high_risk_logins
WHERE created_at > CURRENT_DATE;
*/

-- Query: Recent audit events for user
/*
SELECT event_type, severity, event_data, created_at
FROM audit_logs
WHERE cupid = 'YOUR_CUPID'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 100;
*/

-- ============================================================================
-- GRANTS (ADJUST FOR YOUR APPLICATION USER)
-- ============================================================================

-- Create application user (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'ciam_app') THEN
        CREATE USER ciam_app WITH PASSWORD 'CHANGE_ME_IN_PRODUCTION';
    END IF;
END $$;

-- Grant permissions
GRANT CONNECT ON DATABASE postgres TO ciam_app; -- Replace 'postgres' with your DB name
GRANT USAGE ON SCHEMA public TO ciam_app;

-- Table permissions
GRANT SELECT, INSERT, UPDATE ON auth_contexts TO ciam_app;
GRANT SELECT, INSERT, UPDATE ON auth_transactions TO ciam_app;
GRANT SELECT, INSERT, UPDATE ON sessions TO ciam_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON tokens TO ciam_app;
GRANT SELECT, INSERT, UPDATE ON trusted_devices TO ciam_app;
GRANT SELECT, INSERT ON drs_evaluations TO ciam_app;
GRANT SELECT, INSERT ON audit_logs TO ciam_app;
GRANT ALL ON ALL TABLES IN SCHEMA public TO ciam_app; -- If using partitions

-- Sequence permissions (for auto-increment if used)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ciam_app;

-- View permissions
GRANT SELECT ON v_active_sessions TO ciam_app;
GRANT SELECT ON v_pending_transactions TO ciam_app;
GRANT SELECT ON v_high_risk_logins TO ciam_app;
GRANT SELECT ON v_token_rotation_chains TO ciam_app;

-- Function permissions
GRANT EXECUTE ON FUNCTION cleanup_expired_transactions TO ciam_app;
GRANT EXECUTE ON FUNCTION cleanup_expired_contexts TO ciam_app;
GRANT EXECUTE ON FUNCTION expire_old_sessions TO ciam_app;

-- ============================================================================
-- SETUP COMPLETE
-- ============================================================================

-- Verify setup
SELECT
    'Tables' as object_type,
    COUNT(*) as count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'auth_contexts',
    'auth_transactions',
    'sessions',
    'tokens',
    'trusted_devices',
    'drs_evaluations',
    'audit_logs'
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
    'cleanup_expired_transactions',
    'cleanup_expired_contexts',
    'expire_old_sessions',
    'create_next_audit_partition'
);

-- ============================================================================
-- END OF SCRIPT
-- ============================================================================
