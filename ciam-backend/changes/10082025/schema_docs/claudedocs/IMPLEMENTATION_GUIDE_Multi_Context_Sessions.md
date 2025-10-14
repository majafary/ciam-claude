# Implementation Guide: Multi-Context Session Support

## Overview

This guide explains how to implement step-up authentication with multiple authentication contexts per session. The schema enhancements enable tracking of initial authentication and subsequent step-up re-authentications within a single session lifecycle.

## Key Concepts

### Authentication Types

1. **INITIAL Authentication** (Pre-Auth)
   - First authentication attempt
   - No session exists yet
   - Creates new session upon success
   - `session_id` = NULL in auth_contexts

2. **STEP_UP Authentication** (Post-Auth)
   - Re-authentication within existing session
   - Triggered by high-risk actions
   - Links back to parent session
   - `session_id` = existing session ID in auth_contexts

### Schema Relationships

```
Session Lifecycle:
├─ Initial Auth Context (auth_type='INITIAL', session_id=NULL)
│  ├─ DRS Evaluation (session_id=NULL initially)
│  ├─ Audit Logs (session_id=NULL until session created)
│  └─ Session Created (context_id links to initial auth)
│
├─ Post-Auth Activity
│  └─ Audit Logs (context_id=NULL, session_id populated)
│
└─ Step-Up Auth Contexts (auth_type='STEP_UP', session_id=parent session)
   ├─ DRS Evaluation (session_id=parent session)
   └─ Audit Logs (context_id=step-up context, session_id=parent session)
```

## Implementation Patterns

### Pattern 1: Initial Authentication Flow

#### Step 1: Create Auth Context (Pre-Auth)

```javascript
// Create initial authentication context
const contextId = uuid();
await db.query(`
  INSERT INTO auth_contexts (
    context_id,
    auth_type,
    session_id,     -- NULL for initial auth
    guid,
    cupid,
    username,
    ip_address,
    device_fingerprint,
    app_id,
    app_version
  ) VALUES ($1, 'INITIAL', NULL, $2, $3, $4, $5, $6, $7, $8)
`, [contextId, guid, cupid, username, ipAddress, deviceFingerprint, appId, appVersion]);
```

#### Step 2: Request DRS Evaluation

```javascript
// Get DRS risk assessment
const drsResponse = await transmitDRS.evaluate({
  actionToken: drsActionToken,
  userId: cupid,
  // ... other DRS params
});

// Store DRS evaluation (session_id still NULL)
await db.query(`
  INSERT INTO drs_evaluations (
    evaluation_id,
    context_id,
    session_id,     -- NULL for initial auth
    guid,
    cupid,
    device_id,
    recommendation,
    risk_score,
    browser,
    operating_system,
    has_high_risk_signals,
    signal_types,
    raw_response
  ) VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
`, [
  uuid(),
  contextId,
  guid,
  cupid,
  drsResponse.deviceId,
  drsResponse.recommendation,
  drsResponse.riskScore,
  // ... extract other fields from drsResponse
]);
```

#### Step 3: Log Pre-Auth Events

```javascript
// Log authentication initiated
await db.query(`
  INSERT INTO audit_logs (
    audit_id,
    event_type,
    event_category,
    severity,
    auth_type,
    cupid,
    context_id,
    session_id,     -- NULL until session created
    ip_address,
    user_agent,
    event_data
  ) VALUES ($1, 'LOGIN_INITIATED', 'AUTH', 'INFO', 'INITIAL',
            $2, $3, NULL, $4, $5, $6)
`, [uuid(), cupid, contextId, ipAddress, userAgent, {}]);
```

#### Step 4: Authentication Success - Create Session

```javascript
// Authentication succeeded - create session
const sessionId = uuid();
await db.query(`
  INSERT INTO sessions (
    session_id,
    context_id,     -- Links to initial auth context
    cupid,
    device_fingerprint,
    ip_address,
    user_agent,
    status
  ) VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
