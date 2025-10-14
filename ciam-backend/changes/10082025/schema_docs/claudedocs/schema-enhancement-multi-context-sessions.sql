-- ============================================================================
-- CIAM Database Schema Enhancement: Multi-Context Session Support
-- ============================================================================
-- Database: PostgreSQL 14+
-- Purpose: Enable step-up authentication with multiple auth contexts per session
-- Version: 1.1
-- Date: October 2025
--
-- IMPORTANT: This script enhances the existing schema to support:
--   - Initial authentication (pre-auth): No session exists yet
--   - Step-up authentication (post-auth): Re-authentication within existing session
--   - Complete session lifecycle tracking across all auth contexts
--   - Fraud detection and analytics across entire session duration
--
-- SAFE TO RUN: All changes are additive (ADD COLUMN with nullable defaults)
-- ============================================================================

-- ============================================================================
-- ENHANCEMENT 1: Add Session Linkage to auth_contexts
-- ============================================================================
-- Purpose: Link step-up auth contexts back to their parent session
-- Use Cases:
--   - Initial auth: session_id = NULL (no session exists yet)
--   - Step-up auth: session_id = existing session requiring re-authentication
-- ============================================================================

-- Add session_id column (nullable, references sessions table)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'auth_contexts'
          AND column_name = 'session_id'
    ) THEN
        ALTER TABLE auth_contexts
        ADD COLUMN session_id UUID REFERENCES sessions(session_id);

        RAISE NOTICE 'Added session_id column to auth_contexts';
    END IF;
END $$;

-- Add auth_type column to distinguish initial vs step-up authentication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'auth_contexts'
          AND column_name = 'auth_type'
    ) THEN
        ALTER TABLE auth_contexts
        ADD COLUMN auth_type VARCHAR(20) DEFAULT 'INITIAL' NOT NULL
        CHECK (auth_type IN ('INITIAL', 'STEP_UP'));

        RAISE NOTICE 'Added auth_type column to auth_contexts';
    END IF;
END $$;

-- Add index for querying auth contexts by session
CREATE INDEX IF NOT EXISTS idx_auth_ctx_session_time
    ON auth_contexts(session_id, created_at DESC)
    WHERE session_id IS NOT NULL;

-- Add index for auth type filtering
CREATE INDEX IF NOT EXISTS idx_auth_ctx_type
    ON auth_contexts(auth_type);

-- Comments
COMMENT ON COLUMN auth_contexts.session_id IS
'For step-up authentication: references the existing session requiring re-authentication.
For initial authentication: NULL (no session exists yet).
Enables querying all authentication contexts (initial + step-ups) for a session lifecycle.';

COMMENT ON COLUMN auth_contexts.auth_type IS
'Authentication type:
  INITIAL: First authentication that creates the session
  STEP_UP: Additional authentication for high-risk actions within existing session';

-- ============================================================================
-- ENHANCEMENT 2: Add Session Linkage to drs_evaluations
-- ============================================================================
-- Purpose: Link DRS risk evaluations to sessions for lifecycle analysis
-- Use Cases:
--   - Query all risk assessments for a session (initial + step-ups)
--   - Fraud pattern detection across session duration
--   - Risk score trends within session lifecycle
-- ============================================================================

-- Add session_id column (nullable, references sessions table)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'drs_evaluations'
          AND column_name = 'session_id'
    ) THEN
        ALTER TABLE drs_evaluations
        ADD COLUMN session_id UUID REFERENCES sessions(session_id);

        RAISE NOTICE 'Added session_id column to drs_evaluations';
    END IF;
END $$;

-- Add index for querying DRS evaluations by session
CREATE INDEX IF NOT EXISTS idx_drs_session_time
    ON drs_evaluations(session_id, created_at DESC)
    WHERE session_id IS NOT NULL;

-- Comments
COMMENT ON COLUMN drs_evaluations.session_id IS
'For step-up authentication: references the session requiring risk evaluation.
For initial authentication: NULL (session does not exist yet).
Populated after auth_contexts.session_id is set for step-up scenarios.
Allows querying all DRS evaluations across a session lifecycle.';

