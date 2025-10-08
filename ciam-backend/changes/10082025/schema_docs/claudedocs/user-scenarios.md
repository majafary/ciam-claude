# CIAM Database - User Journey Scenarios

**Purpose:** Complete user journey walkthroughs with SQL queries and sample data
**Database:** PostgreSQL 14+
**Date:** October 2025

---

## Table of Contents

1. [Simple Login (No Additional Steps)](#scenario-1-simple-login)
2. [MFA with SMS OTP (Success First Try)](#scenario-2-mfa-with-sms-otp-success)
3. [MFA with SMS OTP (Retry After Incorrect)](#scenario-3-mfa-with-sms-otp-retry)
4. [MFA with Push Notification](#scenario-4-mfa-with-push-notification)
5. [Full Journey (MFA → eSign → Device Bind)](#scenario-5-full-journey)
6. [Token Refresh](#scenario-6-token-refresh)
7. [Session Revocation by Agent](#scenario-7-session-revocation)
8. [Trusted Device Login (MFA Skip)](#scenario-8-trusted-device-login)

---

## Scenario 1: Simple Login (No Additional Steps)

**Use Case:** User with no MFA/eSign requirements logs in directly

### Step 1: POST /auth/login

**API Request:**
```json
POST /auth/login
{
  "username": "simpleuser",
  "password": "SecurePass123!",
  "app_id": "web-banking",
  "app_version": "1.2.3",
  "drs_action_token": "eyJhbGc...DRS_TOKEN..."
}
Headers: {
  "x-correlation-id": "corr-550e8400-0001",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)..."
}
```

**Database Operations:**

```sql
-- 1. Validate credentials via LDAP (external)
-- LDAP returns: CUPID_SIMPLE_001, valid=true, mfa_required=false

-- 2. Call DRS API (external)
-- DRS returns: recommendation=ALLOW, risk_score=25

BEGIN;

-- 3. Create auth_context
INSERT INTO auth_contexts (
    context_id, cupid, app_id, app_version,
    device_fingerprint, ip_address, correlation_id,
    requires_additional_steps, auth_outcome, completed_at,
    created_at, expires_at
) VALUES (
    '550e8400-e29b-41d4-a716-446655440001',
    'CUPID_SIMPLE_001',
    'web-banking',
    '1.2.3',
    'fp_abc123xyz',
    '192.168.1.100',
    'corr-550e8400-0001',
    FALSE,
    'SUCCESS',
    NOW(),
    NOW(),
    NOW() + INTERVAL '15 minutes'
)
RETURNING context_id;

-- Result: context_id = 550e8400-e29b-41d4-a716-446655440001

-- 4. Store DRS evaluation
INSERT INTO drs_evaluations (
    evaluation_id, context_id, cupid,
    action_token_hash, device_id, recommendation, risk_score,
    signals, device_attributes, raw_response
) VALUES (
    gen_random_uuid(),
    '550e8400-e29b-41d4-a716-446655440001',
    'CUPID_SIMPLE_001',
    'sha256_hash_of_drs_token',
    'drs_dev_abc123',
    'ALLOW',
    25,
    '[]'::jsonb,
    '{"browser": "Chrome 120", "os": "Windows 11", "is_mobile": false}'::jsonb,
    '{"recommendation": "ALLOW", "risk_score": 25, "device_id": "drs_dev_abc123"}'::jsonb
);

-- 5. Create session
INSERT INTO sessions (
    session_id, context_id, cupid, device_fingerprint,
    ip_address, user_agent, status,
    created_at, last_activity_at, expires_at
) VALUES (
    'sess-550e8400-0001',
    '550e8400-e29b-41d4-a716-446655440001',
    'CUPID_SIMPLE_001',
    'fp_abc123xyz',
    '192.168.1.100',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'ACTIVE',
    NOW(),
    NOW(),
    NOW() + INTERVAL '30 days'
)
RETURNING session_id;

-- Result: session_id = sess-550e8400-0001

-- 6. Create tokens
INSERT INTO tokens (token_id, session_id, token_type, token_value, token_value_hash, expires_at, status)
VALUES
    ('token-access-001', 'sess-550e8400-0001', 'ACCESS',
     'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ACCESS_TOKEN_PAYLOAD.SIGNATURE',
     'sha256_access_hash',
     NOW() + INTERVAL '15 minutes', 'ACTIVE'),

    ('token-refresh-001', 'sess-550e8400-0001', 'REFRESH',
     'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.REFRESH_TOKEN_PAYLOAD.SIGNATURE',
     'sha256_refresh_hash',
     NOW() + INTERVAL '30 days', 'ACTIVE'),

    ('token-id-001', 'sess-550e8400-0001', 'ID',
     'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ID_TOKEN_PAYLOAD.SIGNATURE',
     'sha256_id_hash',
     NOW() + INTERVAL '15 minutes', 'ACTIVE');

-- 7. Log to audit
INSERT INTO audit_logs (
    audit_id, event_type, event_category, severity,
    cupid, context_id, session_id, correlation_id,
    ip_address, user_agent, event_data, created_at
) VALUES
    (gen_random_uuid(), 'DRS_EVALUATION', 'AUTH', 'INFO',
     'CUPID_SIMPLE_001', '550e8400-e29b-41d4-a716-446655440001', NULL, 'corr-550e8400-0001',
     '192.168.1.100', 'Mozilla/5.0...',
     '{"recommendation": "ALLOW", "risk_score": 25}'::jsonb, NOW()),

    (gen_random_uuid(), 'LOGIN_SUCCESS', 'AUTH', 'INFO',
     'CUPID_SIMPLE_001', '550e8400-e29b-41d4-a716-446655440001', 'sess-550e8400-0001', 'corr-550e8400-0001',
     '192.168.1.100', 'Mozilla/5.0...',
     '{"requires_additional_steps": false}'::jsonb, NOW());

COMMIT;
```

**API Response:**
```json
HTTP 201 Created
Set-Cookie: refresh_token=eyJhbGc...REFRESH_TOKEN...; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000

{
  "response_type_code": "SUCCESS",
  "context_id": "550e8400-e29b-41d4-a716-446655440001",
  "access_token": "eyJhbGc...ACCESS_TOKEN...",
  "id_token": "eyJhbGc...ID_TOKEN...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

**Final Database State:**
```
auth_contexts:        1 row (outcome=SUCCESS, no transactions)
auth_transactions:    0 rows
drs_evaluations:      1 row
sessions:             1 row (status=ACTIVE)
tokens:               3 rows (all ACTIVE)
audit_logs:           2 entries
```

---

## Scenario 2: MFA with SMS OTP (Success First Try)

**Use Case:** User requires MFA, receives SMS OTP, enters correct code on first try

### Step 1: POST /auth/login

**API Request:**
```json
POST /auth/login
{
  "username": "mfauser",
  "password": "SecurePass123!",
  "app_id": "web-banking",
  "app_version": "1.2.3"
}
```

**Database Operations:**

```sql
-- LDAP returns: CUPID_MFA_001, mfa_required=true, otp_methods=[...]

BEGIN;

-- 1. Create auth_context
INSERT INTO auth_contexts (
    context_id, cupid, app_id, app_version,
    device_fingerprint, ip_address, correlation_id,
    requires_additional_steps,
    created_at, expires_at
) VALUES (
    '550e8400-e29b-41d4-a716-446655440002',
    'CUPID_MFA_001',
    'web-banking',
    '1.2.3',
    'fp_def456',
    '192.168.1.101',
    'corr-550e8400-0002',
    TRUE,
    NOW(),
    NOW() + INTERVAL '15 minutes'
);

-- 2. Store DRS evaluation
INSERT INTO drs_evaluations (
    evaluation_id, context_id, cupid,
    action_token_hash, recommendation, risk_score,
    signals, raw_response
) VALUES (
    gen_random_uuid(),
    '550e8400-e29b-41d4-a716-446655440002',
    'CUPID_MFA_001',
    'sha256_hash',
    'CHALLENGE',
    65,
    '[{"type": "NEW_LOCATION", "severity": "MEDIUM"}]'::jsonb,
    '{"recommendation": "CHALLENGE", "risk_score": 65}'::jsonb
);

-- 3. Create T1 (MFA initiation pending)
INSERT INTO auth_transactions (
    transaction_id, context_id,
    transaction_type, transaction_status, sequence_number,
    phase, mfa_options, mobile_approve_status,
    created_at, expires_at
) VALUES (
    'tx-550e8400-0001',
    '550e8400-e29b-41d4-a716-446655440002',
    'MFA_INITIATE',
    'PENDING',
    1,
    'MFA',
    '[
        {"phone_last_four": "1234", "mfa_option_id": 1},
        {"phone_last_four": "5678", "mfa_option_id": 2}
    ]'::jsonb,
    'ENABLED',
    NOW(),
    NOW() + INTERVAL '5 minutes'
);

-- 4. Log to audit
INSERT INTO audit_logs (
    event_type, event_category, severity,
    cupid, context_id, transaction_id,
    event_data
) VALUES (
    'LOGIN_MFA_REQUIRED', 'AUTH', 'INFO',
    'CUPID_MFA_001', '550e8400-e29b-41d4-a716-446655440002', 'tx-550e8400-0001',
    '{"otp_methods_count": 2, "mobile_approve_status": "ENABLED"}'::jsonb
);

COMMIT;
```

**API Response:**
```json
HTTP 200 OK
{
  "response_type_code": "MFA_REQUIRED",
  "context_id": "550e8400-e29b-41d4-a716-446655440002",
  "transaction_id": "tx-550e8400-0001",
  "otp_methods": [
    {"phone_last_four": "1234", "mfa_option_id": 1},
    {"phone_last_four": "5678", "mfa_option_id": 2}
  ],
  "mobile_approve_status": "ENABLED"
}
```

---

### Step 2: POST /auth/mfa/initiate

**API Request:**
```json
POST /auth/mfa/initiate
{
  "context_id": "550e8400-e29b-41d4-a716-446655440002",
  "transaction_id": "tx-550e8400-0001",
  "method": "sms",
  "mfa_option_id": 1
}
```

**Database Operations:**

```sql
BEGIN;

-- 1. Validate T1
SELECT transaction_id, context_id, transaction_status, sequence_number
FROM auth_transactions
WHERE transaction_id = 'tx-550e8400-0001'
  AND context_id = '550e8400-e29b-41d4-a716-446655440002'
  AND transaction_status = 'PENDING'
  AND expires_at > NOW();

-- Result: Found (T1 is valid and pending)

-- 2. Consume T1
UPDATE auth_transactions
SET transaction_status = 'CONSUMED',
    consumed_at = NOW()
WHERE transaction_id = 'tx-550e8400-0001'
RETURNING transaction_id;

-- 3. Generate OTP (application logic)
-- OTP = "123456" (sent via SMS provider)
-- Store bcrypt hash for validation

-- 4. Create T2 (OTP verification pending)
INSERT INTO auth_transactions (
    transaction_id, context_id,
    transaction_type, transaction_status,
    sequence_number, parent_transaction_id,
    phase, mfa_method, mfa_option_id, attempt_number,
    created_at, expires_at
) VALUES (
    'tx-550e8400-0002',
    '550e8400-e29b-41d4-a716-446655440002',
    'MFA_VERIFY',
    'PENDING',
    2,
    'tx-550e8400-0001',
    'MFA',
    'sms',
    1,
    1,
    NOW(),
    NOW() + INTERVAL '5 minutes'
)
RETURNING transaction_id, expires_at;

-- 5. Log to audit
INSERT INTO audit_logs (
    event_type, event_category, severity,
    cupid, context_id, transaction_id,
    event_data
) VALUES (
    'MFA_CHALLENGE_SENT', 'MFA', 'INFO',
    'CUPID_MFA_001', '550e8400-e29b-41d4-a716-446655440002', 'tx-550e8400-0002',
    '{"method": "sms", "phone_last_four": "1234"}'::jsonb
);

COMMIT;
```

**API Response:**
```json
HTTP 200 OK
{
  "success": true,
  "transaction_id": "tx-550e8400-0002",
  "expires_at": "2025-10-08T10:05:00Z"
}
```

---

### Step 3: POST /auth/mfa/otp/verify (Success)

**API Request:**
```json
POST /auth/mfa/otp/verify
{
  "context_id": "550e8400-e29b-41d4-a716-446655440002",
  "transaction_id": "tx-550e8400-0002",
  "code": "123456"
}
```

**Database Operations:**

```sql
BEGIN;

-- 1. Lookup T2
SELECT transaction_id, context_id, attempt_number
FROM auth_transactions
WHERE transaction_id = 'tx-550e8400-0002'
  AND context_id = '550e8400-e29b-41d4-a716-446655440002'
  AND transaction_status = 'PENDING'
  AND expires_at > NOW();

-- Result: Found (T2 is valid)

-- 2. Validate OTP (application logic with stored hash)
-- bcrypt.compare("123456", stored_hash) → TRUE

-- 3. Mark T2 as consumed (success)
UPDATE auth_transactions
SET transaction_status = 'CONSUMED',
    verification_result = 'CORRECT',
    consumed_at = NOW()
WHERE transaction_id = 'tx-550e8400-0002';

-- 4. Check if more steps needed (application logic)
-- No eSign, no device bind → Complete

-- 5. Mark context complete
UPDATE auth_contexts
SET auth_outcome = 'SUCCESS',
    completed_at = NOW()
WHERE context_id = '550e8400-e29b-41d4-a716-446655440002';

-- 6. Create session
INSERT INTO sessions (
    session_id, context_id, cupid, device_fingerprint,
    ip_address, status, created_at, expires_at
) VALUES (
    'sess-550e8400-0002',
    '550e8400-e29b-41d4-a716-446655440002',
    'CUPID_MFA_001',
    'fp_def456',
    '192.168.1.101',
    'ACTIVE',
    NOW(),
    NOW() + INTERVAL '30 days'
)
RETURNING session_id;

-- 7. Create tokens
INSERT INTO tokens (token_id, session_id, token_type, token_value, token_value_hash, expires_at, status)
VALUES
    ('token-access-002', 'sess-550e8400-0002', 'ACCESS', 'eyJhbGc...', 'sha256_hash', NOW() + INTERVAL '15 minutes', 'ACTIVE'),
    ('token-refresh-002', 'sess-550e8400-0002', 'REFRESH', 'eyJhbGc...', 'sha256_hash', NOW() + INTERVAL '30 days', 'ACTIVE'),
    ('token-id-002', 'sess-550e8400-0002', 'ID', 'eyJhbGc...', 'sha256_hash', NOW() + INTERVAL '15 minutes', 'ACTIVE');

-- 8. Log to audit
INSERT INTO audit_logs (
    event_type, event_category, severity,
    cupid, context_id, transaction_id, session_id,
    event_data
) VALUES
    ('MFA_VERIFY_SUCCESS', 'MFA', 'INFO',
     'CUPID_MFA_001', '550e8400-e29b-41d4-a716-446655440002', 'tx-550e8400-0002', 'sess-550e8400-0002',
     '{"method": "sms", "attempt": 1}'::jsonb),

    ('LOGIN_SUCCESS', 'AUTH', 'INFO',
     'CUPID_MFA_001', '550e8400-e29b-41d4-a716-446655440002', NULL, 'sess-550e8400-0002',
     '{}'::jsonb);

COMMIT;
```

**API Response:**
```json
HTTP 201 Created
Set-Cookie: refresh_token=eyJhbGc...; HttpOnly; Secure

{
  "response_type_code": "SUCCESS",
  "context_id": "550e8400-e29b-41d4-a716-446655440002",
  "transaction_id": "tx-550e8400-0002",
  "access_token": "eyJhbGc...",
  "id_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

**Final Database State:**
```
auth_contexts:        1 row (outcome=SUCCESS)
auth_transactions:    2 rows (T1=CONSUMED, T2=CONSUMED)
drs_evaluations:      1 row
sessions:             1 row (ACTIVE)
tokens:               3 rows (ACTIVE)
audit_logs:           5 entries
```

---

## Scenario 3: MFA with SMS OTP (Retry After Incorrect)

**Use Case:** User enters incorrect OTP, then retries successfully

### Steps 1-2: Same as Scenario 2 (login + initiate MFA)

### Step 3a: POST /auth/mfa/otp/verify (Incorrect)

**API Request:**
```json
POST /auth/mfa/otp/verify
{
  "context_id": "550e8400-e29b-41d4-a716-446655440002",
  "transaction_id": "tx-550e8400-0002",
  "code": "999999"
}
```

**Database Operations:**

```sql
BEGIN;

-- 1. Lookup T2
SELECT transaction_id, attempt_number
FROM auth_transactions
WHERE transaction_id = 'tx-550e8400-0002'
  AND transaction_status = 'PENDING';

-- 2. Validate OTP (application logic)
-- bcrypt.compare("999999", stored_hash) → FALSE

-- 3. Mark T2 as consumed (failed)
UPDATE auth_transactions
SET transaction_status = 'CONSUMED',
    verification_result = 'INCORRECT',
    consumed_at = NOW()
WHERE transaction_id = 'tx-550e8400-0002';

-- 4. Create T3 (retry available)
INSERT INTO auth_transactions (
    transaction_id, context_id,
    transaction_type, transaction_status,
    sequence_number, parent_transaction_id,
    phase, mfa_method, attempt_number,
    created_at, expires_at
) VALUES (
    'tx-550e8400-0003',
    '550e8400-e29b-41d4-a716-446655440002',
    'MFA_INITIATE',
    'PENDING',
    3,
    'tx-550e8400-0002',
    'MFA',
    'sms',
    2,
    NOW(),
    NOW() + INTERVAL '5 minutes'
);

-- 5. Log to audit
INSERT INTO audit_logs (
    event_type, event_category, severity,
    cupid, context_id, transaction_id,
    event_data
) VALUES (
    'MFA_VERIFY_FAILED', 'MFA', 'WARN',
    'CUPID_MFA_001', '550e8400-e29b-41d4-a716-446655440002', 'tx-550e8400-0002',
    '{"reason": "incorrect_code", "attempt": 1}'::jsonb
);

COMMIT;
```

**API Response:**
```json
HTTP 400 Bad Request
{
  "error_code": "CIAM_E01_01_017",
  "context_id": "550e8400-e29b-41d4-a716-446655440002",
  "transaction_id": "tx-550e8400-0003"
}
```

### Step 3b: POST /auth/mfa/initiate (Retry)

**API Request:**
```json
POST /auth/mfa/initiate
{
  "context_id": "550e8400-e29b-41d4-a716-446655440002",
  "transaction_id": "tx-550e8400-0003",
  "method": "sms",
  "mfa_option_id": 1
}
```

**Database Operations:**

```sql
BEGIN;

-- 1. Validate T3
SELECT transaction_id, attempt_number
FROM auth_transactions
WHERE transaction_id = 'tx-550e8400-0003'
  AND transaction_status = 'PENDING';

-- 2. Consume T3
UPDATE auth_transactions
SET transaction_status = 'CONSUMED',
    consumed_at = NOW()
WHERE transaction_id = 'tx-550e8400-0003';

-- 3. Generate new OTP (application logic)
-- New OTP = "654321"

-- 4. Create T4 (new verification pending)
INSERT INTO auth_transactions (
    transaction_id, context_id,
    transaction_type, transaction_status,
    sequence_number, parent_transaction_id,
    phase, mfa_method, mfa_option_id, attempt_number,
    created_at, expires_at
) VALUES (
    'tx-550e8400-0004',
    '550e8400-e29b-41d4-a716-446655440002',
    'MFA_VERIFY',
    'PENDING',
    4,
    'tx-550e8400-0003',
    'MFA',
    'sms',
    1,
    2,
    NOW(),
    NOW() + INTERVAL '5 minutes'
);

-- 5. Log to audit
INSERT INTO audit_logs (
    event_type, event_category, severity,
    event_data
) VALUES (
    'MFA_CHALLENGE_RESENT', 'MFA', 'INFO',
    '{"method": "sms", "attempt": 2}'::jsonb
);

COMMIT;
```

### Step 3c: POST /auth/mfa/otp/verify (Correct)

**Same as Scenario 2 Step 3, but with T4 instead of T2**

**Final Database State:**
```
auth_contexts:        1 row (outcome=SUCCESS)
auth_transactions:    4 rows (T1-T4, all CONSUMED)
drs_evaluations:      1 row
sessions:             1 row
tokens:               3 rows
audit_logs:           8 entries
```

---

## Scenario 4: MFA with Push Notification

**Use Case:** User approves login via mobile app push notification

### Step 1: POST /auth/login (Same as Scenario 2)

### Step 2: POST /auth/mfa/initiate (Push)

**API Request:**
```json
POST /auth/mfa/initiate
{
  "context_id": "550e8400-e29b-41d4-a716-446655440003",
  "transaction_id": "tx-550e8400-0005",
  "method": "push"
}
```

**Database Operations:**

```sql
BEGIN;

-- 1. Validate transaction
-- (same as previous)

-- 2. Consume old transaction
-- (same as previous)

-- 3. Generate display number
-- display_number = RANDOM(1, 99) = 42

-- 4. Create push transaction
INSERT INTO auth_transactions (
    transaction_id, context_id,
    transaction_type, transaction_status,
    sequence_number, parent_transaction_id,
    phase, mfa_method, attempt_number,
    display_number,
    created_at, expires_at
) VALUES (
    'tx-push-550e8400-0006',
    '550e8400-e29b-41d4-a716-446655440003',
    'MFA_PUSH_VERIFY',
    'PENDING',
    2,
    'tx-550e8400-0005',
    'MFA',
    'push',
    1,
    42,
    NOW(),
    NOW() + INTERVAL '2 minutes'
);

-- 5. Send push notification via provider (external)

-- 6. Log to audit
INSERT INTO audit_logs (
    event_type, event_category, event_data
) VALUES (
    'MFA_PUSH_SENT', 'MFA',
    '{"display_number": 42}'::jsonb
);

COMMIT;
```

**API Response:**
```json
HTTP 200 OK
{
  "success": true,
  "transaction_id": "tx-push-550e8400-0006",
  "display_number": 42,
  "expires_at": "2025-10-08T10:02:00Z"
}
```

---

### Step 3: POST /mfa/transaction/{tid}/approve (Mobile App)

**API Request:**
```json
POST /mfa/transaction/tx-push-550e8400-0006/approve
{
  "context_id": "550e8400-e29b-41d4-a716-446655440003",
  "selected_number": 42
}
```

**Database Operations:**

```sql
BEGIN;

-- 1. Validate transaction
SELECT transaction_id, display_number, transaction_status
FROM auth_transactions
WHERE transaction_id = 'tx-push-550e8400-0006'
  AND transaction_status = 'PENDING'
  AND expires_at > NOW();

-- 2. Validate number match (application logic)
-- selected_number (42) == display_number (42) → TRUE

-- 3. Approve push
UPDATE auth_transactions
SET selected_number = 42,
    verification_result = 'APPROVED',
    consumed_at = NOW()
WHERE transaction_id = 'tx-push-550e8400-0006';

-- 4. Log to audit
INSERT INTO audit_logs (
    event_type, event_category, event_data
) VALUES (
    'MFA_PUSH_APPROVED', 'MFA',
    '{"numbers_matched": true}'::jsonb
);

COMMIT;
```

**API Response:**
```json
HTTP 200 OK
{
  "success": true,
  "transaction_id": "tx-push-550e8400-0006"
}
```

---

### Step 4: POST /mfa/transaction/{tid} (Web Polling)

**API Request:**
```json
POST /mfa/transaction/tx-push-550e8400-0006
{
  "context_id": "550e8400-e29b-41d4-a716-446655440003"
}
```

**Database Operations:**

```sql
BEGIN;

-- 1. Check approval status
SELECT
    transaction_id,
    verification_result,
    display_number,
    selected_number
FROM auth_transactions
WHERE transaction_id = 'tx-push-550e8400-0006'
  AND context_id = '550e8400-e29b-41d4-a716-446655440003';

-- Result: verification_result = 'APPROVED'

-- 2. Mark transaction consumed
UPDATE auth_transactions
SET transaction_status = 'CONSUMED'
WHERE transaction_id = 'tx-push-550e8400-0006';

-- 3. Mark context complete
UPDATE auth_contexts
SET auth_outcome = 'SUCCESS', completed_at = NOW()
WHERE context_id = '550e8400-e29b-41d4-a716-446655440003';

-- 4-6. Create session + tokens (same as Scenario 2)

COMMIT;
```

**API Response:**
```json
HTTP 201 Created
{
  "response_type_code": "SUCCESS",
  "access_token": "eyJhbGc...",
  "id_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

---

## Scenario 5: Full Journey (MFA → eSign → Device Bind)

**Use Case:** Complete flow with all authentication steps

### Steps 1-3: MFA completion (Same as Scenario 2)

### Step 4: MFA Success → eSign Required

**After MFA verified, application determines eSign required**

**Database Operations:**

```sql
BEGIN;

-- 1. Mark T2 consumed
UPDATE auth_transactions
SET transaction_status = 'CONSUMED',
    verification_result = 'CORRECT',
    consumed_at = NOW()
WHERE transaction_id = 'tx-550e8400-0002';

-- 2. Create T3 (eSign pending)
INSERT INTO auth_transactions (
    transaction_id, context_id,
    transaction_type, transaction_status,
    sequence_number, parent_transaction_id,
    phase, esign_document_id, esign_action,
    created_at, expires_at
) VALUES (
    'tx-esign-550e8400-0003',
    '550e8400-e29b-41d4-a716-446655440002',
    'ESIGN_PRESENT',
    'PENDING',
    3,
    'tx-550e8400-0002',
    'ESIGN',
    'terms-v1-2025',
    'PRESENTED',
    NOW(),
    NOW() + INTERVAL '10 minutes'
);

-- 3. Log to audit
INSERT INTO audit_logs (
    event_type, event_category, event_data
) VALUES (
    'ESIGN_PRESENTED', 'ESIGN',
    '{"document_id": "terms-v1-2025"}'::jsonb
);

COMMIT;
```

**API Response:**
```json
HTTP 200 OK
{
  "response_type_code": "ESIGN_REQUIRED",
  "context_id": "550e8400-e29b-41d4-a716-446655440002",
  "transaction_id": "tx-esign-550e8400-0003",
  "esign_document_id": "terms-v1-2025",
  "esign_url": "/esign/document/terms-v1-2025"
}
```

---

### Step 5: GET /esign/document/{doc_id}

**No DB queries - document fetched from external system or API**

---

### Step 6: POST /esign/accept

**API Request:**
```json
POST /esign/accept
{
  "context_id": "550e8400-e29b-41d4-a716-446655440002",
  "transaction_id": "tx-esign-550e8400-0003",
  "document_id": "terms-v1-2025",
  "acceptance_ip": "192.168.1.101",
  "acceptance_timestamp": "2025-10-08T10:05:00Z"
}
```

**Database Operations:**

```sql
BEGIN;

-- 1. Validate transaction
SELECT transaction_id FROM auth_transactions
WHERE transaction_id = 'tx-esign-550e8400-0003'
  AND transaction_status = 'PENDING';

-- 2. Mark T3 consumed
UPDATE auth_transactions
SET transaction_status = 'CONSUMED',
    esign_action = 'ACCEPTED',
    consumed_at = NOW()
WHERE transaction_id = 'tx-esign-550e8400-0003';

-- 3. Call external ACM API to store acceptance (external)

-- 4. Create T4 (device bind)
INSERT INTO auth_transactions (
    transaction_id, context_id,
    transaction_type, transaction_status,
    sequence_number, parent_transaction_id,
    phase, device_bind_decision,
    created_at, expires_at
) VALUES (
    'tx-device-550e8400-0004',
    '550e8400-e29b-41d4-a716-446655440002',
    'DEVICE_BIND',
    'PENDING',
    4,
    'tx-esign-550e8400-0003',
    'DEVICE_BIND',
    'OFFERED',
    NOW(),
    NOW() + INTERVAL '5 minutes'
);

-- 5. Log to audit
INSERT INTO audit_logs (
    event_type, event_category, event_data
) VALUES (
    'ESIGN_ACCEPTED', 'ESIGN',
    '{"document_id": "terms-v1-2025"}'::jsonb
);

COMMIT;
```

**API Response:**
```json
HTTP 200 OK
{
  "response_type_code": "DEVICE_BIND_REQUIRED",
  "context_id": "550e8400-e29b-41d4-a716-446655440002",
  "transaction_id": "tx-device-550e8400-0004"
}
```

---

### Step 7: POST /device/bind

**API Request:**
```json
POST /device/bind
{
  "context_id": "550e8400-e29b-41d4-a716-446655440002",
  "transaction_id": "tx-device-550e8400-0004",
  "bind_device": true
}
```

**Database Operations:**

```sql
BEGIN;

-- 1. Validate transaction
SELECT transaction_id FROM auth_transactions
WHERE transaction_id = 'tx-device-550e8400-0004'
  AND transaction_status = 'PENDING';

-- 2. Mark T4 consumed
UPDATE auth_transactions
SET transaction_status = 'CONSUMED',
    device_bind_decision = 'ACCEPTED',
    consumed_at = NOW()
WHERE transaction_id = 'tx-device-550e8400-0004';

-- 3. Mark context complete
UPDATE auth_contexts
SET auth_outcome = 'SUCCESS', completed_at = NOW()
WHERE context_id = '550e8400-e29b-41d4-a716-446655440002';

-- 4. Create trusted device
INSERT INTO trusted_devices (
    device_id, cupid, device_fingerprint, device_fingerprint_hash,
    device_name, device_type, trusted_at, status, last_used_at
) VALUES (
    'dev-550e8400-0001',
    'CUPID_MFA_001',
    'fp_def456',
    'sha256_hash_of_fp_def456',
    'Chrome on Windows',
    'BROWSER',
    NOW(),
    'ACTIVE',
    NOW()
);

-- 5. Create session
INSERT INTO sessions (
    session_id, context_id, cupid, device_fingerprint,
    ip_address, status, created_at, expires_at
) VALUES (
    'sess-550e8400-0002',
    '550e8400-e29b-41d4-a716-446655440002',
    'CUPID_MFA_001',
    'fp_def456',
    '192.168.1.101',
    'ACTIVE',
    NOW(),
    NOW() + INTERVAL '30 days'
);

-- 6. Create tokens
INSERT INTO tokens (token_id, session_id, token_type, token_value, token_value_hash, expires_at, status)
VALUES
    ('token-access-003', 'sess-550e8400-0002', 'ACCESS', 'eyJhbGc...', 'sha256_hash', NOW() + INTERVAL '15 minutes', 'ACTIVE'),
    ('token-refresh-003', 'sess-550e8400-0002', 'REFRESH', 'eyJhbGc...', 'sha256_hash', NOW() + INTERVAL '30 days', 'ACTIVE'),
    ('token-id-003', 'sess-550e8400-0002', 'ID', 'eyJhbGc...', 'sha256_hash', NOW() + INTERVAL '15 minutes', 'ACTIVE');

-- 7. Log to audit
INSERT INTO audit_logs (
    event_type, event_category, event_data
) VALUES
    ('DEVICE_BIND_ACCEPTED', 'DEVICE', '{"device_type": "BROWSER"}'::jsonb),
    ('LOGIN_SUCCESS', 'AUTH', '{}'::jsonb);

COMMIT;
```

**API Response:**
```json
HTTP 201 Created
Set-Cookie: refresh_token=eyJhbGc...; HttpOnly; Secure

{
  "response_type_code": "SUCCESS",
  "context_id": "550e8400-e29b-41d4-a716-446655440002",
  "device_bound": true,
  "access_token": "eyJhbGc...",
  "id_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

**Final Database State:**
```
auth_contexts:        1 row (outcome=SUCCESS)
auth_transactions:    4 rows (T1-T4, all CONSUMED)
drs_evaluations:      1 row
sessions:             1 row
tokens:               3 rows
trusted_devices:      1 row
audit_logs:           12+ entries
```

---

## Scenario 6: Token Refresh

**Use Case:** Access token expired, refresh using refresh token

**API Request:**
```json
POST /auth/refresh
Cookie: refresh_token=eyJhbGc...REFRESH_TOKEN...
```

**Database Operations:**

```sql
BEGIN;

-- 1. Validate refresh token
SELECT
    t.token_id,
    t.session_id,
    t.expires_at,
    t.status,
    s.cupid,
    s.status as session_status,
    s.context_id
FROM tokens t
JOIN sessions s ON s.session_id = t.session_id
WHERE t.token_value_hash = 'sha256_hash_of_refresh_token'
  AND t.token_type = 'REFRESH'
  AND t.status = 'ACTIVE'
  AND t.expires_at > NOW()
  AND s.status = 'ACTIVE';

-- Result: Found (token is valid)

-- 2. Rotate old refresh token
UPDATE tokens
SET status = 'ROTATED',
    revoked_at = NOW()
WHERE token_id = 'token-refresh-003';

-- 3. Create new tokens (rotation)
INSERT INTO tokens (token_id, session_id, token_type, token_value, token_value_hash, parent_token_id, expires_at, status)
VALUES
    ('token-access-004', 'sess-550e8400-0002', 'ACCESS',
     'eyJhbGc...NEW_ACCESS...', 'new_sha256_hash', NULL,
     NOW() + INTERVAL '15 minutes', 'ACTIVE'),

    ('token-refresh-004', 'sess-550e8400-0002', 'REFRESH',
     'eyJhbGc...NEW_REFRESH...', 'new_sha256_refresh_hash', 'token-refresh-003',
     NOW() + INTERVAL '30 days', 'ACTIVE');

-- 4. Update session activity
UPDATE sessions
SET last_activity_at = NOW()
WHERE session_id = 'sess-550e8400-0002';

-- 5. Log to audit
INSERT INTO audit_logs (
    event_type, event_category, session_id, event_data
) VALUES (
    'TOKEN_REFRESHED', 'TOKEN', 'sess-550e8400-0002',
    '{"token_rotation": true}'::jsonb
);

COMMIT;
```

**API Response:**
```json
HTTP 201 Created
Set-Cookie: refresh_token=eyJhbGc...NEW_REFRESH...; HttpOnly; Secure

{
  "success": true,
  "access_token": "eyJhbGc...NEW_ACCESS...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

**Database State After:**
```
tokens:
  - token-refresh-003: status=ROTATED
  - token-refresh-004: status=ACTIVE, parent_token_id=token-refresh-003
  - token-access-004: status=ACTIVE (old access token auto-expired)
```

---

## Scenario 7: Session Revocation by Agent

**Use Case:** Agent manually revokes user session (suspicious activity)

**API Request:**
```json
POST /admin/sessions/revoke
{
  "session_id": "sess-550e8400-0002",
  "agent_id": "agent-john-doe",
  "reason": "Suspicious activity detected - multiple failed MFA attempts"
}
```

**Database Operations:**

```sql
BEGIN;

-- 1. Lookup session
SELECT session_id, cupid, status
FROM sessions
WHERE session_id = 'sess-550e8400-0002';

-- 2. Revoke session
UPDATE sessions
SET status = 'REVOKED',
    revoked_at = NOW(),
    revoked_by = 'agent-john-doe',
    revocation_reason = 'Suspicious activity detected - multiple failed MFA attempts'
WHERE session_id = 'sess-550e8400-0002';

-- 3. Revoke all active tokens
UPDATE tokens
SET status = 'REVOKED',
    revoked_at = NOW()
WHERE session_id = 'sess-550e8400-0002'
  AND status = 'ACTIVE';

-- 4. Log to audit
INSERT INTO audit_logs (
    event_type, event_category, severity,
    cupid, session_id, event_data
) VALUES (
    'SESSION_REVOKED', 'SESSION', 'WARN',
    'CUPID_MFA_001', 'sess-550e8400-0002',
    '{"revoked_by": "agent-john-doe", "reason": "Suspicious activity detected"}'::jsonb
);

COMMIT;
```

**API Response:**
```json
HTTP 200 OK
{
  "success": true,
  "session_id": "sess-550e8400-0002",
  "tokens_revoked": 2
}
```

**Database State After:**
```
sessions:
  - sess-550e8400-0002: status=REVOKED

tokens:
  - token-access-004: status=REVOKED
  - token-refresh-004: status=REVOKED
```

---

## Scenario 8: Trusted Device Login (MFA Skip)

**Use Case:** User logs in from trusted device, MFA skipped

**API Request:**
```json
POST /auth/login
{
  "username": "mfauser",
  "password": "SecurePass123!",
  "app_id": "web-banking",
  "app_version": "1.2.3",
  "drs_action_token": "eyJhbGc...DRS_TOKEN..."
}
```

**Database Operations:**

```sql
BEGIN;

-- 1. LDAP validation (external)
-- Returns: CUPID_MFA_001, mfa_required=true

-- 2. Check if device is trusted
SELECT device_id, trusted_at
FROM trusted_devices
WHERE cupid = 'CUPID_MFA_001'
  AND device_fingerprint_hash = 'sha256_hash_of_fp_def456'
  AND status = 'ACTIVE';

-- Result: Found (device is trusted)

-- 3. DRS evaluation
INSERT INTO drs_evaluations (
    evaluation_id, context_id, cupid,
    action_token_hash, recommendation, risk_score,
    raw_response
) VALUES (
    gen_random_uuid(), 'ctx-new', 'CUPID_MFA_001',
    'sha256_hash', 'TRUST', 15,
    '{"recommendation": "TRUST", "risk_score": 15, "device_known": true}'::jsonb
);

-- 4. Create auth_context (skip MFA)
INSERT INTO auth_contexts (
    context_id, cupid, app_id, app_version,
    device_fingerprint, ip_address,
    requires_additional_steps, auth_outcome, completed_at
) VALUES (
    'ctx-550e8400-trusted',
    'CUPID_MFA_001',
    'web-banking',
    '1.2.3',
    'fp_def456',
    '192.168.1.101',
    FALSE,
    'SUCCESS',
    NOW()
);

-- 5. Update trusted device last_used
UPDATE trusted_devices
SET last_used_at = NOW()
WHERE device_id = 'dev-550e8400-0001';

-- 6-8. Create session + tokens (same as simple login)

-- 9. Log to audit
INSERT INTO audit_logs (
    event_type, event_category, event_data
) VALUES (
    'LOGIN_TRUSTED_DEVICE', 'AUTH',
    '{"mfa_skipped": true, "device_id": "dev-550e8400-0001"}'::jsonb
);

COMMIT;
```

**API Response:**
```json
HTTP 201 Created
{
  "response_type_code": "SUCCESS",
  "context_id": "ctx-550e8400-trusted",
  "access_token": "eyJhbGc...",
  "id_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

---

## Summary Table

| Scenario | Contexts | Transactions | Sessions | Tokens | Trusted Devices | Audit Entries |
|----------|----------|--------------|----------|--------|-----------------|---------------|
| Simple Login | 1 | 0 | 1 | 3 | 0 | 2 |
| MFA Success | 1 | 2 | 1 | 3 | 0 | 5 |
| MFA Retry | 1 | 4 | 1 | 3 | 0 | 8 |
| Push MFA | 1 | 2 | 1 | 3 | 0 | 6 |
| Full Journey | 1 | 4 | 1 | 3 | 1 | 12+ |
| Token Refresh | 0 new | 0 new | 0 new | 2 new | 0 | 1 |
| Revocation | 0 | 0 | updated | updated | 0 | 1 |
| Trusted Device | 1 | 0 | 1 | 3 | updated | 2 |

---

**Document Version:** 1.0
**Last Updated:** October 2025