`, [sessionId, contextId, cupid, deviceFingerprint, ipAddress, userAgent]);

// Update auth context outcome
await db.query(`
  UPDATE auth_contexts
  SET auth_outcome = 'SUCCESS',
      completed_at = NOW()
  WHERE context_id = $1
`, [contextId]);

// Log success with session_id
await db.query(`
  INSERT INTO audit_logs (
    audit_id,
    event_type,
    event_category,
    severity,
    auth_type,
    cupid,
    context_id,
    session_id,     -- Now populated with new session
    ip_address,
    event_data
  ) VALUES ($1, 'LOGIN_SUCCESS', 'AUTH', 'INFO', 'INITIAL',
            $2, $3, $4, $5, $6)
`, [uuid(), cupid, contextId, sessionId, ipAddress, {
  mfa_used: true,
  device_trusted: false
}]);
```

---

### Pattern 2: Step-Up Authentication Flow

#### Use Case Triggers

Step-up authentication should be triggered for:
- High-value transactions (e.g., >$10,000 transfer)
- Sensitive account changes (email, password, 2FA settings)
- Privileged operations (admin actions, data exports)
- Risk-based decisions (unusual location, new device with high-risk score)

#### Step 1: Detect Step-Up Requirement

```javascript
async function requiresStepUp(sessionId, action) {
  // Check if session is still valid
  const session = await db.query(`
    SELECT s.*, ac.completed_at as last_auth
    FROM sessions s
    JOIN auth_contexts ac ON ac.context_id = s.context_id
    WHERE s.session_id = $1 AND s.status = 'ACTIVE'
  `, [sessionId]);

  if (!session) {
    throw new Error('Invalid session');
  }

  // Define step-up policies
  const HIGH_VALUE_THRESHOLD = 10000;
  const STEP_UP_TIME_WINDOW = 15 * 60 * 1000; // 15 minutes

  const timeSinceLastAuth = Date.now() - new Date(session.last_auth).getTime();

  // Step-up required if:
  if (
    action.type === 'SENSITIVE_CHANGE' ||           // Sensitive account change
    action.value > HIGH_VALUE_THRESHOLD ||          // High-value transaction
    timeSinceLastAuth > STEP_UP_TIME_WINDOW        // Recent auth expired
  ) {
    return true;
  }

  return false;
}
```

#### Step 2: Initiate Step-Up Authentication

```javascript
async function initiateStepUp(sessionId, userId, action) {
  // Create new auth context for step-up (session already exists)
  const stepUpContextId = uuid();

  await db.query(`
    INSERT INTO auth_contexts (
      context_id,
      auth_type,
      session_id,     -- ← Link to existing session
      guid,
      cupid,
      username,
      ip_address,
      device_fingerprint,
      app_id,
      app_version
    ) VALUES ($1, 'STEP_UP', $2, $3, $4, $5, $6, $7, $8, $9)
  `, [
    stepUpContextId,
    sessionId,        // ← Existing session ID
    user.guid,
    user.cupid,
    user.username,
    req.ip,
    user.deviceFingerprint,
    user.appId,
    user.appVersion
  ]);

  // Log step-up initiation
  await db.query(`
    INSERT INTO audit_logs (
      audit_id,
      event_type,
      event_category,
      severity,
      auth_type,
      cupid,
      context_id,
      session_id,
      ip_address,
      event_data
    ) VALUES ($1, 'STEP_UP_INITIATED', 'AUTH', 'INFO', 'STEP_UP',
              $2, $3, $4, $5, $6)
  `, [uuid(), userId, stepUpContextId, sessionId, req.ip, {
    action_type: action.type,
    action_details: action.details,
    reason: 'HIGH_VALUE_TRANSACTION'
  }]);

  return stepUpContextId;
}
```

#### Step 3: DRS Evaluation for Step-Up