-- ============================================================================
-- ENHANCEMENT 3: Add Auth Type Context to audit_logs
-- ============================================================================
-- Purpose: Distinguish initial vs step-up auth events in audit trail
-- Use Cases:
--   - Filter audit logs by authentication type
--   - Analyze step-up authentication patterns
--   - Compliance reporting on re-authentication events
-- ============================================================================

-- Add auth_type column for clarity in audit trail
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'audit_logs'
          AND column_name = 'auth_type'
    ) THEN
        ALTER TABLE audit_logs
        ADD COLUMN auth_type VARCHAR(20);

        RAISE NOTICE 'Added auth_type column to audit_logs';
    END IF;
END $$;

-- Add index for session-based audit queries
CREATE INDEX IF NOT EXISTS idx_audit_session_time
    ON audit_logs(session_id, created_at DESC)
    WHERE session_id IS NOT NULL;

-- Comments
COMMENT ON COLUMN audit_logs.auth_type IS
'Authentication type for auth-related events: INITIAL or STEP_UP.
NULL for non-authentication events.
Enables filtering and analysis of step-up authentication patterns.';

-- ============================================================================
-- ENHANCEMENT 4: Add Expression Indexes for JSONB Query Optimization
-- ============================================================================
-- Purpose: Optimize common fraud detection queries on audit_logs.event_data
-- Use Cases:
--   - Fast queries on error_code, mfa_method, failure_reason
--   - Fraud pattern detection with specific event attributes
-- ============================================================================

-- Index on error_code (frequently queried for failed login analysis)
CREATE INDEX IF NOT EXISTS idx_audit_error_code
    ON audit_logs ((event_data->>'error_code'))
    WHERE event_category = 'AUTH'
      AND event_data->>'error_code' IS NOT NULL;

COMMENT ON INDEX idx_audit_error_code IS
'Expression index for fast queries on audit_logs.event_data->>error_code.
Optimizes failed login and fraud detection queries.';

-- Index on MFA attempt number
CREATE INDEX IF NOT EXISTS idx_audit_mfa_attempts
    ON audit_logs (((event_data->>'attempt_number')::int))
    WHERE event_type LIKE 'MFA_%'
      AND event_data->>'attempt_number' IS NOT NULL;

COMMENT ON INDEX idx_audit_mfa_attempts IS
'Expression index for MFA attempt tracking and brute force detection.';

-- Index on failure reasons
CREATE INDEX IF NOT EXISTS idx_audit_failure_reason
    ON audit_logs ((event_data->>'failure_reason'))
    WHERE severity IN ('ERROR', 'CRITICAL')
      AND event_data->>'failure_reason' IS NOT NULL;

COMMENT ON INDEX idx_audit_failure_reason IS
'Expression index for analyzing failure patterns across error types.';

-- GIN index for pattern matching queries
CREATE INDEX IF NOT EXISTS idx_audit_event_data_gin
    ON audit_logs USING GIN (event_data jsonb_path_ops);

COMMENT ON INDEX idx_audit_event_data_gin IS
'GIN index enables fast containment queries like:
event_data @> ''{"mfa_method": "sms", "failure_reason": "TIMEOUT"}''.';

-- ============================================================================
-- ENHANCEMENT 5: Add Missing Indexes to auth_contexts
-- ============================================================================
-- Purpose: Optimize fraud detection velocity queries
-- Use Cases:
--   - IP-based velocity checks (logins from same IP)
--   - Device fingerprint tracking
--   - Outcome-based filtering
-- ============================================================================

-- Index on IP address for velocity queries
CREATE INDEX IF NOT EXISTS idx_auth_ctx_ip_time
    ON auth_contexts(ip_address, created_at DESC);

COMMENT ON INDEX idx_auth_ctx_ip_time IS
'Optimizes velocity queries: "How many login attempts from this IP in last N minutes?"';

