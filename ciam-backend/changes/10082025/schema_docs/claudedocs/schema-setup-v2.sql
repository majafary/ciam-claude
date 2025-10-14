-- ============================================================================
-- CIAM Database Schema Setup Script
-- ============================================================================
-- Database: PostgreSQL 14+
-- Purpose: Customer Identity and Access Management (CIAM) Backend
-- Version: 2.0
-- Date: October 2025
--
-- IMPORTANT: This script is idempotent - safe to run multiple times
--
-- NEW IN V2:
--   - Multi-context session support (initial + step-up authentication)
--   - Enhanced fraud detection indexes (IP velocity, device tracking, JSONB)
--   - Comprehensive analytics views for session lifecycle tracking
-- ============================================================================

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

-- UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
-- AUTH_TYPE - Authentication context type
-- ----------------------------------------------------------------------------
-- Expected Values:
--   'INITIAL'  - First authentication creating the session (pre-auth)
--   'STEP_UP'  - Re-authentication within existing session (post-auth)
--
-- Database Type: VARCHAR(20)
-- Usage: auth_contexts.auth_type, audit_logs.auth_type

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
--
-- V2 ENHANCEMENTS:
--   - session_id: Links step-up contexts back to parent session
--   - auth_type: Distinguishes INITIAL (pre-auth) vs STEP_UP (post-auth)
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

    -- Multi-Context Session Support (V2)
    session_id UUID REFERENCES sessions(session_id),
    auth_type VARCHAR(20) NOT NULL DEFAULT 'INITIAL' CHECK (auth_type IN ('INITIAL', 'STEP_UP')),

    -- Journey Metadata
    requires_additional_steps BOOLEAN DEFAULT FALSE,

    -- Final Outcome (updated once at completion)
    auth_outcome VARCHAR(50),
    completed_at TIMESTAMPTZ,

    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),

    -- Constraints
    CONSTRAINT check_outcome_completed CHECK (
        (auth_outcome IS NULL AND completed_at IS NULL) OR
        (auth_outcome IS NOT NULL AND completed_at IS NOT NULL)
    ),
    CONSTRAINT check_context_expiry_future CHECK (expires_at > created_at)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_auth_ctx_guid ON auth_contexts(guid);
CREATE INDEX IF NOT EXISTS idx_auth_ctx_cupid ON auth_contexts(cupid);
CREATE INDEX IF NOT EXISTS idx_auth_ctx_correlation ON auth_contexts(correlation_id);
CREATE INDEX IF NOT EXISTS idx_auth_ctx_expires ON auth_contexts(expires_at)
    WHERE auth_outcome IS NULL;
CREATE INDEX IF NOT EXISTS idx_auth_ctx_created ON auth_contexts(created_at DESC);

-- V2 Indexes: Multi-context session support
CREATE INDEX IF NOT EXISTS idx_auth_ctx_session_time ON auth_contexts(session_id, created_at DESC)
    WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auth_ctx_type ON auth_contexts(auth_type);

