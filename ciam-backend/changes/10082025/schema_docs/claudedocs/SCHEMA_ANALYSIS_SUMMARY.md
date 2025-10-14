# Schema Analysis Summary: Near-Realtime Analytics & Fraud Detection

## Executive Summary

This document summarizes the schema analysis and recommendations for capturing login activity and DRS evaluation data to support near-realtime analytics and fraud detection capabilities.

## Key Questions Answered

### 1. **Should JSONB be used or should tables be flattened?**

**Answer: Hybrid Approach (Current Design is Correct) ✅**

Your current schema already uses the optimal pattern:

```sql
-- drs_evaluations: Hybrid approach
CREATE TABLE drs_evaluations (
    -- Flattened fields for common queries (INDEXED)
    risk_score INT NOT NULL,           -- ✅
    recommendation VARCHAR(20),        -- ✅
    browser VARCHAR(100),              -- ✅
    has_high_risk_signals BOOLEAN,     -- ✅

    -- Full JSONB for audit trail & future extensibility
    raw_response JSONB NOT NULL        -- ✅
);

-- audit_logs: JSONB for heterogeneous event types
CREATE TABLE audit_logs (
    -- Fixed columns for filtering (INDEXED)
    event_type VARCHAR(100),           -- ✅
    event_category VARCHAR(50),        -- ✅
    severity VARCHAR(20),              -- ✅

    -- Flexible JSONB for event-specific details
    event_data JSONB NOT NULL          -- ✅
);
```

**Key Principles:**
- ✅ **Flatten frequently-queried fields** (risk_score, recommendation, error_code)
- ✅ **Keep JSONB for completeness** (raw_response, event_data)
- ✅ **Add expression indexes** on JSONB fields for common queries
- ❌ **Don't flatten everything** - creates maintenance burden
- ❌ **Don't use only JSONB** - query performance suffers

**Enhancement: Expression Indexes on JSONB**
```sql
-- Fast queries on specific JSONB fields
CREATE INDEX idx_audit_error_code
    ON audit_logs ((event_data->>'error_code'))
    WHERE event_category = 'AUTH';
```

---

### 2. **Can views be created instead of new tables?**

**Answer: Yes, Views are Recommended ✅**

**Standard View Strategy:**
```sql
CREATE VIEW v_login_activity AS
SELECT
    ac.context_id,
    ac.cupid,
    ac.ip_address,
    ac.auth_outcome,
    drs.risk_score,
    drs.recommendation,
    ...
FROM auth_contexts ac
LEFT JOIN drs_evaluations drs ON drs.context_id = ac.context_id
WHERE ac.completed_at IS NOT NULL;
```

**Advantages:**
- ✅ Always up-to-date (real-time)
- ✅ No storage overhead
- ✅ Simple to maintain
- ✅ Good performance with proper indexes
- ✅ Aligns with "capture first, analytics later" approach

**When to Use Materialized Views:**
Only if queries are too slow after testing with real data (unlikely with proper indexes).

**Recommendation: Start with standard views + indexes, upgrade to materialized views only if needed.**

---

### 3. **Are drs_evaluations and audit_logs tables appropriate for pre-auth and post-auth?**

**Answer: Yes, with Schema Enhancements ✅**

**Challenge Identified:**
- Initial auth (pre-auth): No session exists yet
- Post-auth activity: Session exists
- Step-up auth (post-auth): New context within existing session

**Solution: Multi-Context Session Support**

Enhanced schema to support:
1. **Initial Authentication** (pre-auth)
   - `session_id = NULL` in auth_contexts
   - `session_id = NULL` in drs_evaluations
   - Session created upon success

2. **Post-Auth Activity**
   - `context_id = NULL` in audit_logs
   - `session_id` populated

3. **Step-Up Authentication** (post-auth)
   - New auth_contexts row with `auth_type = 'STEP_UP'`
   - Links back to parent session via `session_id`
   - New drs_evaluations row with `session_id` populated