-- Index on device fingerprint for device tracking
CREATE INDEX IF NOT EXISTS idx_auth_ctx_device_time
    ON auth_contexts(device_fingerprint, created_at DESC)
    WHERE device_fingerprint IS NOT NULL;

COMMENT ON INDEX idx_auth_ctx_device_time IS
'Optimizes device tracking queries: "Has this device been seen before?"';

-- Index on outcome for fraud pattern filtering
CREATE INDEX IF NOT EXISTS idx_auth_ctx_outcome_time
    ON auth_contexts(auth_outcome, created_at DESC)
    WHERE auth_outcome IS NOT NULL;

COMMENT ON INDEX idx_auth_ctx_outcome_time IS
'Optimizes outcome-based queries: "All failed logins in last hour"';

-- Composite index for user velocity queries
CREATE INDEX IF NOT EXISTS idx_auth_ctx_cupid_outcome_time
    ON auth_contexts(cupid, auth_outcome, created_at DESC);

COMMENT ON INDEX idx_auth_ctx_cupid_outcome_time IS
'Optimizes user-specific velocity queries: "Failed login attempts per user"';

-- ============================================================================
-- VIEWS: Enhanced Login Activity and Analytics
-- ============================================================================

-- ----------------------------------------------------------------------------
-- VIEW 1: v_login_activity (Enhanced)
-- ----------------------------------------------------------------------------
-- Purpose: Comprehensive view of all authentication events with DRS risk data
-- Includes: Initial authentication + Step-up authentication
-- Use Cases: Fraud detection, risk analytics, compliance reporting
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
LEFT JOIN sessions s ON s.context_id = ac.context_id  -- Only for initial auth
WHERE ac.completed_at IS NOT NULL  -- Only completed authentications
ORDER BY ac.created_at DESC;

COMMENT ON VIEW v_login_activity IS
'Comprehensive authentication activity view including both INITIAL and STEP_UP authentications.
Joins auth_contexts + drs_evaluations + sessions for complete risk and outcome data.
Use auth_type to distinguish initial authentication from step-up re-authentication.
For step-ups: session_id links back to the existing session requiring re-authentication.';

-- ----------------------------------------------------------------------------
-- VIEW 2: v_session_auth_timeline
-- ----------------------------------------------------------------------------
-- Purpose: Complete authentication timeline for each session
-- Shows: Initial auth + all step-up authentications
-- Use Cases: Session lifecycle analysis, step-up frequency tracking
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_session_auth_timeline AS
WITH session_contexts AS (
    -- Get the initial auth context for each session
    SELECT
        s.session_id,
        s.cupid,
        s.context_id as initial_context_id,
        ac.created_at as session_start_time
    FROM sessions s
    JOIN auth_contexts ac ON ac.context_id = s.context_id
),
all_contexts AS (
    -- Union initial context and all step-up contexts
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
        ac.context_id = sc.initial_context_id OR  -- Initial auth
        ac.session_id = sc.session_id              -- Step-up auths
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
Shows authentication sequence, risk scores, and outcomes across session lifecycle.
Use step_up_count to identify sessions with multiple authentication events.';

-- ----------------------------------------------------------------------------
-- VIEW 3: v_step_up_frequency
-- ----------------------------------------------------------------------------
-- Purpose: Step-up authentication frequency analysis by user
-- Use Cases: Identify users with frequent step-ups, policy tuning
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
    ac.context_id = s.context_id OR  -- Initial auth
    ac.session_id = s.session_id     -- Step-up auths
)
WHERE s.created_at > NOW() - INTERVAL '30 days'
GROUP BY s.cupid
HAVING COUNT(DISTINCT ac.context_id) FILTER (WHERE ac.auth_type = 'STEP_UP') > 0
ORDER BY step_up_auths DESC;

COMMENT ON VIEW v_step_up_frequency IS
'Step-up authentication frequency analysis by user over last 30 days.
Identifies users requiring frequent re-authentication for policy optimization.
Only includes users with at least one step-up authentication.';

