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
-- DOCUMENTED VALUE CONSTANTS (Replaced ENUMs with VARCHAR for flexibility)
-- ============================================================================
-- Rationale: Using VARCHAR instead of ENUMs allows API-layer validation changes
--            without requiring database migrations. DBAs and engineers can reference
--            this documentation for expected values.
--
-- IMPORTANT: These are NOT database constraints - validation happens at API layer.
--            This documentation ensures consistency across teams.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TRANSACTION_TYPE - Types of authentication transactions
-- ----------------------------------------------------------------------------
-- Expected Values:
--   'MFA_INITIATE'      - User selects MFA method (SMS/voice/push)
--   'MFA_VERIFY'        - User submits OTP code for verification
--   'MFA_PUSH_VERIFY'   - User approves push notification on mobile device
--   'ESIGN_PRESENT'     - Electronic signature document presented to user
--   'ESIGN_ACCEPT'      - User accepts electronic signature document
--   'DEVICE_BIND'       - Device binding offered/accepted/declined
--
-- Database Type: VARCHAR(50)
-- Usage: auth_transactions.transaction_type

-- ----------------------------------------------------------------------------
-- TRANSACTION_STATUS - Status of authentication transaction
-- ----------------------------------------------------------------------------
-- Expected Values:
--   'PENDING'   - Transaction created, awaiting user action
--   'CONSUMED'  - Transaction completed, moved to next step
--   'EXPIRED'   - Transaction expired (time limit exceeded)
--   'REJECTED'  - User declined or verification failed
--
-- Database Type: VARCHAR(20)
-- Usage: auth_transactions.transaction_status

-- ----------------------------------------------------------------------------
-- TOKEN_TYPE - Types of OAuth/OIDC tokens
-- ----------------------------------------------------------------------------
-- Expected Values:
--   'ACCESS'   - Short-lived access token (15 minutes)
--   'REFRESH'  - Long-lived refresh token (30 days)
--   'ID'       - OpenID Connect ID token (15 minutes)
--
-- Database Type: VARCHAR(20)
-- Usage: tokens.token_type

-- ----------------------------------------------------------------------------
-- TOKEN_STATUS - Lifecycle status of tokens
-- ----------------------------------------------------------------------------
-- Expected Values:
--   'ACTIVE'   - Currently valid token
--   'ROTATED'  - Token replaced by new token (refresh flow)
--   'REVOKED'  - Manually invalidated by user/admin
--   'EXPIRED'  - Time-based expiration
--
-- Database Type: VARCHAR(20)
-- Usage: tokens.status

-- ----------------------------------------------------------------------------
-- SESSION_STATUS - Status of user sessions
-- ----------------------------------------------------------------------------
-- Expected Values:
--   'ACTIVE'      - Session in use
--   'EXPIRED'     - Session expired (time-based)
--   'REVOKED'     - Manually revoked by admin/security event
--   'LOGGED_OUT'  - User-initiated logout
--
-- Database Type: VARCHAR(20)
-- Usage: sessions.status

-- ----------------------------------------------------------------------------
-- DEVICE_STATUS - Status of trusted devices
-- ----------------------------------------------------------------------------
-- Expected Values:
--   'ACTIVE'   - Device trusted and active
--   'REVOKED'  - Trust revoked by user/admin
--   'EXPIRED'  - Trust expired (time-based or policy)
--
-- Database Type: VARCHAR(20)
-- Usage: trusted_devices.status

-- ----------------------------------------------------------------------------
-- DRS_RECOMMENDATION - Transmit DRS risk assessment recommendations
-- ----------------------------------------------------------------------------
-- Expected Values:
--   'ALLOW'     - Low risk, allow login without additional verification
--   'CHALLENGE' - Medium risk, require MFA verification
--   'DENY'      - High risk, block login attempt
--   'TRUST'     - Known good device, skip MFA
--
-- Database Type: VARCHAR(20)
-- Usage: drs_evaluations.recommendation

-- ----------------------------------------------------------------------------
-- EVENT_SEVERITY - Audit log severity levels
-- ----------------------------------------------------------------------------
-- Expected Values:
--   'INFO'     - Normal operations, informational events
--   'WARN'     - Potential issues, warnings
--   'ERROR'    - Errors, failures requiring attention
--   'CRITICAL' - Security events, critical system issues
--
-- Database Type: VARCHAR(20)
-- Usage: audit_logs.severity

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

    -- Customer & User Identity
    guid VARCHAR(50) NOT NULL, -- Customer level identifier
    cupid VARCHAR(50) NOT NULL, -- User identifier (from LDAP)
    username VARCHAR(100) NOT NULL, -- Login username (before LDAP validation)

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
CREATE INDEX IF NOT EXISTS idx_auth_ctx_guid ON auth_contexts(guid);
CREATE INDEX IF NOT EXISTS idx_auth_ctx_cupid ON auth_contexts(cupid);
CREATE INDEX IF NOT EXISTS idx_auth_ctx_correlation ON auth_contexts(correlation_id);
CREATE INDEX IF NOT EXISTS idx_auth_ctx_expires ON auth_contexts(expires_at)
    WHERE auth_outcome IS NULL;