-- V2 Indexes: Fraud detection velocity queries
CREATE INDEX IF NOT EXISTS idx_auth_ctx_ip_time ON auth_contexts(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_ctx_device_time ON auth_contexts(device_fingerprint, created_at DESC)
    WHERE device_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auth_ctx_outcome_time ON auth_contexts(auth_outcome, created_at DESC)
    WHERE auth_outcome IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auth_ctx_cupid_outcome_time ON auth_contexts(cupid, auth_outcome, created_at DESC);

-- Comments
COMMENT ON TABLE auth_contexts IS 'Immutable container for authentication journey. One per login attempt (initial or step-up).';
COMMENT ON COLUMN auth_contexts.context_id IS 'Unique identifier for authentication journey, bridges pre-auth to post-auth';
COMMENT ON COLUMN auth_contexts.guid IS 'Customer level identifier (multi-tenant scoping)';
COMMENT ON COLUMN auth_contexts.cupid IS 'User identifier from LDAP system';
COMMENT ON COLUMN auth_contexts.username IS 'Login username provided by user (before LDAP validation, useful for audit)';
COMMENT ON COLUMN auth_contexts.session_id IS 'For step-up auth: references existing session. For initial auth: NULL (no session yet). Enables querying all auth contexts for session lifecycle.';
COMMENT ON COLUMN auth_contexts.auth_type IS 'INITIAL: First authentication creating session. STEP_UP: Re-authentication for high-risk actions within existing session.';
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
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',

    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),

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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_cupid ON sessions(cupid)
    WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_sessions_context ON sessions(context_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status_expires ON sessions(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at DESC);

-- Comments
COMMENT ON TABLE sessions IS 'Active user sessions. One CUPID can have multiple sessions (multi-device).';
COMMENT ON COLUMN sessions.context_id IS 'Links back to initial authentication journey that created this session';
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
    token_type VARCHAR(20) NOT NULL,
    token_value TEXT NOT NULL,
    token_value_hash VARCHAR(64) NOT NULL,

    -- Token State
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',

    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT check_token_revoked CHECK (
        (status != 'REVOKED' AND revoked_at IS NULL) OR
        (status = 'REVOKED' AND revoked_at IS NOT NULL)
    ),
    CONSTRAINT check_token_expiry_future CHECK (expires_at > created_at)
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
--
-- V2 ENHANCEMENTS:
--   - session_id: Links DRS evaluations to session for lifecycle tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS drs_evaluations (
    -- Primary Key
    evaluation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign Keys
    context_id UUID NOT NULL REFERENCES auth_contexts(context_id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(session_id),

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
CREATE INDEX IF NOT EXISTS idx_drs_action_token ON drs_evaluations(action_token_hash);

-- V2 Index: Session lifecycle tracking
CREATE INDEX IF NOT EXISTS idx_drs_session_time ON drs_evaluations(session_id, created_at DESC)
    WHERE session_id IS NOT NULL;

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
COMMENT ON COLUMN drs_evaluations.session_id IS 'For step-up auth: references session requiring risk evaluation. For initial auth: NULL. Allows querying all DRS evaluations across session lifecycle.';
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
--
-- V2 ENHANCEMENTS:
--   - auth_type: Distinguishes INITIAL vs STEP_UP auth events
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    -- Primary Key
    audit_id UUID NOT NULL DEFAULT gen_random_uuid(),

    -- Event Classification
    event_type VARCHAR(100) NOT NULL,
    event_category VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'INFO',

    -- Entity References (nullable - not all events have all refs)
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

-- V2 Index: Session lifecycle audit queries
CREATE INDEX IF NOT EXISTS idx_audit_session_time ON audit_logs(session_id, created_at DESC)
    WHERE session_id IS NOT NULL;

-- V2 Indexes: JSONB expression indexes for fraud detection
CREATE INDEX IF NOT EXISTS idx_audit_error_code
    ON audit_logs ((event_data->>'error_code'))
    WHERE event_category = 'AUTH' AND event_data->>'error_code' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_mfa_attempts
    ON audit_logs (((event_data->>'attempt_number')::int))
    WHERE event_type LIKE 'MFA_%' AND event_data->>'attempt_number' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_failure_reason
    ON audit_logs ((event_data->>'failure_reason'))
    WHERE severity IN ('ERROR', 'CRITICAL') AND event_data->>'failure_reason' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_event_data_gin
    ON audit_logs USING GIN (event_data jsonb_path_ops);

-- Comments
COMMENT ON TABLE audit_logs IS 'Comprehensive event timeline, partitioned monthly. Immutable.';
COMMENT ON COLUMN audit_logs.event_type IS 'Specific event: LOGIN_SUCCESS, MFA_VERIFY_FAILED, STEP_UP_INITIATED, etc.';
COMMENT ON COLUMN audit_logs.event_category IS 'Broad category for grouping';
COMMENT ON COLUMN audit_logs.auth_type IS 'INITIAL or STEP_UP for auth events. NULL for non-auth events. Enables step-up pattern analysis.';
COMMENT ON COLUMN audit_logs.event_data IS 'Flexible JSONB for event-specific details';

-- ============================================================================
-- VIEWS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- VIEW 1: v_active_sessions (Original)
-- ----------------------------------------------------------------------------

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

-- ----------------------------------------------------------------------------
-- VIEW 2: v_pending_transactions (Original)
-- ----------------------------------------------------------------------------

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

-- ----------------------------------------------------------------------------
-- VIEW 3: v_token_rotation_chains (Original)
-- ----------------------------------------------------------------------------

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

-- ----------------------------------------------------------------------------
-- VIEW 4: v_failed_login_attempts (Original)
-- ----------------------------------------------------------------------------

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
-- VIEW 5: v_login_activity (V2 Enhanced)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_login_activity AS
SELECT
    -- Context & Session Identifiers
    ac.context_id,
    ac.auth_type,
    COALESCE(ac.session_id, s.session_id) as session_id,
    ac.correlation_id,

    -- Identity
    ac.guid,
    ac.cupid,
    ac.username,

    -- Network & Device
    ac.ip_address,
    ac.device_fingerprint,
    ac.app_id,
    ac.app_version,

    -- DRS Risk Assessment
    drs.evaluation_id,
    drs.device_id as drs_device_id,
    drs.risk_score,
    drs.recommendation as drs_recommendation,
    drs.has_high_risk_signals,
    drs.primary_signal_type,
    drs.signal_types,
    drs.signal_count,

    -- Device Attributes (from DRS)
    drs.browser,
    drs.browser_version,
    drs.operating_system,
    drs.os_version,
    drs.device_type,
    drs.is_mobile,
    drs.ip_location,

    -- Authentication Outcome
    ac.auth_outcome,
    ac.requires_additional_steps,

    -- Timing
    ac.created_at as auth_started_at,
    ac.completed_at as auth_completed_at,
    EXTRACT(EPOCH FROM (ac.completed_at - ac.created_at)) as auth_duration_seconds,

    -- Session Context (for initial auth only)
    s.session_id as initial_session_id,
    s.created_at as session_created_at,
    s.last_activity_at as session_last_activity_at,
    s.status as session_status

FROM auth_contexts ac
LEFT JOIN drs_evaluations drs ON drs.context_id = ac.context_id
LEFT JOIN sessions s ON s.context_id = ac.context_id
WHERE ac.completed_at IS NOT NULL
ORDER BY ac.created_at DESC;

COMMENT ON VIEW v_login_activity IS
'Comprehensive authentication activity including INITIAL and STEP_UP authentications.
Joins auth_contexts + drs_evaluations + sessions for complete risk and outcome data.
Use auth_type to distinguish initial from step-up re-authentication.';

-- ----------------------------------------------------------------------------
-- VIEW 6: v_session_auth_timeline (V2 New)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_session_auth_timeline AS
WITH session_contexts AS (
    SELECT
        s.session_id,
        s.cupid,
        s.context_id as initial_context_id,
        ac.created_at as session_start_time
    FROM sessions s
    JOIN auth_contexts ac ON ac.context_id = s.context_id
),
all_contexts AS (
    SELECT
        sc.session_id,
        sc.cupid,
        ac.context_id,
        ac.auth_type,
        ac.auth_outcome,
        ac.created_at as auth_time,
        ac.completed_at,
        drs.risk_score,
        drs.recommendation,
        drs.has_high_risk_signals,
        ROW_NUMBER() OVER (PARTITION BY sc.session_id ORDER BY ac.created_at) as auth_sequence
    FROM session_contexts sc
    JOIN auth_contexts ac ON (
        ac.context_id = sc.initial_context_id OR
        ac.session_id = sc.session_id
    )
    LEFT JOIN drs_evaluations drs ON drs.context_id = ac.context_id
)
SELECT
    session_id,
    cupid,
    context_id,
    auth_type,
    auth_outcome,
    auth_time,
    completed_at,
    risk_score,
    recommendation,
    has_high_risk_signals,
    auth_sequence,
    COUNT(*) OVER (PARTITION BY session_id) as total_auths_in_session,
    COUNT(*) FILTER (WHERE auth_type = 'STEP_UP') OVER (PARTITION BY session_id) as step_up_count
FROM all_contexts
ORDER BY session_id, auth_sequence;

COMMENT ON VIEW v_session_auth_timeline IS
'Complete authentication timeline for each session including initial and all step-up authentications.
Shows authentication sequence, risk scores, and outcomes across session lifecycle.';

-- ----------------------------------------------------------------------------
-- VIEW 7: v_step_up_frequency (V2 New)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_step_up_frequency AS
SELECT
    s.cupid,
    COUNT(DISTINCT s.session_id) as total_sessions,
    COUNT(DISTINCT ac.context_id) FILTER (WHERE ac.auth_type = 'INITIAL') as initial_auths,
    COUNT(DISTINCT ac.context_id) FILTER (WHERE ac.auth_type = 'STEP_UP') as step_up_auths,
    COUNT(DISTINCT CASE
        WHEN ac.auth_type = 'STEP_UP' THEN s.session_id
    END) as sessions_with_step_up,
    ROUND(
        COUNT(DISTINCT CASE WHEN ac.auth_type = 'STEP_UP' THEN s.session_id END)::numeric /
        NULLIF(COUNT(DISTINCT s.session_id), 0) * 100,
        2
    ) as step_up_session_percentage,
    ROUND(
        AVG(CASE WHEN ac.auth_type = 'STEP_UP' THEN 1.0 ELSE 0 END),
        3
    ) as avg_step_ups_per_auth
FROM sessions s
LEFT JOIN auth_contexts ac ON (
    ac.context_id = s.context_id OR
    ac.session_id = s.session_id
)
WHERE s.created_at > NOW() - INTERVAL '30 days'
GROUP BY s.cupid
HAVING COUNT(DISTINCT ac.context_id) FILTER (WHERE ac.auth_type = 'STEP_UP') > 0
ORDER BY step_up_auths DESC;

COMMENT ON VIEW v_step_up_frequency IS
'Step-up authentication frequency analysis by user over last 30 days.
Identifies users requiring frequent re-authentication for policy optimization.';

-- ----------------------------------------------------------------------------
-- VIEW 8: v_high_risk_logins (V2 Enhanced)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_high_risk_logins AS
SELECT
    d.evaluation_id,
    d.cupid,
    d.context_id,
    ac.auth_type,
    ac.session_id,
    d.recommendation,
    d.risk_score,
    d.has_high_risk_signals,
    d.primary_signal_type,
    d.signal_types,
    d.browser,
    d.operating_system,
    d.ip_location,
    c.ip_address,
    c.device_fingerprint,
    c.auth_outcome,
    c.created_at
FROM drs_evaluations d
JOIN auth_contexts c ON c.context_id = d.context_id
LEFT JOIN auth_contexts ac ON ac.context_id = d.context_id
WHERE d.risk_score >= 70
ORDER BY d.created_at DESC;

COMMENT ON VIEW v_high_risk_logins IS
'High risk login attempts (DRS risk score >= 70) including INITIAL and STEP_UP authentications.
Enhanced to show auth_type and session_id for complete context.';

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
    next_month := DATE_TRUNC('month', NOW() + INTERVAL '1 month');
    month_after := next_month + INTERVAL '1 month';
    partition_name := 'audit_logs_' || TO_CHAR(next_month, 'YYYY_MM');

    IF EXISTS (
        SELECT 1 FROM pg_tables
        WHERE tablename = partition_name
    ) THEN
        RETURN 'Partition ' || partition_name || ' already exists';
    END IF;

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