**Schema Changes:**
```sql
-- Link step-up contexts back to parent session
ALTER TABLE auth_contexts
    ADD COLUMN session_id UUID REFERENCES sessions(session_id),
    ADD COLUMN auth_type VARCHAR(20) DEFAULT 'INITIAL';

-- Enable session lifecycle DRS queries
ALTER TABLE drs_evaluations
    ADD COLUMN session_id UUID REFERENCES sessions(session_id);

-- Track auth type in audit trail
ALTER TABLE audit_logs
    ADD COLUMN auth_type VARCHAR(20);
```

---

### 4. **Is the table schema scalable?**

**Answer: Yes, with Enhancements ✅**

**Current Volume:**
- ~1M logins/day → ~30M/month
- ~10M audit events/day → ~300M/month

**Scalability Features:**

1. **Partitioning** (Already Implemented)
   ```sql
   -- audit_logs partitioned by month
   CREATE TABLE audit_logs ... PARTITION BY RANGE (created_at);
   ```
   ✅ Query performance remains constant as data grows
   ✅ Easy archival/retention management

2. **Strategic Indexing** (Enhanced)
   - Covered indexes on high-cardinality columns
   - Partial indexes with WHERE clauses to reduce size
   - Expression indexes on JSONB fields
   - GIN indexes for pattern matching

3. **Read Replica Strategy** (Future)
   - Analytics queries → read replica
   - Transactional writes → primary
   - No performance impact on login path

**Performance Characteristics:**

| Query Type | Expected Performance | Index Support |
|------------|---------------------|---------------|
| User velocity check (last 10 min) | <50ms | `idx_auth_ctx_cupid_outcome_time` |
| IP velocity check (last hour) | <50ms | `idx_auth_ctx_ip_time` |
| Failed login analysis | <100ms | `idx_audit_error_code` expression index |
| High risk logins (last 24h) | <200ms | `idx_drs_risk_score` + partitioning |
| Session auth timeline | <50ms | `idx_auth_ctx_session_time` |

---

## Schema Design Decisions

### Decision 1: Single vs Multiple Tables

**Question:** Should login activity and DRS evaluations be a single table or multiple tables?

**Answer: Multiple Tables (Current Design) ✅**

**Rationale:**
- ✅ **Separation of concerns**: DRS data vs business logic
- ✅ **1:1 relationship**: One DRS evaluation per auth context
- ✅ **Independent evolution**: DRS vendor changes don't affect auth schema
- ✅ **Specialized indexes**: Each table optimized for its queries
- ✅ **Views provide unified access**: `v_login_activity` joins seamlessly

**Alternative Considered:**
```sql
-- ❌ NOT RECOMMENDED: Single denormalized table
CREATE TABLE login_events (
    event_id UUID PRIMARY KEY,
    -- Auth fields
    context_id UUID,
    cupid VARCHAR(50),
    auth_outcome VARCHAR(50),
    -- DRS fields
    risk_score INT,
    recommendation VARCHAR(20),
    -- Audit fields
    event_type VARCHAR(100),
    event_data JSONB,
    ...
);
```

**Why Rejected:**
- ❌ Mixes different concerns (auth, DRS, audit)
- ❌ Harder to maintain as requirements evolve
- ❌ DRS vendor change impacts entire schema
- ❌ Redundant data (same DRS eval for multiple audit events)

---

### Decision 2: View Strategy

**Question:** Materialized view vs standard view vs new table?

**Comparison:**

| Approach | Real-Time | Storage | Maintenance | Performance |
|----------|-----------|---------|-------------|-------------|
| **Standard View** | ✅ Always current | ✅ None | ✅ Simple | ✅ Good with indexes |
| **Materialized View** | ❌ Stale | ❌ Duplicates | ⚠️ Refresh jobs | ✅ Excellent |
| **New Table** | ⚠️ Write complexity | ❌ Duplicates | ❌ Complex sync | ✅ Excellent |

**Recommendation: Standard View**
- Start with standard views
- Add strategic indexes
- Measure performance with real data
- Only upgrade if queries are slow (unlikely)

---

## Implementation Strategy

### Phase 1: Schema Enhancements (Current)
✅ Add session_id to auth_contexts
✅ Add auth_type to auth_contexts
✅ Add session_id to drs_evaluations
✅ Add auth_type to audit_logs
✅ Add expression indexes on JSONB fields
✅ Add missing indexes for velocity queries
✅ Create enhanced views (v_login_activity, v_session_auth_timeline)