-- ----------------------------------------------------------------------------
-- VIEW 4: v_high_risk_logins (Enhanced)
-- ----------------------------------------------------------------------------
-- Purpose: High risk login attempts (enhanced to include auth_type)
-- Use Cases: Fraud monitoring, security alerts
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
'High risk login attempts (DRS risk score >= 70) including both INITIAL and STEP_UP authentications.
Enhanced to show auth_type and session_id for complete context.
Use for fraud monitoring and security incident investigation.';

-- ============================================================================
-- EXAMPLE QUERIES: Multi-Context Session Support
-- ============================================================================

-- Example 1: Get all authentication contexts for a specific session
/*
SELECT
    context_id,
    auth_type,
    auth_outcome,
    risk_score,
    recommendation,
    auth_started_at,
    auth_completed_at
FROM v_login_activity
WHERE session_id = 'YOUR_SESSION_ID'
ORDER BY auth_started_at;

Expected Result:
context_id              | auth_type | auth_outcome | risk_score | auth_started_at
------------------------|-----------|--------------|------------|------------------
ctx-abc-123             | INITIAL   | SUCCESS      | 25         | 2025-10-14 10:00:00
ctx-def-456             | STEP_UP   | SUCCESS      | 15         | 2025-10-14 10:15:30
ctx-ghi-789             | STEP_UP   | SUCCESS      | 20         | 2025-10-14 10:47:12
*/

-- Example 2: Find all DRS evaluations for a session (initial + step-ups)
/*
SELECT
    drs.evaluation_id,
    drs.context_id,
    ac.auth_type,
    drs.risk_score,
    drs.recommendation,
    drs.has_high_risk_signals,
    drs.primary_signal_type,
    drs.created_at
FROM drs_evaluations drs
JOIN auth_contexts ac ON ac.context_id = drs.context_id
WHERE drs.session_id = 'YOUR_SESSION_ID'
   OR ac.context_id = (SELECT context_id FROM sessions WHERE session_id = 'YOUR_SESSION_ID')
ORDER BY drs.created_at;
*/

-- Example 3: Complete audit trail for a session (all events)
/*
SELECT
    a.audit_id,
    a.event_type,
    a.event_category,
    a.auth_type,
    a.context_id,
    a.severity,
    a.event_data->>'error_code' as error_code,
    a.created_at
FROM audit_logs a
WHERE a.session_id = 'YOUR_SESSION_ID'
   OR a.context_id IN (
       SELECT context_id FROM sessions WHERE session_id = 'YOUR_SESSION_ID'
       UNION
       SELECT context_id FROM auth_contexts WHERE session_id = 'YOUR_SESSION_ID'
   )
ORDER BY a.created_at;
*/

-- Example 4: Users with most frequent step-up authentications
/*
SELECT * FROM v_step_up_frequency
ORDER BY step_up_auths DESC
LIMIT 20;
*/

-- Example 5: Sessions with step-up authentication timeline
/*
SELECT * FROM v_session_auth_timeline
WHERE session_id IN (
    SELECT session_id
    FROM v_session_auth_timeline
    WHERE step_up_count > 0
    LIMIT 10
);
*/

-- Example 6: Failed step-up authentication attempts
/*
SELECT
    cupid,
    context_id,
    auth_type,
    auth_outcome,
    risk_score,
    drs_recommendation,
    auth_started_at
FROM v_login_activity
WHERE auth_type = 'STEP_UP'
  AND auth_outcome != 'SUCCESS'
  AND auth_started_at > NOW() - INTERVAL '24 hours'
ORDER BY auth_started_at DESC;
*/