CREATE INDEX IF NOT EXISTS idx_auth_ctx_created ON auth_contexts(created_at DESC);

-- Comments
COMMENT ON TABLE auth_contexts IS 'Immutable container for authentication journey. One per login attempt.';
COMMENT ON COLUMN auth_contexts.context_id IS 'Unique identifier for authentication journey, bridges pre-auth to post-auth';
COMMENT ON COLUMN auth_contexts.guid IS 'Customer level identifier (multi-tenant scoping)';
COMMENT ON COLUMN auth_contexts.cupid IS 'User identifier from LDAP system';
COMMENT ON COLUMN auth_contexts.username IS 'Login username provided by user (before LDAP validation, useful for audit)';
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
    transaction_type VARCHAR(50) NOT NULL, -- See TRANSACTION_TYPE documentation above
    transaction_status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- See TRANSACTION_STATUS documentation above
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
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- See SESSION_STATUS documentation above

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
    token_type VARCHAR(20) NOT NULL, -- See TOKEN_TYPE documentation above
    token_value TEXT NOT NULL,
    token_value_hash VARCHAR(64) NOT NULL, -- SHA256 for fast lookup

    -- Token State
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- See TOKEN_STATUS documentation above

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

    -- Customer & User Identity
    guid VARCHAR(50) NOT NULL, -- Customer level identifier
    cupid VARCHAR(50) NOT NULL, -- User identifier

    -- Application Context
    app_id VARCHAR(50) NOT NULL, -- Device trust is per-app

    -- Device Identity
    device_fingerprint TEXT NOT NULL,
    device_fingerprint_hash VARCHAR(64) NOT NULL, -- SHA256 for fast lookup

    -- Device Metadata
    device_name VARCHAR(200), -- User-friendly name
    device_type VARCHAR(50), -- BROWSER, MOBILE_APP, TABLET, DESKTOP_APP

    -- Trust State
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- See DEVICE_STATUS documentation above

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
COMMENT ON TABLE trusted_devices IS 'Trusted device records for MFA skip on known devices';
COMMENT ON COLUMN trusted_devices.guid IS 'Customer level identifier (multi-tenant scoping)';
COMMENT ON COLUMN trusted_devices.app_id IS 'Device trust scoped to specific application';
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

    -- Customer & User Identity
    guid VARCHAR(50) NOT NULL, -- Customer level identifier
    cupid VARCHAR(50) NOT NULL, -- User identifier

    -- DRS Request
    action_token_hash VARCHAR(64) NOT NULL, -- SHA256 of DRS action token

    -- DRS Response
    device_id VARCHAR(100), -- DRS device identifier
    recommendation VARCHAR(20) NOT NULL, -- See DRS_RECOMMENDATION documentation above
    risk_score INT NOT NULL CHECK (risk_score BETWEEN 0 AND 100),

    -- Device Attributes (flattened from DRS response)
    browser VARCHAR(100),
    browser_version VARCHAR(50),
    operating_system VARCHAR(100),
    os_version VARCHAR(50),
    device_type VARCHAR(50), -- mobile, desktop, tablet
    is_mobile BOOLEAN,
    screen_resolution VARCHAR(20),
    user_agent TEXT,
    ip_location VARCHAR(100), -- City, State, Country from IP

    -- Risk Signals (flattened from DRS response)
    primary_signal_type VARCHAR(50), -- Most significant signal type
    signal_count INT, -- Total number of signals returned
    has_high_risk_signals BOOLEAN, -- Any signals with HIGH severity
    signal_types TEXT[], -- Array of all signal types for easy querying

    -- Full Response (for audit and future extensibility)
    raw_response JSONB NOT NULL,

    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_drs_context ON drs_evaluations(context_id);