### Phase 2: Application Updates
- Update auth flow to populate session_id for step-ups
- Implement step-up authentication logic
- Update audit logging to include auth_type
- Test query performance with production-like data

### Phase 3: Analytics Integration (Future)
- Stream to analytics platform (Kafka → ClickHouse/BigQuery)
- Real-time dashboards using views
- ML-based fraud detection models
- Alerting and monitoring

---

## Query Patterns Enabled

### 1. Fraud Detection Velocity Checks

```sql
-- IP velocity: How many attempts from this IP in last 10 minutes?
SELECT COUNT(*) FROM v_login_activity
WHERE ip_address = $1
  AND auth_started_at > NOW() - INTERVAL '10 minutes';

-- User velocity: Failed attempts per user
SELECT COUNT(*) FROM v_login_activity
WHERE cupid = $1
  AND auth_outcome = 'FAILED'
  AND auth_started_at > NOW() - INTERVAL '1 hour';
```

### 2. Session Lifecycle Analysis

```sql
-- All authentications for a session (initial + step-ups)
SELECT * FROM v_session_auth_timeline
WHERE session_id = $1
ORDER BY auth_sequence;

-- Sessions requiring frequent step-ups
SELECT * FROM v_step_up_frequency
WHERE step_up_session_percentage > 50
ORDER BY step_up_auths DESC;
```

### 3. Risk Pattern Detection

```sql
-- High-risk logins with context
SELECT * FROM v_high_risk_logins
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND has_high_risk_signals = true;

-- Risk score trends within sessions
SELECT
    session_id,
    auth_sequence,
    risk_score,
    LAG(risk_score) OVER (PARTITION BY session_id ORDER BY auth_sequence) as prev_score
FROM v_session_auth_timeline
WHERE step_up_count > 0;
```

---

## Key Recommendations

### ✅ Do:
1. Keep hybrid JSONB + flattened columns approach
2. Use standard views for unified data access
3. Add strategic indexes (IP, device, outcome, session_id)
4. Use expression indexes on JSONB for common queries
5. Leverage partitioning for long-term scalability
6. Populate session_id for step-up authentication

### ❌ Don't:
1. Flatten everything to columns (maintenance burden)
2. Store everything in JSONB (query performance)
3. Create materialized views prematurely
4. Create new denormalized tables before testing views
5. Skip indexes on high-cardinality query fields

---

## Files Created

1. **schema-enhancement-multi-context-sessions.sql**
   - SQL migration script with all schema changes
   - Indexes for query optimization
   - Enhanced views for analytics
   - Example queries and verification

2. **IMPLEMENTATION_GUIDE_Multi_Context_Sessions.md**
   - Step-by-step implementation patterns
   - Code examples for initial and step-up auth
   - Fraud detection use cases
   - Testing scenarios and best practices

3. **SCHEMA_ANALYSIS_SUMMARY.md** (this document)
   - Answers to original questions
   - Design decisions and rationale
   - Performance characteristics
   - Recommendations and strategy

---

## Next Steps

1. **Review** the schema enhancement SQL script
2. **Test** on development environment
3. **Measure** query performance with sample data
4. **Update** application code for step-up auth
5. **Deploy** to production with monitoring
6. **Monitor** query performance and adjust indexes as needed

---

## Performance Expectations

With the enhanced schema and indexes:

- **Velocity queries**: <50ms (10 minute window)
- **Session timeline**: <50ms (typical 2-3 auth contexts)
- **High-risk monitoring**: <200ms (24 hour window)
- **Failed login analysis**: <100ms (1 hour window)
- **Audit trail queries**: <300ms (session lifecycle)

**Scalability:** Performance should remain stable as data grows due to:
- Partitioning (time-based pruning)
- Strategic indexes (narrow scan ranges)
- View optimization (PostgreSQL query planner)

---

## Conclusion

Your current schema design is fundamentally sound. The enhancements add:
- ✅ Multi-context session support for step-up authentication
- ✅ Optimized indexes for fraud detection queries
- ✅ Convenient views for analytics and reporting
- ✅ Scalability for growing data volumes
- ✅ Flexibility for future requirements

The hybrid JSONB approach is appropriate and aligns with industry best practices for audit logging and vendor data integration.