```javascript
async function evaluateStepUpRisk(stepUpContextId, sessionId, userId) {
  // Get DRS evaluation for step-up attempt
  const drsResponse = await transmitDRS.evaluate({
    actionToken: generateDRSToken(),
    userId: userId,
    sessionId: sessionId,  // Include session context
    // ... other params
  });

  // Store DRS evaluation with session_id populated
  await db.query(`
    INSERT INTO drs_evaluations (
      evaluation_id,
      context_id,
      session_id,     -- ← Populated for step-up
      guid,
      cupid,
      device_id,
      recommendation,
      risk_score,
      has_high_risk_signals,
      signal_types,
      raw_response
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  `, [
    uuid(),
    stepUpContextId,
    sessionId,        // ← Link to existing session
    user.guid,
    user.cupid,
    drsResponse.deviceId,
    drsResponse.recommendation,
    drsResponse.riskScore,
    drsResponse.hasHighRiskSignals,
    drsResponse.signalTypes,
    drsResponse.rawResponse
  ]);

  return drsResponse;
}
```

#### Step 4: Complete Step-Up Authentication

```javascript
async function completeStepUp(stepUpContextId, sessionId, outcome) {
  // Update step-up context outcome
  await db.query(`
    UPDATE auth_contexts
    SET auth_outcome = $1,
        completed_at = NOW()
    WHERE context_id = $2
  `, [outcome, stepUpContextId]);

  // Log step-up completion
  await db.query(`
    INSERT INTO audit_logs (
      audit_id,
      event_type,
      event_category,
      severity,
      auth_type,
      cupid,
      context_id,
      session_id,
      ip_address,
      event_data
    ) VALUES ($1, $2, 'AUTH', $3, 'STEP_UP', $4, $5, $6, $7, $8)
  `, [
    uuid(),
    outcome === 'SUCCESS' ? 'STEP_UP_SUCCESS' : 'STEP_UP_FAILED',
    outcome === 'SUCCESS' ? 'INFO' : 'WARN',
    userId,
    stepUpContextId,
    sessionId,
    req.ip,
    {
      outcome: outcome,
      mfa_method: 'sms',
      attempts: 1
    }
  ]);

  if (outcome === 'SUCCESS') {
    // Allow high-risk action to proceed
    return { allowed: true, sessionId };
  } else {
    // Deny action or revoke session based on policy
    return { allowed: false, reason: 'STEP_UP_FAILED' };
  }
}
```

---

### Pattern 3: Querying Session Lifecycle

#### Query 1: Get All Auth Contexts for Session

```javascript
async function getSessionAuthTimeline(sessionId) {
  const result = await db.query(`
    SELECT
      context_id,
      auth_type,
      auth_outcome,
      risk_score,
      recommendation,
      auth_started_at,
      auth_completed_at
    FROM v_login_activity
    WHERE session_id = $1
    ORDER BY auth_started_at
  `, [sessionId]);

  return result.rows;
}

// Example response:
// [
//   {
//     context_id: 'ctx-abc-123',
//     auth_type: 'INITIAL',
//     auth_outcome: 'SUCCESS',
//     risk_score: 25,
//     recommendation: 'ALLOW',
//     auth_started_at: '2025-10-14T10:00:00Z',
//     auth_completed_at: '2025-10-14T10:00:15Z'
//   },
//   {
//     context_id: 'ctx-def-456',
//     auth_type: 'STEP_UP',
//     auth_outcome: 'SUCCESS',
//     risk_score: 15,
//     recommendation: 'ALLOW',
//     auth_started_at: '2025-10-14T10:15:30Z',
//     auth_completed_at: '2025-10-14T10:15:45Z'
//   }
// ]
```

#### Query 2: Complete Audit Trail for Session

```javascript
async function getSessionAuditTrail(sessionId) {
  const result = await db.query(`
    SELECT
      a.audit_id,
      a.event_type,
      a.auth_type,
      a.context_id,
      a.severity,
      a.event_data,
      a.created_at
    FROM audit_logs a
    WHERE a.session_id = $1
       OR a.context_id IN (
           SELECT context_id FROM sessions WHERE session_id = $1
           UNION
           SELECT context_id FROM auth_contexts WHERE session_id = $1
       )
    ORDER BY a.created_at
  `, [sessionId]);

  return result.rows;
}
```

#### Query 3: Detect Suspicious Step-Up Patterns

```javascript
async function detectSuspiciousStepUps(userId) {
  // Find users with unusual step-up frequency
  const result = await db.query(`
    SELECT
      cupid,
      total_sessions,
      step_up_auths,
      step_up_session_percentage
    FROM v_step_up_frequency
    WHERE cupid = $1
      AND step_up_session_percentage > 50  -- More than 50% sessions require step-up
  `, [userId]);

  if (result.rows.length > 0) {
    return {
      suspicious: true,
      reason: 'HIGH_STEP_UP_FREQUENCY',
      details: result.rows[0]
    };
  }

  return { suspicious: false };
}
```

---

## Fraud Detection Use Cases

### Use Case 1: IP Velocity Check (Including Step-Ups)

```javascript
async function checkIPVelocity(ipAddress, timeWindowMinutes = 10) {
  const result = await db.query(`
    SELECT
      ip_address,
      auth_type,
      COUNT(*) as attempt_count,
      COUNT(*) FILTER (WHERE auth_outcome = 'SUCCESS') as successful,
      COUNT(*) FILTER (WHERE auth_outcome != 'SUCCESS') as failed,
      array_agg(DISTINCT cupid) as affected_users
    FROM v_login_activity
    WHERE ip_address = $1
      AND auth_started_at > NOW() - INTERVAL '${timeWindowMinutes} minutes'
    GROUP BY ip_address, auth_type
  `, [ipAddress]);

  const threshold = 20; // Max attempts per IP in time window

  if (result.rows[0]?.attempt_count > threshold) {
    return {
      blocked: true,
      reason: 'IP_VELOCITY_EXCEEDED',
      attempts: result.rows[0].attempt_count,
      threshold: threshold
    };
  }

  return { blocked: false };
}
```

### Use Case 2: User Velocity Check

```javascript
async function checkUserVelocity(userId, timeWindowMinutes = 10) {
  const result = await db.query(`
    SELECT
      cupid,
      COUNT(*) as attempt_count,
      COUNT(*) FILTER (WHERE auth_outcome = 'FAILED') as failed_count,
      COUNT(DISTINCT ip_address) as distinct_ips,
      COUNT(DISTINCT device_fingerprint) as distinct_devices
    FROM v_login_activity
    WHERE cupid = $1
      AND auth_started_at > NOW() - INTERVAL '${timeWindowMinutes} minutes'
    GROUP BY cupid
  `, [userId]);

  const flags = [];

  if (result.rows[0]?.failed_count >= 3) {
    flags.push('MULTIPLE_FAILED_ATTEMPTS');
  }

  if (result.rows[0]?.distinct_ips > 5) {
    flags.push('MULTIPLE_IPS');
  }

  if (result.rows[0]?.distinct_devices > 3) {
    flags.push('MULTIPLE_DEVICES');
  }

  return {
    suspicious: flags.length > 0,
    flags: flags,
    details: result.rows[0]
  };
}
```

### Use Case 3: High-Risk Session Monitoring

```javascript
async function monitorHighRiskSessions() {
  const result = await db.query(`
    SELECT
      session_id,
      cupid,
      auth_sequence,
      auth_type,
      risk_score,
      recommendation,
      has_high_risk_signals,
      auth_time
    FROM v_session_auth_timeline
    WHERE has_high_risk_signals = true
      AND auth_time > NOW() - INTERVAL '1 hour'
    ORDER BY risk_score DESC
  `);

  return result.rows.map(row => ({
    sessionId: row.session_id,
    userId: row.cupid,
    riskScore: row.risk_score,
    authType: row.auth_type,
    recommendation: row.recommendation,
    timestamp: row.auth_time,
    action: row.risk_score >= 70 ? 'REVOKE_SESSION' : 'MONITOR'
  }));
}
```

---

## Best Practices

### 1. Always Populate session_id for Step-Ups

```javascript
// ✅ CORRECT: Link step-up context to session
INSERT INTO auth_contexts (
  context_id, auth_type, session_id, ...
) VALUES (
  uuid(), 'STEP_UP', existingSessionId, ...
);

// ❌ WRONG: Missing session_id breaks linkage
INSERT INTO auth_contexts (
  context_id, auth_type, session_id, ...
) VALUES (
  uuid(), 'STEP_UP', NULL, ...  -- Don't do this!
);
```

### 2. Use Consistent auth_type Values

```javascript
// ✅ CORRECT: Use defined enum values
const AUTH_TYPE = {
  INITIAL: 'INITIAL',
  STEP_UP: 'STEP_UP'
};

// ❌ WRONG: Inconsistent values
auth_type: 'initial'  // lowercase
auth_type: 'stepup'   // no underscore
auth_type: 'REAUTH'   // different term
```

### 3. Always Log to audit_logs with Proper Context

```javascript
// ✅ CORRECT: Include all context
await logAuditEvent({
  eventType: 'STEP_UP_SUCCESS',
  authType: 'STEP_UP',
  contextId: stepUpContextId,
  sessionId: existingSessionId,  // Link to session
  userId: userId,
  eventData: { /* details */ }
});
```

### 4. Query Performance: Use Views

```javascript
// ✅ CORRECT: Use optimized views
const timeline = await db.query(`
  SELECT * FROM v_session_auth_timeline
  WHERE session_id = $1
`, [sessionId]);

// ⚠️ LESS OPTIMAL: Manual joins (view does this better)
const timeline = await db.query(`
  SELECT ... FROM auth_contexts ac
  JOIN sessions s ...
  LEFT JOIN drs_evaluations ...
  WHERE ...
`, [sessionId]);
```

---

## Testing Scenarios

### Test 1: Initial Auth → Session → Step-Up

```javascript
describe('Multi-Context Session Support', () => {
  it('should create initial auth, session, and step-up auth', async () => {
    // 1. Initial authentication
    const initialContextId = await createAuthContext({
      authType: 'INITIAL',
      sessionId: null,
      userId: 'user123'
    });

    // 2. Auth succeeds, create session
    const sessionId = await createSession({
      contextId: initialContextId,
      userId: 'user123'
    });

    // 3. User performs high-risk action
    const stepUpContextId = await createAuthContext({
      authType: 'STEP_UP',
      sessionId: sessionId,  // Link to existing session
      userId: 'user123'
    });

    // 4. Verify timeline
    const timeline = await getSessionAuthTimeline(sessionId);
    expect(timeline).toHaveLength(2);
    expect(timeline[0].auth_type).toBe('INITIAL');
    expect(timeline[1].auth_type).toBe('STEP_UP');
    expect(timeline[1].session_id).toBe(sessionId);
  });
});
```

---

## Migration Checklist

- [ ] Run schema enhancement SQL script
- [ ] Verify columns added: `auth_contexts.session_id`, `auth_contexts.auth_type`, `drs_evaluations.session_id`, `audit_logs.auth_type`
- [ ] Verify indexes created successfully
- [ ] Verify views created: `v_login_activity`, `v_session_auth_timeline`, `v_step_up_frequency`, `v_high_risk_logins`
- [ ] Update application code to populate `session_id` for step-up scenarios
- [ ] Update application code to set `auth_type = 'STEP_UP'` for re-authentication
- [ ] Test initial authentication flow (session_id = NULL)
- [ ] Test step-up authentication flow (session_id = existing session)
- [ ] Verify queries work with new schema
- [ ] Update monitoring dashboards to use new views
- [ ] Document step-up authentication policies

---

## Support & Questions

For questions about this implementation:
1. Review the SQL comments in `schema-enhancement-multi-context-sessions.sql`
2. Check the example queries in the SQL file
3. Test with the provided patterns above
4. Consult the schema documentation in `schema-setup.sql`