CREATE INDEX IF NOT EXISTS idx_drs_guid ON drs_evaluations(guid);
CREATE INDEX IF NOT EXISTS idx_drs_cupid_time ON drs_evaluations(cupid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drs_recommendation ON drs_evaluations(recommendation);
CREATE INDEX IF NOT EXISTS idx_drs_risk_score ON drs_evaluations(risk_score);
CREATE INDEX IF NOT EXISTS idx_drs_created ON drs_evaluations(created_at DESC);

-- Indexes for flattened device attributes
CREATE INDEX IF NOT EXISTS idx_drs_browser ON drs_evaluations(browser);
CREATE INDEX IF NOT EXISTS idx_drs_os ON drs_evaluations(operating_system);
CREATE INDEX IF NOT EXISTS idx_drs_device_type ON drs_evaluations(device_type);
CREATE INDEX IF NOT EXISTS idx_drs_is_mobile ON drs_evaluations(is_mobile);

-- Indexes for risk signals (fraud detection queries)
CREATE INDEX IF NOT EXISTS idx_drs_primary_signal ON drs_evaluations(primary_signal_type);
CREATE INDEX IF NOT EXISTS idx_drs_high_risk ON drs_evaluations(has_high_risk_signals)
    WHERE has_high_risk_signals = TRUE;
CREATE INDEX IF NOT EXISTS idx_drs_signal_types ON drs_evaluations USING GIN(signal_types);

-- Comments
COMMENT ON TABLE drs_evaluations IS 'Device Recognition Service risk assessments from Transmit DRS with flattened attributes';
COMMENT ON COLUMN drs_evaluations.guid IS 'Customer level identifier (multi-tenant scoping)';
COMMENT ON COLUMN drs_evaluations.recommendation IS 'ALLOW, CHALLENGE (require MFA), DENY, or TRUST';
COMMENT ON COLUMN drs_evaluations.risk_score IS '0-100 risk score (0=low, 100=high)';
COMMENT ON COLUMN drs_evaluations.browser IS 'Browser name extracted from DRS response';
COMMENT ON COLUMN drs_evaluations.operating_system IS 'Operating system name extracted from DRS response';
COMMENT ON COLUMN drs_evaluations.device_type IS 'Device category: mobile, desktop, tablet';
COMMENT ON COLUMN drs_evaluations.primary_signal_type IS 'Most significant risk signal type (e.g., NEW_DEVICE, LOCATION_CHANGE)';
COMMENT ON COLUMN drs_evaluations.signal_types IS 'Array of all signal types for easy querying (e.g., {NEW_DEVICE,VPN_DETECTED})';
COMMENT ON COLUMN drs_evaluations.raw_response IS 'Complete DRS response for audit and future field extraction';

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
    severity VARCHAR(20) NOT NULL DEFAULT 'INFO', -- See EVENT_SEVERITY documentation above

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
-- SCHEMA REFINEMENTS (v1.1 - Performance & Data Integrity)
-- ============================================================================
-- Date: October 2025
-- Purpose: Additional indexes and constraints for production optimization

-- ----------------------------------------------------------------------------
-- REFINEMENT 1: Additional Indexes for Query Optimization
-- ----------------------------------------------------------------------------

-- DRS action token tracking (prevent duplicate evaluations)
CREATE INDEX IF NOT EXISTS idx_drs_action_token
    ON drs_evaluations(action_token_hash);

COMMENT ON INDEX idx_drs_action_token IS 'Fast lookup for DRS action token deduplication';

-- Failed login attempts view (fraud detection)
CREATE OR REPLACE VIEW v_failed_login_attempts AS
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

COMMENT ON VIEW v_failed_login_attempts IS 'Failed login attempts in last hour (3+ attempts) for fraud detection and rate limiting';

-- ----------------------------------------------------------------------------
-- REFINEMENT 2: Timestamp Validation Constraints
-- ----------------------------------------------------------------------------

-- Ensure token expiry is always in the future relative to creation
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'check_token_expiry_future'
    ) THEN
        ALTER TABLE tokens
        ADD CONSTRAINT check_token_expiry_future
        CHECK (expires_at > created_at);
    END IF;
END $$;

-- Ensure session expiry is always in the future relative to creation
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'check_session_expiry_future'
    ) THEN
        ALTER TABLE sessions
        ADD CONSTRAINT check_session_expiry_future
        CHECK (expires_at > created_at);
    END IF;
END $$;

-- Ensure auth_context expiry is always in the future relative to creation
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'check_context_expiry_future'
    ) THEN
        ALTER TABLE auth_contexts
        ADD CONSTRAINT check_context_expiry_future
        CHECK (expires_at > created_at);
    END IF;
END $$;

-- Ensure auth_transaction expiry is always in the future relative to creation
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'check_transaction_expiry_future'
    ) THEN
        ALTER TABLE auth_transactions
        ADD CONSTRAINT check_transaction_expiry_future
        CHECK (expires_at > created_at);
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- REFINEMENT 3: Application Version Format Validation
-- ----------------------------------------------------------------------------

-- Validate app_version follows semantic versioning pattern (X.Y.Z)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'check_app_version_format'
    ) THEN
        ALTER TABLE auth_contexts
        ADD CONSTRAINT check_app_version_format
        CHECK (app_version ~ '^\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?$');
    END IF;
END $$;

COMMENT ON CONSTRAINT check_app_version_format ON auth_contexts IS 'Ensures app_version follows semver format (e.g., 1.2.3 or 1.2.3-beta)';

-- ----------------------------------------------------------------------------
-- REFINEMENT 4: Foreign Key Index Verification Query
-- ----------------------------------------------------------------------------

-- Query to detect missing indexes on foreign key columns
-- Run this periodically to ensure all FKs have supporting indexes for join performance
/*
SELECT
    tc.table_name,
    kcu.column_name AS fk_column,
    ccu.table_name AS referenced_table,
    ccu.column_name AS referenced_column,
    CASE
        WHEN i.indexname IS NULL THEN '❌ MISSING INDEX'
        ELSE '✅ INDEX EXISTS: ' || i.indexname
    END AS index_status
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
LEFT JOIN pg_indexes i
    ON i.tablename = tc.table_name
    AND i.indexdef LIKE '%' || kcu.column_name || '%'
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN ('auth_contexts', 'auth_transactions', 'sessions', 'tokens',
                        'trusted_devices', 'drs_evaluations')
ORDER BY tc.table_name, kcu.column_name;
*/

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
