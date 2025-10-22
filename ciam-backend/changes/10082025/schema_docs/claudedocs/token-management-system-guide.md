# CIAM Token Management System - Developer Guide

**Version**: 4.0
**Date**: October 2025
**Status**: Production Design - Greenfield Implementation
**Architecture**: Sliding Window with Absolute Cap + Performance Optimizations

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Token Specifications](#token-specifications)
4. [Volume Analysis & Capacity Planning](#volume-analysis--capacity-planning)
5. [Token State Machines](#token-state-machines)
6. [Scenario Walkthroughs](#scenario-walkthroughs)
7. [Implementation Guidelines](#implementation-guidelines)
8. [Code Examples](#code-examples)
9. [Monitoring & Operations](#monitoring--operations)
10. [Troubleshooting Guide](#troubleshooting-guide)

---

## Executive Summary

### Design Philosophy

This CIAM (Customer Identity and Access Management) token system implements a **sliding window with absolute cap** security model, optimized for high-volume production use (2.4M daily logins).

**Key Characteristics**:
- **Sliding Windows**: Token expiry resets on each refresh (discourages inactivity)
- **Absolute Cap**: Session has hard 21-hour limit (prevents indefinite sessions)
- **Performance Optimized**: Denormalized data + atomic operations for minimal latency
- **Audit Complete**: All token operations preserved in partitioned history tables

### Critical Optimizations (v4.0)

1. **Denormalized `session_expires_at`**: Single-query validation (50% query reduction)
2. **DELETE RETURNING Pattern**: Atomic read-delete operations (33% query reduction)
3. **Vertical Token Split**: Active vs inactive tables (6.7M hourly deletes → 10ms partition DROP)
4. **Selective Partitioning**: Only analytical tables partitioned (simplicity + performance)

### Token Lifecycle at a Glance

```
Login → Create 3 tokens (ACCESS, REFRESH, ID)
  ↓
Every 5 minutes → Refresh flow
  ├─ Validate: refresh_token.expires_at > NOW() [1-hour inactivity check]
  ├─ Validate: session_expires_at > NOW() [21-hour absolute check]
  ├─ Rotate: DELETE old tokens RETURNING *, INSERT new tokens
  └─ Reset: expires_at gets fresh window (5min/1hr)
  ↓
After 21 hours → Session absolute limit reached
  └─ Rotation blocked: "Session expired"
  ↓
Hourly purge job → Move expired tokens to inactive, DROP old partitions
```

---

## Architecture Overview

### Three-Layer Token Model

```
┌─────────────────────────────────────────────────────────────┐
│                      SESSION LAYER                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Session (expires_at: 21 hours - IMMUTABLE)          │  │
│  │  - Created once at login                              │  │
│  │  - Absolute time limit, never extended                │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│  ACCESS TOKEN  │  │ REFRESH TOKEN  │  │   ID TOKEN     │
│  5 min window  │  │  1 hour window │  │  5 min window  │
│  (sliding)     │  │   (sliding)    │  │   (sliding)    │
└────────────────┘  └────────────────┘  └────────────────┘
         │                  │                   │
         └──────────────────┴───────────────────┘
                           │
                   Reset on rotation
```

### Database Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  TRANSACTIONAL TABLES                        │
│                    (Non-Partitioned)                         │
├───────────────────┬──────────────────┬──────────────────────┤
│  auth_contexts    │ auth_transactions│     sessions         │
│  - 42K records    │  - 140K records  │  - 2.5M records      │
│  - 25 min retain  │  - 25 min retain │  - 25 hour retain    │
│  - Batch DELETE   │  - Batch DELETE  │  - Batch DELETE      │
└───────────────────┴──────────────────┴──────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    TOKENS TABLES                             │
│                  (Vertical Split - v3)                       │
├────────────────────────┬────────────────────────────────────┤
│    tokens_active       │        tokens_inactive              │
│  - ~6M records         │   - ~52.5M records (partitioned)    │
│  - Non-partitioned     │   - Hourly partitions               │
│  - Fast hash lookup    │   - Audit history                   │
│  - Batch DELETE        │   - DROP partition (instant)        │
│  + session_expires_at  │   + session_expires_at (v4)         │
└────────────────────────┴────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  ANALYTICAL TABLES                           │
│                     (Partitioned)                            │
├────────────────────────┬────────────────────────────────────┤
│   drs_evaluations      │          audit_logs                 │
│  - 216M records        │   - 7.884B records                  │
│  - 90 day retention    │   - 90 day retention                │
│  - Daily partitions    │   - Daily partitions                │
│  - DROP partition      │   - DROP partition                  │
└────────────────────────┴────────────────────────────────────┘
```

---

## Token Specifications

### Token Types & Lifetimes

| Token Type | Lifetime | Behavior | Use Case |
|------------|----------|----------|----------|
| **ACCESS** | 5 minutes | Sliding window | API authentication |
| **REFRESH** | 1 hour | Sliding window | Token rotation |
| **ID** | 5 minutes | Sliding window | User identity claims |
| **SESSION** | 21 hours | **Absolute cap** | Overall session limit |

### Sliding Window Behavior

```
T+0:00   | Create ACCESS token → expires_at = T+5m
T+5:00   | Rotate → NEW ACCESS token → expires_at = T+10m (RESET)
T+10:00  | Rotate → NEW ACCESS token → expires_at = T+15m (RESET)
...
T+60:00  | Rotate → NEW ACCESS token → expires_at = T+65m (RESET)

Sliding Window = Every rotation resets the timer
```

### Absolute Cap Behavior

```
T+0:00   | Login → session.expires_at = T+21h (SET ONCE, IMMUTABLE)
T+5:00   | Rotate → session.expires_at = T+21h (UNCHANGED)
T+10:00  | Rotate → session.expires_at = T+21h (UNCHANGED)
...
T+20:55  | Rotate → session.expires_at = T+21h (UNCHANGED)
T+21:00  | Session reaches absolute limit
T+21:05  | Rotation attempt → BLOCKED: "Session expired"

Absolute Cap = Cannot extend beyond initial creation + 21 hours
```

### Inactivity vs Absolute Limit

| Scenario | Refresh Token | Session | Result |
|----------|---------------|---------|--------|
| Active user for 20 hours | Sliding, keeps resetting | T+21h limit | ✅ Rotation works until 21h |
| Inactive for 1 hour | Expires after 1h | Still valid (if < 21h) | ❌ Rotation fails: "Token expired" |
| Active for 21+ hours | Valid (refreshed recently) | Expired at T+21h | ❌ Rotation fails: "Session expired" |

---

## Volume Analysis & Capacity Planning

### User Activity Patterns (Realistic Distribution)

```yaml
User Segments:
  High Activity (21 hours):
    Percentage: 1%
    Refreshes: 252 per session
    Tokens Created: 759 per session

  Moderate Activity (30 minutes):
    Percentage: 40%
    Refreshes: 6 per session
    Tokens Created: 21 per session

  Short Session (10 minutes):
    Percentage: 50%
    Refreshes: 2 per session
    Tokens Created: 9 per session

  Immediate Bounce (login only):
    Percentage: 9%
    Refreshes: 0
    Tokens Created: 3 per session

Weighted Average:
  Refreshes per session: ~6
  Tokens per session: ~21
```

### Daily Volume Projections (2.4M Logins)

```yaml
Logins per day: 2,400,000

Token Operations:
  Total refreshes: 14,400,000 (2.4M × 6)
  Total tokens created: 50,400,000 (2.4M × 21)
  tokens_inactive writes: 50,400,000

Hourly Metrics:
  Logins: 100,000
  Refreshes: 600,000
  Tokens to inactive: 1,800,000
  Partition size: 1.8M records/hour

Per-Second Metrics (peak):
  Logins: ~28/sec
  Refreshes: ~167/sec
  Token validations: ~1,736/sec (every API call)
```

### Steady-State Storage (25-Hour Retention)

```yaml
tokens_active:
  Records: ~6,000,000 (all currently valid tokens)
  Storage: ~3 GB
  Growth: None (purged hourly)

tokens_inactive:
  Records: ~52,500,000 (25h × 2.1M/hour)
  Storage: ~26 GB
  Growth: None (partitions dropped)
  Partitions: 25 hourly partitions

sessions:
  Records: ~2,500,000 (active sessions)
  Storage: ~2.5 GB
  Growth: Controlled by purge

audit_logs (90 days):
  Records: ~7,884,000,000
  Storage: ~3.9 TB
  Daily partitions: 90
```

### Maximum Capacity Analysis

```yaml
Design Capacity: 76,800,000 refreshes/day
Realistic Usage: 14,400,000 refreshes/day
Headroom: 5.3x (530% capacity)

Scaling Thresholds:
  Warning: >40M refreshes/day (52% capacity)
  Critical: >60M refreshes/day (78% capacity)
  Maximum: 76.8M refreshes/day (100% design capacity)

Growth Projection:
  Current: 2.4M logins/day
  20% YoY growth: 2.88M logins → 17.3M refreshes
  5 years: 5.97M logins → 35.8M refreshes (still 46% capacity)
```

### Performance Characteristics

```yaml
Query Performance:
  Token validation: <5ms (single index scan)
  Token rotation: <50ms (optimized transaction)
  Session lookup: <10ms (primary key lookup)

Purge Performance:
  auth_contexts: 0.4 sec (16,670 records)
  auth_transactions: 0.7 sec (27,920 records)
  sessions: 2.9 sec (100,000 records + cascade)
  tokens_active: 4 sec (200,000 records)
  tokens_inactive DROP: <10ms (instant)

Database Load:
  Connection pool: 200 connections
  Peak connections used: <50 (75% available)
  Replication lag: <2 seconds
  Auto-vacuum: Aggressive for high-churn tables
```

---

## Token State Machines

### tokens_active State Machine

```
┌─────────────────────────────────────────────────────────┐
│                     tokens_active                        │
│                                                          │
│  ┌────────────┐                                         │
│  │   INSERT   │ ◄─── Login / Rotation                   │
│  │  (ACTIVE)  │                                          │
│  └─────┬──────┘                                          │
│        │                                                 │
│        │ Lives here until one of:                        │
│        │  - Rotation (DELETE RETURNING)                  │
│        │  - Explicit revocation                          │
│        │  - Expiry + purge job                           │
│        │                                                 │
│        ▼                                                 │
│  ┌────────────┐                                         │
│  │   DELETE   │ ───┐                                    │
│  │            │    │                                    │
│  └────────────┘    │ RETURNING *                        │
│                    │ (captures data)                    │
└────────────────────┼────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                   tokens_inactive                        │
│                                                          │
│  ┌────────────┐                                         │
│  │   INSERT   │ ◄─── From DELETE RETURNING              │
│  │ (status =  │                                          │
│  │  ROTATED / │      With status:                       │
│  │  EXPIRED / │      - ROTATED (token rotation)         │
│  │  REVOKED)  │      - EXPIRED (natural expiry)         │
│  └─────┬──────┘      - REVOKED (logout/admin)           │
│        │                                                 │
│        │ Partitioned by moved_at                         │
│        │ Lives here for 25 hours                         │
│        │                                                 │
│        ▼                                                 │
│  ┌────────────┐                                         │
│  │DROP TABLE  │ ◄─── Hourly partition drop job          │
│  │ partition  │      (25-hour old partitions)           │
│  └────────────┘                                         │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Token Status Transitions

```
         ACTIVE (in tokens_active)
            │
            ├─────────────────┬─────────────────┬──────────────
            │                 │                 │
            ▼                 ▼                 ▼
        ROTATED           EXPIRED           REVOKED
    (user refresh)    (time passes)    (logout/admin)
            │                 │                 │
            └─────────────────┴─────────────────┘
                         │
                         ▼
              (in tokens_inactive for 25h)
                         │
                         ▼
                    [DROPPED]
             (partition deletion)
```

### Session Validation State Machine

```
           Token Refresh Request
                    │
                    ▼
          ┌─────────────────────┐
          │ Validate Refresh    │
          │ Token               │
          │ (expires_at > NOW?) │
          └──────┬──────────────┘
                 │
        ┌────────┴────────┐
        │                 │
        ▼                 ▼
    Expired           Valid
        │                 │
        │                 ▼
        │      ┌──────────────────────┐
        │      │ Validate Session     │
        │      │ (session_expires_at  │
        │      │    > NOW?)           │
        │      └──────┬───────────────┘
        │             │
        │    ┌────────┴────────┐
        │    │                 │
        │    ▼                 ▼
        │ Expired           Valid
        │    │                 │
        │    │                 ▼
        │    │      ┌──────────────────┐
        │    │      │ Proceed with     │
        │    │      │ Token Rotation   │
        │    │      └──────────────────┘
        │    │
        ▼    ▼
   ┌─────────────────┐
   │ Return Error:   │
   │ - Token expired │
   │ - Session       │
   │   expired       │
   └─────────────────┘
```

---

## Scenario Walkthroughs

### Scenario 1: User Login (Initial Token Creation)

**Timeline**: T+0:00

**Steps**:

```javascript
// 1. User submits credentials
POST /auth/login
{
  "username": "john.doe",
  "password": "***",
  "transmit_aid": "web-banking"
}

// 2. Application validates credentials (LDAP/DB)
// 3. Application creates session
INSERT INTO sessions (session_id, cupid, expires_at, status)
VALUES (
  'sess_abc123',
  'cupid_john',
  NOW() + INTERVAL '21 hours',  -- Absolute 21-hour cap
  'ACTIVE'
);

// 4. Application creates 3 tokens
INSERT INTO tokens_active (token_id, session_id, token_type, expires_at, session_expires_at)
VALUES
  ('token_access_001', 'sess_abc123', 'ACCESS', NOW() + INTERVAL '5 minutes', sess.expires_at),
  ('token_refresh_001', 'sess_abc123', 'REFRESH', NOW() + INTERVAL '1 hour', sess.expires_at),
  ('token_id_001', 'sess_abc123', 'ID', NOW() + INTERVAL '5 minutes', sess.expires_at);

// 5. Response to client
{
  "access_token": "nonce_access_001",
  "id_token": "nonce_id_001",
  "token_type": "Bearer",
  "expires_in": 300
}
Set-Cookie: refresh_token=nonce_refresh_001; HttpOnly; Secure
```

**Database State**:
- `sessions`: 1 record (status='ACTIVE', expires_at=T+21h)
- `tokens_active`: 3 records (ACCESS, REFRESH, ID)
- `tokens_inactive`: 0 records

---

### Scenario 2: Token Refresh (Every 5 Minutes)

**Timeline**: T+0:00 (login) → T+5:00 (first refresh)

**Steps**:

```javascript
// 1. Client detects access token will expire soon
// 2. Client calls refresh endpoint with httpOnly cookie
POST /auth/refresh
Cookie: refresh_token=nonce_refresh_001

// 3. Application validates token AND session in ONE query (v4 optimization)
SELECT * FROM tokens_active
WHERE token_value_hash = 'sha256(nonce_refresh_001)'
  AND expires_at > NOW()              -- Refresh token not expired (1h check)
  AND session_expires_at > NOW()      -- Session not expired (21h check)
  AND token_type = 'REFRESH';

// Result: Found token_refresh_001, both validations passed

// 4. Application rotates tokens in transaction
BEGIN;

  -- Step 4a: DELETE old tokens and capture data (v4 optimization)
  DELETE FROM tokens_active
  WHERE session_id = 'sess_abc123'
  RETURNING *;
  -- Returns: token_access_001, token_refresh_001, token_id_001

  -- Step 4b: Extract ID token claims from returned data (in memory)
  const oldIdToken = returnedTokens.find(t => t.token_type === 'ID');
  const idTokenClaims = extractClaims(oldIdToken.token_value);

  -- Step 4c: Move old tokens to inactive (audit trail)
  INSERT INTO tokens_inactive (token_id, session_id, ..., status, moved_at)
  VALUES
    (..., 'ROTATED', NOW()),
    (..., 'ROTATED', NOW()),
    (..., 'ROTATED', NOW());

  -- Step 4d: Create NEW tokens with RESET timers
  INSERT INTO tokens_active (token_id, session_id, parent_token_id, token_type, expires_at, session_expires_at)
  VALUES
    ('token_access_002', 'sess_abc123', 'token_access_001', 'ACCESS',
     NOW() + INTERVAL '5 minutes', oldTokens[0].session_expires_at),  -- Fresh 5-min window
    ('token_refresh_002', 'sess_abc123', 'token_refresh_001', 'REFRESH',
     NOW() + INTERVAL '1 hour', oldTokens[0].session_expires_at),     -- Fresh 1-hour window
    ('token_id_002', 'sess_abc123', 'token_id_001', 'ID',
     NOW() + INTERVAL '5 minutes', oldTokens[0].session_expires_at);  -- Fresh 5-min window

COMMIT;

// 5. Response with new tokens
{
  "access_token": "nonce_access_002",
  "expires_in": 300
}
Set-Cookie: refresh_token=nonce_refresh_002; HttpOnly; Secure  -- Token rotation
```

**Database State**:
- `sessions`: 1 record (unchanged, expires_at still T+21h)
- `tokens_active`: 3 records (generation 2)
- `tokens_inactive`: 3 records (generation 1, status='ROTATED')

**Key Observations**:
1. ✅ session_expires_at copied from old token (immutable value)
2. ✅ expires_at RESET to fresh windows (sliding behavior)
3. ✅ All operations in single transaction (atomic)
4. ✅ Only 4 queries (validation, DELETE RETURNING, INSERT inactive, INSERT active)

---

### Scenario 3: User Closes Browser (No Logout)

**Timeline**: T+0:00 (login) → T+0:30 (closes browser)

**Steps**:

```javascript
// 1. User logs in
POST /auth/login → Creates session + 3 tokens

// 2. User browses for 30 seconds
// 3. User closes browser tab (no logout call)

// At T+0:30 - Nothing happens in database
// tokens_active: 3 records (still there)
// sessions: 1 record (still ACTIVE)

// At T+5:00 - Access token expires
// tokens_active: 3 records (not auto-deleted, just expired)

// At T+1:00 - Refresh token expires
// tokens_active: 3 records (still there, just expired)

// At T+1:35 - Hourly purge job runs
SELECT purge_expired_tokens();

-- Inside purge function:
BEGIN;
  -- Move expired tokens to inactive
  INSERT INTO tokens_inactive (token_id, ..., status, moved_at)
  SELECT token_id, ..., 'EXPIRED', NOW()
  FROM tokens_active
  WHERE expires_at < NOW();

  -- Delete expired tokens
  DELETE FROM tokens_active WHERE expires_at < NOW();
COMMIT;

// At T+1:35 - After purge
// tokens_active: 0 records (purged)
// tokens_inactive: 3 records (status='EXPIRED')
// sessions: 1 record (still ACTIVE, will be purged at T+21h+30m)
```

**Database State Timeline**:

```
T+0:00   | tokens_active: 3, sessions: 1
T+0:30   | tokens_active: 3, sessions: 1 (browser closed, no DB change)
T+5:00   | tokens_active: 3 (expired but not deleted), sessions: 1
T+1:00   | tokens_active: 3 (all expired), sessions: 1
T+1:35   | tokens_active: 0 (purged), tokens_inactive: 3 (status='EXPIRED')
T+21:30  | Session expires (expires_at < NOW)
T+22:30  | Session purged by hourly job
```

---

### Scenario 4: Explicit Logout

**Timeline**: T+0:00 (login) → T+10:00 (user clicks logout)

**Steps**:

```javascript
// 1. User clicks "Logout" button
POST /auth/logout

// 2. Application revokes session and tokens
BEGIN;

  -- Step 2a: Update session status
  UPDATE sessions
  SET status = 'LOGGED_OUT',
      revoked_at = NOW(),
      revoked_by = 'user',
      revocation_reason = 'User initiated logout'
  WHERE session_id = 'sess_abc123';

  -- Step 2b: Move tokens to inactive with REVOKED status
  INSERT INTO tokens_inactive (token_id, ..., status, moved_at)
  SELECT token_id, ..., 'REVOKED', NOW()
  FROM tokens_active
  WHERE session_id = 'sess_abc123';

  -- Step 2c: Delete tokens from active
  DELETE FROM tokens_active WHERE session_id = 'sess_abc123';

COMMIT;

// 3. Clear client cookie
Set-Cookie: refresh_token=; Max-Age=0; HttpOnly; Secure

// 4. Response
{ "success": true, "message": "Logout successful" }
```

**Database State**:
- `sessions`: 1 record (status='LOGGED_OUT', revoked_at set)
- `tokens_active`: 0 records
- `tokens_inactive`: 3 records (status='REVOKED')

**Next API Call with Old Token**:
```javascript
// User tries to use old access token
POST /api/some-endpoint
Authorization: Bearer nonce_access_002

// Kong gateway calls /auth/token/verify
SELECT * FROM tokens_active
WHERE token_value_hash = 'sha256(nonce_access_002)';

// Result: NOT FOUND (token was deleted)
// Response: 401 Unauthorized
```

---

### Scenario 5: 21-Hour Session Limit

**Timeline**: T+0:00 (login) → T+20:55 (active) → T+21:05 (try to refresh)

**Steps**:

```javascript
// User has been active for 20 hours 55 minutes (251 refreshes)
// Each refresh reset the token timers, but NOT the session.expires_at

// At T+20:55 - User refreshes successfully
POST /auth/refresh
Cookie: refresh_token=nonce_refresh_251

// Validation:
SELECT * FROM tokens_active
WHERE token_value_hash = 'sha256(nonce_refresh_251)'
  AND expires_at > NOW()              -- ✅ Valid (refreshed 5min ago, expires T+21h55m)
  AND session_expires_at > NOW();     -- ✅ Valid (T+21h is 5 minutes away)

// Result: SUCCESS - tokens rotated (generation 252)

// At T+21:00 - Session reaches absolute limit
// session.expires_at = T+21h = NOW()

// At T+21:05 - User tries to refresh again
POST /auth/refresh
Cookie: refresh_token=nonce_refresh_252

// Validation:
SELECT * FROM tokens_active
WHERE token_value_hash = 'sha256(nonce_refresh_252)'
  AND expires_at > NOW()              -- ✅ Valid (refreshed 5min ago)
  AND session_expires_at > NOW();     -- ❌ FAIL: T+21h < NOW()

// Result: NOT FOUND

// More specific error handling:
SELECT * FROM tokens_active
WHERE token_value_hash = 'sha256(nonce_refresh_252)';

// Found token, check why validation failed:
if (token.expires_at <= NOW()) {
  throw { error_code: 'CIAM_E04_00_002', message: 'Refresh token expired' };
}
if (token.session_expires_at <= NOW()) {
  throw { error_code: 'CIAM_E04_00_005', message: 'Session expired' };  // This one
}

// Response: 401 Unauthorized
{
  "error_code": "CIAM_E04_00_005",
  "message": "Session expired. Please login again."
}
```

**Key Insight**: Even though refresh token is valid (refreshed 5 min ago), session absolute limit blocks rotation.

---

### Scenario 6: Database Cleanup Jobs

**Hourly Purge Cycle** (runs at :35 past each hour)

```sql
-- Function: purge_expired_tokens()
-- Schedule: Every hour at :35 (e.g., 1:35, 2:35, 3:35)

BEGIN;

  -- Metrics start
  v_start := CLOCK_TIMESTAMP();

  -- Move expired tokens to inactive
  INSERT INTO tokens_inactive (token_id, session_id, ..., status, moved_at)
  SELECT token_id, session_id, ..., 'EXPIRED', NOW()
  FROM tokens_active
  WHERE expires_at < NOW();
  -- Typical: ~200K records moved

  -- Delete from active
  DELETE FROM tokens_active WHERE expires_at < NOW();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  -- Typical: ~200K records deleted

  -- Log metrics
  INSERT INTO purge_metrics (table_name, rows_deleted, duration_ms)
  VALUES ('tokens_active', v_deleted, EXTRACT(EPOCH FROM (CLOCK_TIMESTAMP() - v_start)) * 1000);
  -- Typical: ~4 seconds

COMMIT;
```

**Partition Maintenance** (runs at :05 past each hour)

```sql
-- Function: drop_old_partitions()
-- Schedule: Every hour at :05

-- Drop tokens_inactive partitions older than 25 hours
FOR partition_name IN
  SELECT tablename FROM pg_tables
  WHERE tablename LIKE 'tokens_inactive_%'
    AND tablename < 'tokens_inactive_' || TO_CHAR(NOW() - INTERVAL '25 hours', 'YYYY_MM_DD_HH24')
LOOP
  EXECUTE 'DROP TABLE IF EXISTS ' || partition_name;
  -- Example: DROP TABLE tokens_inactive_2025_10_21_10;
  -- Duration: <10ms (instant)
END LOOP;
```

**Complete Purge Schedule**:

```
:00 - create_future_partitions() + expire_old_sessions()
:05 - drop_old_partitions()
:10 - purge_auth_contexts()
:20 - purge_auth_transactions()
:30 - purge_sessions() (cascades to tokens_active)
:35 - purge_expired_tokens()
:45 - (no job)
:55 - (no job)
```

---

## Implementation Guidelines

### Core Principles

1. **Single Transaction Rule**: All token operations MUST be in a transaction
2. **Validation Before Action**: Always validate both token AND session expiry
3. **Atomic Operations**: Use DELETE RETURNING to capture data atomically
4. **Immutable Session Expiry**: session.expires_at set once, copied to tokens, never updated
5. **Fresh Token Windows**: Always reset expires_at on rotation (sliding window)
6. **Audit Everything**: All token state changes go to tokens_inactive

### Transaction Pattern (Standard)

```javascript
async function performTokenOperation(/* params */) {
    return await db.transaction(async (trx) => {
        // 1. Validate with single query (session_expires_at optimization)
        const validation = await validateTokenAndSession(trx, tokenHash);

        // 2. Perform operation using DELETE RETURNING (atomic)
        const oldTokens = await trx('tokens_active')
            .where({ session_id: validation.session_id })
            .del()
            .returning('*');

        // 3. Process old token data in memory
        const oldIdToken = oldTokens.find(t => t.token_type === 'ID');
        const claims = extractClaims(oldIdToken.token_value);

        // 4. Audit trail
        await trx('tokens_inactive').insert(
            oldTokens.map(t => ({ ...t, status: 'ROTATED', moved_at: new Date() }))
        );

        // 5. Create new tokens
        await createNewTokens(trx, validation.session_id, claims, oldTokens);

        return result;
    });
}
```

### Error Handling Strategy

```javascript
// Define error hierarchy
const TokenErrors = {
    NOT_FOUND: 'CIAM_E04_00_001',        // Token doesn't exist
    TOKEN_EXPIRED: 'CIAM_E04_00_002',    // Refresh token expired (1h inactivity)
    SESSION_EXPIRED: 'CIAM_E04_00_005',  // Session expired (21h absolute)
    TOKEN_REVOKED: 'CIAM_E04_00_007',    // Token was revoked
};

// Validation with specific error codes
async function validateRefreshToken(trx, tokenHash) {
    // Single query with both checks
    const token = await trx('tokens_active')
        .where({ token_value_hash: tokenHash, token_type: 'REFRESH' })
        .where('expires_at', '>', new Date())
        .where('session_expires_at', '>', new Date())
        .first();

    if (token) return token;

    // Token not found with valid status - determine why
    const invalidToken = await trx('tokens_active')
        .where({ token_value_hash: tokenHash })
        .first();

    if (!invalidToken) {
        throw new TokenError(TokenErrors.NOT_FOUND, 'Token not found or already used');
    }

    if (invalidToken.expires_at <= new Date()) {
        throw new TokenError(TokenErrors.TOKEN_EXPIRED,
            'Refresh token expired due to inactivity (1 hour limit)');
    }

    if (invalidToken.session_expires_at <= new Date()) {
        throw new TokenError(TokenErrors.SESSION_EXPIRED,
            'Session expired (21 hour absolute limit). Please login again.');
    }

    // Should never reach here
    throw new TokenError(TokenErrors.NOT_FOUND, 'Token validation failed');
}
```

### Security Best Practices

1. **Always Hash Tokens**: Never store plaintext tokens
   ```javascript
   const hash = crypto.createHash('sha256').update(token).digest('hex');
   ```

2. **HttpOnly Cookies**: Refresh tokens MUST be httpOnly
   ```javascript
   res.cookie('refresh_token', nonce, {
       httpOnly: true,
       secure: true,
       sameSite: 'strict',
       maxAge: 3600000  // 1 hour
   });
   ```

3. **Token Rotation**: Always rotate refresh token on use
   - Prevents token replay attacks
   - Old refresh token immediately invalidated

4. **Clock Skew Tolerance**: Consider 30-second grace period
   ```javascript
   const CLOCK_SKEW = 30; // seconds
   const isExpired = token.expires_at.getTime() < (Date.now() - CLOCK_SKEW * 1000);
   ```

5. **Rate Limiting**: Prevent token enumeration attacks
   - Max 5 failed refresh attempts per IP per hour
   - Exponential backoff on repeated failures

---

## Code Examples

### Complete Login Endpoint

```javascript
/**
 * POST /auth/login
 * Creates new session with 3 tokens
 */
async function loginEndpoint(req, res) {
    const { username, password, transmit_aid, context_id, drs_action_token } = req.body;

    try {
        return await db.transaction(async (trx) => {
            // 1. Validate credentials (not shown - LDAP/database check)
            const user = await validateCredentials(username, password);
            if (!user) {
                return res.status(401).json({
                    error_code: 'CIAM_E01_01_001',
                    message: 'Invalid credentials'
                });
            }

            // 2. Check if session limit reached (21 hours absolute)
            // Note: session.expires_at is immutable once set
            const sessionExpiresAt = new Date(Date.now() + 21 * 60 * 60 * 1000);

            // 3. Create session
            const [session] = await trx('sessions').insert({
                session_id: uuid.v4(),
                context_id: context_id || uuid.v4(),
                cupid: user.cupid,
                device_fingerprint: req.fingerprint,
                ip_address: req.ip,
                user_agent: req.get('user-agent'),
                status: 'ACTIVE',
                created_at: new Date(),
                last_activity_at: new Date(),
                expires_at: sessionExpiresAt  // ✅ Set once, IMMUTABLE
            }).returning('*');

            // 4. Generate tokens
            const now = new Date();
            const accessToken = generateAccessToken(user);
            const refreshToken = generateRefreshToken(user);
            const idToken = generateIdToken(user);

            // 5. Create tokens with session_expires_at denormalization
            await trx('tokens_active').insert([
                {
                    token_id: uuid.v4(),
                    session_id: session.session_id,
                    parent_token_id: null,  // Initial tokens have no parent
                    token_type: 'ACCESS',
                    token_value: accessToken,
                    token_value_hash: sha256(accessToken),
                    created_at: now,
                    expires_at: new Date(now.getTime() + 5 * 60 * 1000),      // 5 minutes
                    session_expires_at: sessionExpiresAt  // ✅ Denormalized
                },
                {
                    token_id: uuid.v4(),
                    session_id: session.session_id,
                    parent_token_id: null,
                    token_type: 'REFRESH',
                    token_value: refreshToken,
                    token_value_hash: sha256(refreshToken),
                    created_at: now,
                    expires_at: new Date(now.getTime() + 60 * 60 * 1000),     // 1 hour
                    session_expires_at: sessionExpiresAt  // ✅ Denormalized
                },
                {
                    token_id: uuid.v4(),
                    session_id: session.session_id,
                    parent_token_id: null,
                    token_type: 'ID',
                    token_value: idToken,
                    token_value_hash: sha256(idToken),
                    created_at: now,
                    expires_at: new Date(now.getTime() + 5 * 60 * 1000),      // 5 minutes
                    session_expires_at: sessionExpiresAt  // ✅ Denormalized
                }
            ]);

            // 6. Audit log (optional)
            await trx('audit_logs').insert({
                audit_id: uuid.v4(),
                created_at: now,
                event_type: 'USER_LOGIN',
                event_category: 'AUTH',
                severity: 'INFO',
                cupid: user.cupid,
                context_id: session.context_id,
                session_id: session.session_id,
                correlation_id: req.headers['x-correlation-id'],
                ip_address: req.ip,
                event_data: { username, transmit_aid }
            });

            // 7. Set httpOnly cookie for refresh token
            res.cookie('refresh_token', refreshToken, {
                httpOnly: true,
                secure: true,
                sameSite: 'strict',
                maxAge: 60 * 60 * 1000,  // 1 hour
                path: '/'
            });

            // 8. Return tokens
            return res.status(201).json({
                response_type_code: 'SUCCESS',
                access_token: accessToken,
                id_token: idToken,
                token_type: 'Bearer',
                expires_in: 300,  // 5 minutes
                context_id: session.context_id
            });
        });

    } catch (error) {
        console.error('Login error:', error);
        return res.status(503).json({
            error_code: 'CIAM_E05_00_001',
            message: 'Service unavailable'
        });
    }
}
```

### Complete Token Refresh Endpoint

```javascript
/**
 * POST /auth/refresh
 * Rotates all 3 tokens (optimized with session_expires_at + DELETE RETURNING)
 */
async function refreshEndpoint(req, res) {
    const refreshToken = req.cookies.refresh_token;

    if (!refreshToken) {
        return res.status(401).json({
            error_code: 'CIAM_E04_00_008',
            message: 'Refresh token missing'
        });
    }

    const refreshTokenHash = sha256(refreshToken);

    try {
        return await db.transaction(async (trx) => {
            // 1. ✅ OPTIMIZATION: Single query validates both token AND session
            const validToken = await trx('tokens_active')
                .where({ token_value_hash: refreshTokenHash, token_type: 'REFRESH' })
                .where('expires_at', '>', new Date())          // 1-hour inactivity check
                .where('session_expires_at', '>', new Date())  // 21-hour absolute check
                .first();

            if (!validToken) {
                // Determine specific error
                const expiredToken = await trx('tokens_active')
                    .where({ token_value_hash: refreshTokenHash })
                    .first();

                if (!expiredToken) {
                    return res.status(401).json({
                        error_code: 'CIAM_E04_00_001',
                        message: 'Refresh token not found'
                    });
                }

                if (expiredToken.expires_at <= new Date()) {
                    return res.status(401).json({
                        error_code: 'CIAM_E04_00_002',
                        message: 'Refresh token expired (1 hour inactivity limit)'
                    });
                }

                if (expiredToken.session_expires_at <= new Date()) {
                    return res.status(401).json({
                        error_code: 'CIAM_E04_00_005',
                        message: 'Session expired (21 hour absolute limit). Please login again.'
                    });
                }
            }

            // 2. ✅ OPTIMIZATION: DELETE with RETURNING captures all tokens atomically
            const oldTokens = await trx('tokens_active')
                .where({ session_id: validToken.session_id })
                .del()
                .returning('*');

            // Should always have 3 tokens (ACCESS, REFRESH, ID)
            if (oldTokens.length !== 3) {
                throw new Error('Unexpected token count: ' + oldTokens.length);
            }

            // 3. Extract old token data
            const oldAccessToken = oldTokens.find(t => t.token_type === 'ACCESS');
            const oldRefreshToken = oldTokens.find(t => t.token_type === 'REFRESH');
            const oldIdToken = oldTokens.find(t => t.token_type === 'ID');

            // 4. Extract ID token claims for reuse
            const idTokenClaims = parseJwt(oldIdToken.token_value);

            // 5. Move old tokens to inactive (audit trail)
            await trx('tokens_inactive').insert(
                oldTokens.map(token => ({
                    token_id: token.token_id,
                    session_id: token.session_id,
                    parent_token_id: token.parent_token_id,
                    token_type: token.token_type,
                    token_value_hash: token.token_value_hash,
                    status: 'ROTATED',
                    created_at: token.created_at,
                    expires_at: token.expires_at,
                    session_expires_at: token.session_expires_at,
                    moved_at: new Date()
                }))
            );

            // 6. Generate new tokens with RESET timers (sliding window)
            const now = new Date();
            const newAccessToken = generateAccessToken({
                session_id: validToken.session_id,
                cupid: idTokenClaims.sub
            });
            const newRefreshToken = generateRefreshToken({
                session_id: validToken.session_id,
                cupid: idTokenClaims.sub
            });
            const newIdToken = generateIdToken({
                ...idTokenClaims,  // ✅ Reuse claims from old ID token
                iat: Math.floor(now.getTime() / 1000),
                exp: Math.floor((now.getTime() + 5 * 60 * 1000) / 1000)
            });

            // 7. Insert new tokens with fresh expiry times
            // ✅ session_expires_at copied from old token (immutable value)
            const sessionExpiresAt = oldAccessToken.session_expires_at;

            await trx('tokens_active').insert([
                {
                    token_id: uuid.v4(),
                    session_id: validToken.session_id,
                    parent_token_id: oldAccessToken.token_id,
                    token_type: 'ACCESS',
                    token_value: newAccessToken,
                    token_value_hash: sha256(newAccessToken),
                    created_at: now,
                    expires_at: new Date(now.getTime() + 5 * 60 * 1000),      // ✅ Fresh 5-min window
                    session_expires_at: sessionExpiresAt  // ✅ Copy immutable value
                },
                {
                    token_id: uuid.v4(),
                    session_id: validToken.session_id,
                    parent_token_id: oldRefreshToken.token_id,
                    token_type: 'REFRESH',
                    token_value: newRefreshToken,
                    token_value_hash: sha256(newRefreshToken),
                    created_at: now,
                    expires_at: new Date(now.getTime() + 60 * 60 * 1000),     // ✅ Fresh 1-hour window
                    session_expires_at: sessionExpiresAt  // ✅ Copy immutable value
                },
                {
                    token_id: uuid.v4(),
                    session_id: validToken.session_id,
                    parent_token_id: oldIdToken.token_id,
                    token_type: 'ID',
                    token_value: newIdToken,
                    token_value_hash: sha256(newIdToken),
                    created_at: now,
                    expires_at: new Date(now.getTime() + 5 * 60 * 1000),      // ✅ Fresh 5-min window
                    session_expires_at: sessionExpiresAt  // ✅ Copy immutable value
                }
            ]);

            // 8. Set new refresh token cookie (token rotation)
            res.cookie('refresh_token', newRefreshToken, {
                httpOnly: true,
                secure: true,
                sameSite: 'strict',
                maxAge: 60 * 60 * 1000,
                path: '/'
            });

            // 9. Return new access token
            return res.status(200).json({
                success: true,
                access_token: newAccessToken,
                token_type: 'Bearer',
                expires_in: 300
            });
        });

    } catch (error) {
        console.error('Token refresh error:', error);
        return res.status(503).json({
            error_code: 'CIAM_E05_00_001',
            message: 'Service unavailable'
        });
    }
}
```

### Kong Gateway Token Verification

```javascript
/**
 * POST /auth/token/verify
 * Called by Kong gateway on EVERY API request
 * PERFORMANCE CRITICAL - Must be sub-5ms
 */
async function verifyTokenEndpoint(req, res) {
    const { token, scopes } = req.body;
    const apiKey = req.headers['x-api-key'];

    // 1. Validate API key (Kong authentication)
    if (apiKey !== process.env.KONG_API_KEY) {
        return res.status(401).json({
            error_code: 'CIAM_E04_00_010',
            message: 'Invalid API key'
        });
    }

    // 2. Validate request
    if (!token) {
        return res.status(400).json({
            error_code: 'CIAM_E01_05_001',
            missing_fields: ['token']
        });
    }

    const tokenHash = sha256(token);

    try {
        // 3. ✅ OPTIMIZATION: Single query validates everything
        const validToken = await db('tokens_active')
            .where({ token_value_hash: tokenHash, token_type: 'ACCESS' })
            .where('expires_at', '>', new Date())          // Token not expired
            .where('session_expires_at', '>', new Date())  // Session not expired
            .first();

        if (!validToken) {
            return res.status(200).json({ active: false });
        }

        // 4. Optional: Validate scopes if provided
        if (scopes && scopes.length > 0) {
            const tokenScopes = validToken.scopes || [];
            const hasAllScopes = scopes.every(scope => tokenScopes.includes(scope));
            if (!hasAllScopes) {
                return res.status(200).json({ active: false });
            }
        }

        // 5. Return success
        const expiresIn = Math.floor((validToken.expires_at - new Date()) / 1000);
        return res.status(200).json({
            active: true,
            expires_in: expiresIn
        });

    } catch (error) {
        console.error('Token verification error:', error);
        return res.status(503).json({
            error_code: 'CIAM_E05_00_001'
        });
    }
}
```

### Complete Logout Endpoint

```javascript
/**
 * POST /auth/logout
 * Revokes session and all tokens
 */
async function logoutEndpoint(req, res) {
    const refreshToken = req.cookies.refresh_token;

    if (!refreshToken) {
        return res.status(200).json({
            success: true,
            message: 'Already logged out'
        });
    }

    const refreshTokenHash = sha256(refreshToken);

    try {
        return await db.transaction(async (trx) => {
            // 1. Find session via refresh token
            const token = await trx('tokens_active')
                .where({ token_value_hash: refreshTokenHash, token_type: 'REFRESH' })
                .first();

            if (!token) {
                // Token not found - already logged out
                res.clearCookie('refresh_token');
                return res.status(200).json({
                    success: true,
                    message: 'Logout successful'
                });
            }

            // 2. Update session status
            await trx('sessions')
                .where({ session_id: token.session_id })
                .update({
                    status: 'LOGGED_OUT',
                    revoked_at: new Date(),
                    revoked_by: 'user',
                    revocation_reason: 'User initiated logout'
                });

            // 3. Move all tokens to inactive with REVOKED status
            const allTokens = await trx('tokens_active')
                .where({ session_id: token.session_id })
                .del()
                .returning('*');

            await trx('tokens_inactive').insert(
                allTokens.map(t => ({
                    ...t,
                    status: 'REVOKED',
                    moved_at: new Date()
                }))
            );

            // 4. Audit log
            await trx('audit_logs').insert({
                audit_id: uuid.v4(),
                created_at: new Date(),
                event_type: 'USER_LOGOUT',
                event_category: 'AUTH',
                severity: 'INFO',
                session_id: token.session_id,
                correlation_id: req.headers['x-correlation-id'],
                ip_address: req.ip,
                event_data: { reason: 'user_initiated' }
            });

            // 5. Clear cookie
            res.clearCookie('refresh_token', {
                httpOnly: true,
                secure: true,
                sameSite: 'strict',
                path: '/'
            });

            // 6. Return success
            return res.status(200).json({
                success: true,
                message: 'Logout successful'
            });
        });

    } catch (error) {
        console.error('Logout error:', error);
        return res.status(503).json({
            error_code: 'CIAM_E05_00_001',
            message: 'Service unavailable'
        });
    }
}
```

### Utility Functions

```javascript
/**
 * Generate cryptographic hash of token
 */
function sha256(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate secure random token
 */
function generateSecureToken() {
    return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate access token (can be JWT or opaque nonce)
 */
function generateAccessToken(payload) {
    // Option 1: Opaque nonce (reference token)
    return generateSecureToken();

    // Option 2: JWT (self-contained token)
    // return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5m' });
}

/**
 * Generate refresh token (always opaque)
 */
function generateRefreshToken(payload) {
    return generateSecureToken();
}

/**
 * Generate ID token (JWT with user claims)
 */
function generateIdToken(claims) {
    return jwt.sign(
        {
            sub: claims.sub || claims.cupid,
            name: claims.name,
            email: claims.email,
            // ... other claims
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 300  // 5 minutes
        },
        process.env.JWT_SECRET,
        { algorithm: 'RS256' }
    );
}

/**
 * Parse JWT without verification (for claim extraction)
 */
function parseJwt(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
        Buffer.from(base64, 'base64')
            .toString('ascii')
            .split('')
            .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
    );
    return JSON.parse(jsonPayload);
}
```

---

## Monitoring & Operations

### Health Check Queries

```sql
-- 1. Check tokens_active table health
SELECT
    COUNT(*) as total_active_tokens,
    COUNT(*) FILTER (WHERE token_type = 'ACCESS') as access_tokens,
    COUNT(*) FILTER (WHERE token_type = 'REFRESH') as refresh_tokens,
    COUNT(*) FILTER (WHERE token_type = 'ID') as id_tokens,
    COUNT(*) FILTER (WHERE expires_at < NOW()) as expired_but_not_purged,
    COUNT(*) FILTER (WHERE session_expires_at < NOW()) as session_expired,
    CASE
        WHEN COUNT(*) > 15000000 THEN '🚨 CRITICAL - Too many active tokens'
        WHEN COUNT(*) > 10000000 THEN '⚠️ WARNING - High token count'
        ELSE '✅ HEALTHY'
    END as health_status
FROM tokens_active;

-- Expected: ~6M total tokens (2M per type)

-- 2. Check purge job performance
SELECT
    table_name,
    COUNT(*) as runs_last_24h,
    AVG(rows_deleted) as avg_rows_deleted,
    AVG(duration_ms) as avg_duration_ms,
    MAX(duration_ms) as max_duration_ms,
    MAX(run_at) as last_run,
    CASE
        WHEN MAX(run_at) < NOW() - INTERVAL '2 hours' THEN '🚨 CRITICAL - Job not running'
        WHEN MAX(duration_ms) > 30000 THEN '⚠️ WARNING - Slow purge'
        ELSE '✅ HEALTHY'
    END as health_status
FROM purge_metrics
WHERE run_at > NOW() - INTERVAL '24 hours'
GROUP BY table_name
ORDER BY table_name;

-- 3. Check partition status
SELECT
    'tokens_inactive' as table_name,
    COUNT(*) as partition_count,
    pg_size_pretty(SUM(pg_total_relation_size(schemaname || '.' || tablename))) as total_size,
    MIN(tablename) as oldest_partition,
    MAX(tablename) as newest_partition,
    CASE
        WHEN COUNT(*) < 20 THEN '⚠️ WARNING - Low partition count'
        WHEN COUNT(*) > 30 THEN '⚠️ WARNING - Too many partitions'
        ELSE '✅ HEALTHY'
    END as health_status
FROM pg_tables
WHERE tablename LIKE 'tokens_inactive_%'
UNION ALL
SELECT
    'drs_evaluations',
    COUNT(*),
    pg_size_pretty(SUM(pg_total_relation_size(schemaname || '.' || tablename))),
    MIN(tablename),
    MAX(tablename),
    CASE
        WHEN COUNT(*) < 5 THEN '⚠️ WARNING - Low partition count'
        WHEN COUNT(*) > 95 THEN '⚠️ WARNING - Too many partitions'
        ELSE '✅ HEALTHY'
    END
FROM pg_tables
WHERE tablename LIKE 'drs_evaluations_%';

-- 4. Check active sessions
SELECT
    COUNT(*) as active_sessions,
    COUNT(DISTINCT cupid) as unique_users,
    AVG(EXTRACT(EPOCH FROM (NOW() - created_at))) / 60 as avg_session_age_minutes,
    MAX(EXTRACT(EPOCH FROM (NOW() - created_at))) / 3600 as oldest_session_hours,
    CASE
        WHEN COUNT(*) > 5000000 THEN '⚠️ WARNING - High session count'
        ELSE '✅ HEALTHY'
    END as health_status
FROM sessions
WHERE status = 'ACTIVE';

-- 5. Check table bloat
SELECT * FROM v_table_health
WHERE health_status != '✅ HEALTHY'
ORDER BY dead_pct DESC;
```

### Alert Thresholds

```yaml
Critical Alerts (PagerDuty):
  tokens_active_count > 15M:
    message: "Purge job failing - active tokens not being cleaned"
    action: "Check purge_expired_tokens job status"

  purge_job_not_run > 2h:
    message: "Purge job has not run in 2+ hours"
    action: "Check pg_cron status and database connectivity"

  tokens_inactive_partitions < 10:
    message: "Partition creation job failing"
    action: "Check create_future_partitions job"

  query_duration_p99 > 100ms:
    message: "Token validation queries slow"
    action: "Check index health, run ANALYZE"

Warning Alerts (Slack):
  tokens_active_count > 10M:
    message: "High active token count"
    action: "Monitor purge job performance"

  purge_duration > 30s:
    message: "Purge job taking longer than expected"
    action: "Consider increasing batch size or frequency"

  dead_tuple_ratio > 20%:
    message: "High table bloat"
    action: "Trigger manual VACUUM"

  replication_lag > 10s:
    message: "Database replication lagging"
    action: "Check replica health"
```

### Performance Metrics

```sql
-- Token rotation performance
SELECT
    event_type,
    COUNT(*) as operations_last_hour,
    AVG(EXTRACT(EPOCH FROM (created_at - lag(created_at) OVER (ORDER BY created_at)))) * 1000 as avg_interval_ms,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (created_at - lag(created_at) OVER (ORDER BY created_at)))) * 1000 as p95_interval_ms
FROM audit_logs
WHERE event_type IN ('TOKEN_REFRESH', 'USER_LOGIN', 'USER_LOGOUT')
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY event_type;

-- Database connection pool utilization
SELECT
    COUNT(*) as total_connections,
    COUNT(*) FILTER (WHERE state = 'active') as active,
    COUNT(*) FILTER (WHERE state = 'idle') as idle,
    COUNT(*) FILTER (WHERE wait_event_type IS NOT NULL) as waiting,
    ROUND(100.0 * COUNT(*) FILTER (WHERE state = 'active') / COUNT(*), 2) as active_pct
FROM pg_stat_activity
WHERE datname = current_database();

-- Query performance (requires pg_stat_statements)
SELECT
    substring(query, 1, 80) as query_preview,
    calls,
    ROUND(mean_exec_time::numeric, 2) as avg_ms,
    ROUND(max_exec_time::numeric, 2) as max_ms,
    ROUND((total_exec_time / 1000)::numeric, 2) as total_seconds
FROM pg_stat_statements
WHERE query LIKE '%tokens_active%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

---

## Troubleshooting Guide

### Issue 1: Token Validation Always Fails

**Symptoms**: Users cannot login or refresh tokens, getting "Token expired" errors

**Diagnosis**:
```sql
-- Check if tokens exist
SELECT COUNT(*) FROM tokens_active;

-- Check if tokens are expired
SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE expires_at < NOW()) as expired_tokens,
    COUNT(*) FILTER (WHERE session_expires_at < NOW()) as expired_sessions
FROM tokens_active;

-- Check recent purge jobs
SELECT * FROM purge_metrics
WHERE table_name = 'tokens_active'
ORDER BY run_at DESC LIMIT 5;
```

**Possible Causes**:
1. **Purge job running too aggressively** → Adjust schedule or increase batch sleep time
2. **Clock skew** → Check server time synchronization
3. **Wrong timezone** → Ensure all servers use UTC

**Resolution**:
```sql
-- If purge is too aggressive, adjust:
UPDATE cron.job
SET schedule = '45 * * * *'  -- Move from :35 to :45
WHERE jobname = 'purge-expired-tokens';

-- Check and fix timezone
SHOW timezone;  -- Should be UTC
SET timezone = 'UTC';
```

---

### Issue 2: tokens_active Table Growing Unbounded

**Symptoms**: tokens_active has >15M records, performance degrading

**Diagnosis**:
```sql
-- Check job execution
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'purge-expired-tokens')
ORDER BY start_time DESC LIMIT 10;

-- Check for expired tokens not being purged
SELECT
    COUNT(*) as expired_count,
    MIN(expires_at) as oldest_expiry,
    MAX(expires_at) as newest_expiry
FROM tokens_active
WHERE expires_at < NOW();
```

**Possible Causes**:
1. **Purge job not running** → Check pg_cron status
2. **Purge job failing** → Check error logs
3. **Batch size too small** → Purge can't keep up with volume

**Resolution**:
```sql
-- Check pg_cron status
SELECT * FROM cron.job WHERE jobname LIKE 'purge-%';

-- Manually run purge
SELECT purge_expired_tokens();

-- If needed, increase batch size temporarily
SELECT batch_purge_table(
    'tokens_active',
    'expires_at < NOW()',
    50000,  -- Increased from 10000
    0.05    -- Reduced sleep
);

-- Enable pg_cron if not running
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

---

### Issue 3: Session Expired Error After 1 Hour

**Symptoms**: Users getting "Session expired" after 1 hour of activity

**Diagnosis**:
```sql
-- Check session_expires_at vs expires_at
SELECT
    token_type,
    expires_at,
    session_expires_at,
    EXTRACT(EPOCH FROM (expires_at - NOW())) / 60 as token_minutes_left,
    EXTRACT(EPOCH FROM (session_expires_at - NOW())) / 3600 as session_hours_left
FROM tokens_active
WHERE session_id = 'problematic_session_id';
```

**Possible Causes**:
1. **Bug in token rotation** → session_expires_at being overwritten instead of copied
2. **Session creation bug** → session.expires_at set to 1 hour instead of 21 hours

**Resolution**:
```javascript
// Fix in token rotation code
// ❌ WRONG: Don't create new session_expires_at
expires_at: new Date(now.getTime() + 21 * 60 * 60 * 1000)  // WRONG

// ✅ RIGHT: Copy from old token
session_expires_at: oldToken.session_expires_at  // RIGHT
```

---

### Issue 4: Partition Creation Failing

**Symptoms**: INSERT failures with "no partition of relation" error

**Diagnosis**:
```sql
-- Check partition count
SELECT COUNT(*) FROM pg_tables WHERE tablename LIKE 'tokens_inactive_%';

-- Check partition creation job
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'create-partitions-hourly')
ORDER BY start_time DESC LIMIT 5;

-- Check if current hour partition exists
SELECT tablename FROM pg_tables
WHERE tablename = 'tokens_inactive_' || TO_CHAR(NOW(), 'YYYY_MM_DD_HH24');
```

**Resolution**:
```sql
-- Manually create missing partitions
SELECT create_future_partitions();

-- Create specific partition if needed
CREATE TABLE tokens_inactive_2025_10_22_15 PARTITION OF tokens_inactive
FOR VALUES FROM ('2025-10-22 15:00:00+00') TO ('2025-10-22 16:00:00+00');
```

---

### Issue 5: Unique Constraint Violation on Rotation

**Symptoms**: Token rotation fails with "duplicate key value violates unique constraint"

**Diagnosis**:
```sql
-- Check for duplicate tokens
SELECT session_id, token_type, COUNT(*)
FROM tokens_active
GROUP BY session_id, token_type
HAVING COUNT(*) > 1;
```

**Possible Causes**:
1. **Transaction not completing** → Old tokens not deleted before new ones inserted
2. **Concurrent rotation attempts** → Race condition

**Resolution**:
```javascript
// Ensure proper transaction ordering:
await trx('tokens_active').where({ session_id }).del();  // Delete first
await trx('tokens_active').insert(newTokens);             // Then insert

// Add row-level locking to prevent concurrent rotations:
const token = await trx('tokens_active')
    .where({ token_value_hash })
    .forUpdate()  // ✅ Add this
    .first();
```

---

### Useful Debug Queries

```sql
-- Find all tokens for a specific user
SELECT
    t.*,
    s.status as session_status,
    s.created_at as session_created,
    s.expires_at as session_expires
FROM tokens_active t
JOIN sessions s ON s.session_id = t.session_id
WHERE s.cupid = 'cupid_target_user';

-- Find token rotation history
SELECT
    token_id,
    parent_token_id,
    token_type,
    status,
    created_at,
    moved_at,
    EXTRACT(EPOCH FROM (moved_at - created_at)) / 60 as lifetime_minutes
FROM tokens_inactive
WHERE session_id = 'target_session_id'
ORDER BY moved_at DESC;

-- Check if session absolute limit is being respected
SELECT
    session_id,
    created_at,
    expires_at,
    EXTRACT(EPOCH FROM (expires_at - created_at)) / 3600 as lifetime_hours,
    CASE
        WHEN EXTRACT(EPOCH FROM (expires_at - created_at)) / 3600 > 21.1 THEN '⚠️ TOO LONG'
        WHEN EXTRACT(EPOCH FROM (expires_at - created_at)) / 3600 < 20.9 THEN '⚠️ TOO SHORT'
        ELSE '✅ CORRECT'
    END as validation
FROM sessions
WHERE created_at > NOW() - INTERVAL '1 day'
LIMIT 100;
```

---

## Conclusion

This token management system provides:
- **Security**: Sliding windows prevent inactive sessions, absolute cap prevents indefinite sessions
- **Performance**: Optimized queries (50% reduction), minimal database load
- **Scalability**: Handles 5.3x design capacity (76.8M refreshes/day)
- **Auditability**: Complete token history in partitioned tables
- **Maintainability**: Clear patterns, comprehensive monitoring, detailed documentation

**Key Success Factors**:
1. Always validate both token.expires_at AND session_expires_at
2. Use DELETE RETURNING for atomic operations
3. Never update session.expires_at after creation
4. Copy session_expires_at to all tokens (denormalization)
5. Monitor purge job performance closely

**Next Steps**:
1. Deploy schema-setup-v4.sql to staging environment
2. Implement token endpoints using provided code examples
3. Configure monitoring alerts with provided thresholds
4. Load test with realistic traffic patterns (14.4M refreshes/day)
5. Validate purge jobs complete within expected time windows

---

**Document Version**: 4.0
**Last Updated**: October 2025
**Maintained By**: CIAM Backend Team
**Review Schedule**: Quarterly or after significant traffic changes