-- Example 7: IP velocity check (including step-ups)
/*
SELECT
    ip_address,
    auth_type,
    COUNT(*) as attempt_count,
    COUNT(*) FILTER (WHERE auth_outcome = 'SUCCESS') as successful,
    COUNT(*) FILTER (WHERE auth_outcome != 'SUCCESS') as failed,
    MIN(auth_started_at) as first_attempt,
    MAX(auth_started_at) as last_attempt
FROM v_login_activity
WHERE ip_address = 'TARGET_IP_ADDRESS'
  AND auth_started_at > NOW() - INTERVAL '1 hour'
GROUP BY ip_address, auth_type;
*/

-- Example 8: Risk score trends within sessions
/*
SELECT
    session_id,
    cupid,
    auth_sequence,
    auth_type,
    risk_score,
    recommendation,
    auth_time,
    LAG(risk_score) OVER (PARTITION BY session_id ORDER BY auth_sequence) as previous_risk_score,
    risk_score - LAG(risk_score) OVER (PARTITION BY session_id ORDER BY auth_sequence) as risk_score_change
FROM v_session_auth_timeline
WHERE session_id IN (
    SELECT session_id FROM v_session_auth_timeline WHERE step_up_count > 0 LIMIT 10
)
ORDER BY session_id, auth_sequence;
*/

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify new columns were added
SELECT
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
      (table_name = 'auth_contexts' AND column_name IN ('session_id', 'auth_type'))
      OR (table_name = 'drs_evaluations' AND column_name = 'session_id')
      OR (table_name = 'audit_logs' AND column_name = 'auth_type')
  )
ORDER BY table_name, column_name;

-- Verify new indexes were created
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND (
      indexname LIKE 'idx_auth_ctx_session%'
      OR indexname LIKE 'idx_auth_ctx_type%'
      OR indexname LIKE 'idx_drs_session%'
      OR indexname LIKE 'idx_audit_session%'
      OR indexname LIKE 'idx_audit_error%'
      OR indexname LIKE 'idx_audit_mfa%'
      OR indexname LIKE 'idx_audit_failure%'
      OR indexname LIKE 'idx_audit_event_data%'
      OR indexname LIKE 'idx_auth_ctx_ip%'
      OR indexname LIKE 'idx_auth_ctx_device%'
      OR indexname LIKE 'idx_auth_ctx_outcome%'
  )
ORDER BY tablename, indexname;

-- Verify new views were created
SELECT
    viewname,
    definition
FROM pg_views
WHERE schemaname = 'public'
  AND viewname IN (
      'v_login_activity',
      'v_session_auth_timeline',
      'v_step_up_frequency',
      'v_high_risk_logins'
  )
ORDER BY viewname;

-- ============================================================================
-- MIGRATION GUIDE: Populating session_id for Step-Up Scenarios
-- ============================================================================

/*
For step-up authentication, your application should:

1. When creating step-up auth context:
   INSERT INTO auth_contexts (
       context_id,
       auth_type,
       session_id,  -- ← Populate with existing session_id
       cupid,
       guid,
       ...
   ) VALUES (
       gen_random_uuid(),
       'STEP_UP',
       'existing-session-id',  -- ← Link to existing session
       ...
   );

2. When creating DRS evaluation for step-up:
   INSERT INTO drs_evaluations (
       evaluation_id,
       context_id,
       session_id,  -- ← Populate with same session_id
       ...
   ) VALUES (
       gen_random_uuid(),
       'step-up-context-id',
       'existing-session-id',  -- ← Link to existing session
       ...
   );

3. When logging audit events for step-up:
   INSERT INTO audit_logs (
       audit_id,
       context_id,
       session_id,
       auth_type,  -- ← 'STEP_UP'
       event_type,
       ...
   ) VALUES (
       gen_random_uuid(),
       'step-up-context-id',
       'existing-session-id',
       'STEP_UP',
       'STEP_UP_INITIATED',
       ...
   );
*/

-- ============================================================================
-- END OF SCHEMA ENHANCEMENT
-- ============================================================================

-- Success message
SELECT
    '✅ Schema enhancement completed successfully!' as status,
    'Multi-context session support enabled' as feature,
    'Check verification queries above for details' as next_step;
