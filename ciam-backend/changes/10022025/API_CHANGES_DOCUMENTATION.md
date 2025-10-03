# CIAM Backend API v2.0.0 - Comprehensive Changes Documentation

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Breaking Changes](#breaking-changes)
3. [Detailed Changes by Category](#detailed-changes-by-category)
4. [Updated API Call Flows](#updated-api-call-flows)
5. [Error Handling Updates](#error-handling-updates)
6. [Migration Guide](#migration-guide)

---

## Executive Summary

The CIAM Backend API has been significantly refactored to v2.0.0 with the following major improvements:

- **OIDC Compliance**: All fields converted to snake_case naming convention
- **Simplified Authentication**: Streamlined token responses with id_token containing user claims
- **Consistent Error Codes**: All errors use standardized CIAM_E* format
- **Enhanced MFA Flow**: Separate endpoints for web and mobile device interactions
- **Device Trust Optimization**: Backend-managed device fingerprinting
- **Removed Deprecated Endpoints**: Cleaned up unnecessary API surface

---

## Breaking Changes

### 1. Response Structure Changes

#### Login Response (201 - SUCCESS)
**REMOVED:**
- `user` object (id, username, email, roles)
- `transactionId`
- `mfa_skipped`
- `deviceFingerprint`

**ADDED:**
- `device_bound` boolean

**WHY:** User information is now available via JWT claims in `id_token`. Device fingerprint is managed backend-only.

#### MFA Required Response (200)
**REMOVED:**
- `reason` enum
- `trust_expired_at`
- `mfa_required` boolean
- `available_methods` array
- `message` string
- `deviceFingerprint`

**ADDED:**
- `otp_methods` - Array of `{value: string, mfa_option_id: number}`
- `mobile_approve_status` - Enum: NOT_REGISTERED, ENABLED, DISABLED

**WHY:** More structured OTP method selection and clearer push notification status.

#### eSign Required Response (200)
**REMOVED:**
- `mfa_skipped`
- `message`
- `deviceFingerprint`

**WHY:** Simplified to essential fields only; UI handles messaging.

### 2. Request Body Changes

#### /auth/login
**ADDED (Required):**
- `app_id` - Client application identifier
- `app_version` - Client application version

**WHY:** Enables backend tracking, version-specific logic, and analytics.

#### /auth/mfa/initiate
**CHANGED:**
- Now requires `transaction_id` (from login response)
- Requires `mfa_option_id` when method is 'otp'
- REMOVED: `username`, `sessionId`

**WHY:** Transaction-based flow eliminates redundant fields.

#### /auth/mfa/verify
**REMOVED:**
- `push_result`
- `selected_number`
- `deviceFingerprint`

**WHY:** Push approval now happens via dedicated `/approve` endpoint.

### 3. Endpoint Removals

**REMOVED ENDPOINTS:**
- `/auth/introspect` - Not needed; JWT validation is client-side
- `/auth/post-mfa-check` - eSign status included in MFA verify response
- `/auth/post-login-check` - eSign status included in login response
- `/esign/decline` - UI redirects to login on decline
- `/userinfo` - User info available in id_token JWT claims

### 4. New Endpoints

**ADDED:**
- `/mfa/transaction/{transaction_id}/approve` (POST)
  - **Purpose:** Mobile app approves push notification with number matching
  - **Returns:** Success status only (no tokens)
  - **WHY:** Separates mobile approval from web token retrieval

### 5. Field Naming Convention

**ALL fields converted to snake_case:**
- `sessionId` → `session_id`
- `transactionId` → `transaction_id`
- `deviceFingerprint` → REMOVED
- `challengeStatus` → `challenge_status`
- `expiresAt` → `expires_at`
- `displayNumber` → `display_number`
- `selectedNumber` → `selected_number`
- `lastLoginAt` → `last_login_at`
- etc.

**WHY:** OIDC compliance and API consistency.

---

## Detailed Changes by Category

### A. Authentication Flow

#### 1. Login Endpoint (`/auth/login`)

**HTTP Status Code Changes:**
- **201 Created** - Authentication successful (was 200)
- **200 OK** - Additional steps required (MFA/eSign)
- **401 Unauthorized** - Invalid credentials or user issues
- **423 Locked** - Account/MFA locked
- **503 Service Unavailable** - Server errors

**Error Codes Added:**
- `CIAM_E01_01_001` - User not found or invalid credentials
- `CIAM_E01_01_016` - Username contains masked value
- `CIAM_E01_01_002` - User password locked
- `CIAM_E01_01_003` - User disabled
- `CIAM_E01_01_004` - Enterprise credential block
- `CIAM_E01_01_005` - MFA locked
- `CIAM_E01_01_006` - User deceased
- `CIAM_E01_01_008` - CAPI restriction blocked
- `CIAM_E05_00_001` - Server error
- `CIAM_E05_00_002` - Server info not available

#### 2. Token Refresh (`/auth/refresh`)

**Error Codes Added:**
- `CIAM_E01_02_001` - Authentication token missing
- `CIAM_E01_02_002` - Authentication token invalid or expired
- `CIAM_E05_00_001` - Server error
- `CIAM_E05_00_002` - Server info not available

**503 Response Added** for service availability issues.

### B. MFA Flow

#### 1. MFA Initiate (`/auth/mfa/initiate`)

**Request Changes:**
```json
// OLD
{
  "method": "otp",
  "username": "user@example.com",
  "sessionId": "abc123",
  "transactionId": "xyz789"
}

// NEW
{
  "transaction_id": "xyz789",
  "method": "otp",
  "mfa_option_id": 1  // Required for OTP, specifies which phone
}
```

**Response Changes:**
- All fields now snake_case
- Removed `message` field
- Added 503 error response

#### 2. MFA Verify (`/auth/mfa/verify`)

**Request Changes:**
```json
// OLD (OTP)
{
  "transactionId": "xyz",
  "method": "otp",
  "code": "1234"
}

// OLD (Push)
{
  "transactionId": "xyz",
  "method": "push",
  "pushResult": "APPROVED",
  "selectedNumber": 42,
  "deviceFingerprint": "abc123"
}

// NEW (OTP - unchanged logic)
{
  "transaction_id": "xyz",
  "method": "otp",
  "code": "1234"
}

// NEW (Push - simplified)
{
  "transaction_id": "xyz",
  "method": "push"
}
```

**Push Flow Change:**
- Mobile app calls `/mfa/transaction/{transaction_id}/approve` with `selected_number`
- Web UI polls `/mfa/transaction/{transaction_id}` for status
- When approved, web UI calls `/mfa/verify` to get tokens

**Response Changes:**
- Added `refresh_token` (all 3 tokens returned)
- Removed `message` field
- All fields snake_case
- Added 503 error response

#### 3. NEW: Push Approval Endpoint (`/mfa/transaction/{transaction_id}/approve`)

**Purpose:** Mobile device approves push notification

**Request:**
```json
{
  "selected_number": 42
}
```

**Response (200):**
```json
{
  "success": true,
  "transaction_id": "xyz789",
  "challenge_status": "APPROVED"
}
```

**Error Responses:**
- 400 - Invalid number or already processed
- 404 - Transaction not found
- 410 - Transaction expired
- 503 - Service unavailable

### C. eSign Flow

#### 1. Get Document (`/esign/document/{document_id}`)

**Changes:**
- Path parameter: `documentId` → `document_id`
- Response fields all snake_case
- Added 503 error response

#### 2. Accept Document (`/esign/accept`)

**Request Changes:**
```json
// OLD
{
  "transactionId": "xyz",
  "documentId": "terms-v1-2025",
  "acceptanceIp": "1.2.3.4",
  "deviceFingerprint": "abc123",
  "acceptanceTimestamp": "2025-10-02T10:00:00Z"
}

// NEW
{
  "transaction_id": "xyz",
  "document_id": "terms-v1-2025",
  "acceptance_ip": "1.2.3.4",
  "acceptance_timestamp": "2025-10-02T10:00:00Z"
}
```

**Response Changes:**
- Added `refresh_token` (all 3 tokens returned)
- Removed `deviceFingerprint`
- Removed `message`
- All fields snake_case
- Added 503 error response

### D. Device Management

#### Device Bind (`/device/bind`)

**Request Changes:**
```json
// OLD
{
  "username": "user@example.com",
  "deviceFingerprint": "abc123"
}

// NEW
{
  "transaction_id": "xyz789"
}
```

**Response Changes:**
```json
// OLD
{
  "success": true,
  "message": "Device trusted",
  "deviceFingerprint": "abc123",
  "username": "user@example.com",
  "trustedAt": "2025-10-02T10:00:00Z",
  "alreadyTrusted": false
}

// NEW
{
  "success": true,
  "transaction_id": "xyz789",
  "trusted_at": "2025-10-02T10:00:00Z",
  "already_trusted": false
}
```

**WHY:** Backend looks up device fingerprint via transaction_id.

### E. Error Response Schema

#### Complete Transformation

**OLD:**
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Invalid credentials",
  "responseTypeCode": "INVALID_CREDENTIALS",
  "timestamp": "2025-10-02T10:00:00Z"
}
```

**NEW:**
```json
{
  "error_code": "CIAM_E01_01_001",
  "message": "User not found or invalid credentials"
}
```

#### Complete Error Code List

**Authentication Errors (401):**
- `CIAM_E01_01_001` - User not found or invalid credentials
- `CIAM_E01_01_016` - Username contains masked value

**Account Locked Errors (423):**
- `CIAM_E01_01_002` - User password locked
- `CIAM_E01_01_003` - User disabled
- `CIAM_E01_01_004` - Enterprise credential block
- `CIAM_E01_01_005` - MFA locked
- `CIAM_E01_01_006` - User deceased
- `CIAM_E01_01_008` - CAPI restriction blocked by bank or customer

**Token Errors (401):**
- `CIAM_E01_02_001` - Authentication token missing
- `CIAM_E01_02_002` - Authentication token invalid or expired

**Server Errors (503):**
- `CIAM_E05_00_001` - Server error
- `CIAM_E05_00_002` - Server info not available (e.g. CAPI communication failure)

---

## Updated API Call Flows

### Flow 1: Simple Login (No MFA/eSign Required)

```
┌─────────┐                                    ┌─────────┐
│   UI    │                                    │   API   │
└────┬────┘                                    └────┬────┘
     │                                              │
     │ POST /auth/login                             │
     │ {username, password, app_id, app_version}    │
     ├─────────────────────────────────────────────>│
     │                                              │
     │                      201 Created             │
     │ {access_token, id_token, refresh_token,      │
     │  session_id, device_bound: false}            │
     │<─────────────────────────────────────────────┤
     │                                              │
     │ [Decode id_token to get user info]           │
     │                                              │
     │ [If device_bound=false, show "Trust device?" │
     │  dialog. If user agrees:]                    │
     │                                              │
     │ POST /device/bind                            │
     │ {transaction_id: from_response}              │
     ├─────────────────────────────────────────────>│
     │                                              │
     │                      200 OK                  │
     │ {success: true, already_trusted: false}      │
     │<─────────────────────────────────────────────┤
     │                                              │
```

### Flow 2: Login with OTP MFA

```
┌─────────┐                                    ┌─────────┐
│   UI    │                                    │   API   │
└────┬────┘                                    └────┬────┘
     │                                              │
     │ POST /auth/login                             │
     │ {username, password, app_id, app_version}    │
     ├─────────────────────────────────────────────>│
     │                                              │
     │                      200 OK                  │
     │ {responseTypeCode: "MFA_REQUIRED",           │
     │  otp_methods: [{value:"1234",mfa_option_id:1},│
     │                {value:"5678",mfa_option_id:2}],│
     │  mobile_approve_status: "NOT_REGISTERED",    │
     │  session_id: "abc", transaction_id: "xyz"}   │
     │<─────────────────────────────────────────────┤
     │                                              │
     │ [UI shows OTP method selection]              │
     │ [User selects phone ending in 1234]          │
     │                                              │
     │ POST /auth/mfa/initiate                      │
     │ {transaction_id: "xyz", method: "otp",       │
     │  mfa_option_id: 1}                           │
     ├─────────────────────────────────────────────>│
     │                                              │
     │                      200 OK                  │
     │ {success: true, transaction_id: "xyz",       │
     │  challenge_status: "PENDING", expires_at}    │
     │<─────────────────────────────────────────────┤
     │                                              │
     │ [UI shows OTP input field]                   │
     │ [User enters code received via SMS]          │
     │                                              │
     │ POST /auth/mfa/verify                        │
     │ {transaction_id: "xyz", method: "otp",       │
     │  code: "123456"}                             │
     ├─────────────────────────────────────────────>│
     │                                              │
     │                      200 OK                  │
     │ {success: true, access_token, id_token,      │
     │  refresh_token, session_id, transaction_id,  │
     │  device_bound: false}                        │
     │<─────────────────────────────────────────────┤
     │                                              │
```

### Flow 3: Login with Push MFA (Number Matching)

```
┌─────────┐           ┌─────────┐           ┌─────────┐
│ Web UI  │           │   API   │           │ Mobile  │
└────┬────┘           └────┬────┘           └────┬────┘
     │                     │                     │
     │ POST /auth/login    │                     │
     ├────────────────────>│                     │
     │                     │                     │
     │     200 OK          │                     │
     │ MFA_REQUIRED        │                     │
     │ mobile_approve_     │                     │
     │ status: "ENABLED"   │                     │
     │<────────────────────┤                     │
     │                     │                     │
     │ POST /mfa/initiate  │                     │
     │ {method: "push"}    │                     │
     ├────────────────────>│                     │
     │                     │                     │
     │                     │ [Send push with     │
     │                     │  number choices]    │
     │                     ├────────────────────>│
     │                     │                     │
     │     200 OK          │                     │
     │ {display_number: 42}│                     │
     │<────────────────────┤                     │
     │                     │                     │
     │ [Show "Enter 42     │                     │
     │  on your mobile"]   │                     │
     │                     │                     │
     │                     │ [User sees: 17, 42, 89]
     │                     │ [User taps 42]      │
     │                     │                     │
     │                     │ POST /mfa/transaction/
     │                     │ {transaction_id}/approve
     │                     │ {selected_number: 42}
     │                     │<────────────────────┤
     │                     │                     │
     │                     │     200 OK          │
     │                     │ {challenge_status:  │
     │                     │  "APPROVED"}        │
     │                     ├────────────────────>│
     │                     │                     │
     │ [Polling every 2s]  │                     │
     │ GET /mfa/transaction│                     │
     │ /{transaction_id}   │                     │
     ├────────────────────>│                     │
     │                     │                     │
     │     200 OK          │                     │
     │ {challenge_status:  │                     │
     │  "APPROVED"}        │                     │
     │<────────────────────┤                     │
     │                     │                     │
     │ POST /mfa/verify    │                     │
     │ {method: "push"}    │                     │
     ├────────────────────>│                     │
     │                     │                     │
     │     200 OK          │                     │
     │ {tokens...}         │                     │
     │<────────────────────┤                     │
     │                     │                     │
```

### Flow 4: Login with eSign Requirement

```
┌─────────┐                                    ┌─────────┐
│   UI    │                                    │   API   │
└────┬────┘                                    └────┬────┘
     │                                              │
     │ POST /auth/login                             │
     ├─────────────────────────────────────────────>│
     │                                              │
     │                      200 OK                  │
     │ {responseTypeCode: "ESIGN_REQUIRED",         │
     │  session_id, transaction_id,                 │
     │  esign_document_id: "terms-v1-2025",         │
     │  esign_url: "/esign/document/terms-v1-2025", │
     │  is_mandatory: true}                         │
     │<─────────────────────────────────────────────┤
     │                                              │
     │ GET /esign/document/terms-v1-2025            │
     ├─────────────────────────────────────────────>│
     │                                              │
     │                      200 OK                  │
     │ {document_id, title, content, version,       │
     │  mandatory: true}                            │
     │<─────────────────────────────────────────────┤
     │                                              │
     │ [UI displays document for review]            │
     │ [User clicks "Accept"]                       │
     │                                              │
     │ POST /esign/accept                           │
     │ {transaction_id, document_id,                │
     │  acceptance_ip, acceptance_timestamp}        │
     ├─────────────────────────────────────────────>│
     │                                              │
     │                      200 OK                  │
     │ {responseTypeCode: "SUCCESS",                │
     │  access_token, id_token, refresh_token,      │
     │  esign_accepted: true, device_bound: false}  │
     │<─────────────────────────────────────────────┤
     │                                              │
```

### Flow 5: Login → MFA → eSign (Complete Flow)

```
┌─────────┐                                    ┌─────────┐
│   UI    │                                    │   API   │
└────┬────┘                                    └────┬────┘
     │                                              │
     │ POST /auth/login                             │
     ├─────────────────────────────────────────────>│
     │                      200 OK                  │
     │ {responseTypeCode: "MFA_REQUIRED", ...}      │
     │<─────────────────────────────────────────────┤
     │                                              │
     │ [Complete MFA flow - OTP or Push]            │
     │                                              │
     │ POST /auth/mfa/verify                        │
     ├─────────────────────────────────────────────>│
     │                      200 OK                  │
     │ {responseTypeCode: "ESIGN_REQUIRED", ...}    │
     │<─────────────────────────────────────────────┤
     │                                              │
     │ [User reviews and accepts eSign document]    │
     │                                              │
     │ POST /esign/accept                           │
     ├─────────────────────────────────────────────>│
     │                      200 OK                  │
     │ {responseTypeCode: "SUCCESS", tokens...}     │
     │<─────────────────────────────────────────────┤
     │                                              │
```

### Flow 6: Token Refresh

```
┌─────────┐                                    ┌─────────┐
│   UI    │                                    │   API   │
└────┬────┘                                    └────┬────┘
     │                                              │
     │ [Access token expired]                       │
     │                                              │
     │ POST /auth/refresh                           │
     │ Cookie: refresh_token=...                    │
     ├─────────────────────────────────────────────>│
     │                                              │
     │                      200 OK                  │
     │ {success: true, access_token,                │
     │  token_type: "Bearer", expires_in: 900}      │
     │<─────────────────────────────────────────────┤
     │                                              │
```

---

## Error Handling Updates

### Error Response Structure

**All error responses now use:**
```json
{
  "error_code": "CIAM_E01_01_001",
  "message": "User not found or invalid credentials"
}
```

### Error Code Categories

#### 1. Authentication Errors (E01_01_*)
**HTTP 401 or 423**

| Code | HTTP | Description |
|------|------|-------------|
| CIAM_E01_01_001 | 401 | User not found or invalid credentials |
| CIAM_E01_01_016 | 401 | Username contains masked value |
| CIAM_E01_01_002 | 423 | User password locked |
| CIAM_E01_01_003 | 423 | User disabled |
| CIAM_E01_01_004 | 423 | Enterprise credential block |
| CIAM_E01_01_005 | 423 | MFA locked |
| CIAM_E01_01_006 | 423 | User deceased |
| CIAM_E01_01_008 | 423 | CAPI restriction blocked by bank or customer |

#### 2. Token Errors (E01_02_*)
**HTTP 401**

| Code | Description |
|------|-------------|
| CIAM_E01_02_001 | Authentication token missing |
| CIAM_E01_02_002 | Authentication token invalid or expired |

#### 3. Server Errors (E05_00_*)
**HTTP 503**

| Code | Description |
|------|-------------|
| CIAM_E05_00_001 | Server error |
| CIAM_E05_00_002 | Server info not available (e.g. CAPI communication failure) |

### UI Error Handling Recommendations

```javascript
// Example error handling
async function handleApiCall() {
  try {
    const response = await fetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username,
        password,
        app_id: 'web-app',
        app_version: '1.0.0'
      })
    });

    if (!response.ok) {
      const error = await response.json();

      switch (error.error_code) {
        case 'CIAM_E01_01_001':
          showError('Invalid username or password');
          break;
        case 'CIAM_E01_01_002':
          showError('Account locked due to too many failed attempts');
          break;
        case 'CIAM_E01_01_003':
          showError('Account disabled. Please contact support');
          break;
        case 'CIAM_E01_01_005':
          showError('MFA locked. Please contact support');
          break;
        case 'CIAM_E05_00_001':
        case 'CIAM_E05_00_002':
          showError('Service temporarily unavailable. Please try again');
          break;
        default:
          showError(error.message);
      }
      return;
    }

    // Handle success...
  } catch (err) {
    showError('Network error. Please check your connection');
  }
}
```

---

## Migration Guide

### 1. Update Request Bodies

#### Login
```javascript
// OLD
{
  username: 'user@example.com',
  password: 'password123'
}

// NEW - ADD REQUIRED FIELDS
{
  username: 'user@example.com',
  password: 'password123',
  app_id: 'your-app-id',        // NEW REQUIRED
  app_version: '1.0.0'           // NEW REQUIRED
}
```

#### MFA Initiate
```javascript
// OLD
{
  method: 'otp',
  username: 'user@example.com',
  sessionId: 'abc',
  transactionId: 'xyz'
}

// NEW
{
  transaction_id: 'xyz',         // From login response
  method: 'otp',
  mfa_option_id: 1               // From otp_methods array
}
```

### 2. Handle New Response Structures

#### Parse Login Success (201)
```javascript
// OLD
const { user, access_token, id_token, sessionId } = response;
const userName = user.username;
const userEmail = user.email;

// NEW
const { access_token, id_token, refresh_token, session_id, device_bound } = response;

// Decode id_token to get user info
const userInfo = parseJwt(id_token); // {sub, email, preferred_username, roles, ...}
const userName = userInfo.preferred_username;
const userEmail = userInfo.email;

// Show device trust prompt if needed
if (!device_bound) {
  showDeviceTrustDialog(response.transaction_id);
}
```

#### Handle MFA Required (200)
```javascript
// OLD
const { available_methods, sessionId, transactionId } = response;
const methods = available_methods; // ['otp', 'push']

// NEW
const { otp_methods, mobile_approve_status, session_id, transaction_id } = response;

// Show OTP phone selection
otp_methods.forEach(method => {
  console.log(`Phone ending in ${method.value}, ID: ${method.mfa_option_id}`);
});

// Check if push is available
const pushAvailable = mobile_approve_status === 'ENABLED';
```

### 3. Implement Push MFA Flow

```javascript
// NEW: Separate endpoints for mobile and web

// Mobile App (when user approves)
async function approvePushOnMobile(transactionId, selectedNumber) {
  await fetch(`/mfa/transaction/${transactionId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ selected_number: selectedNumber })
  });
}

// Web UI (polling for approval)
async function waitForPushApproval(transactionId) {
  const pollInterval = setInterval(async () => {
    const response = await fetch(`/mfa/transaction/${transactionId}`);
    const { challenge_status } = await response.json();

    if (challenge_status === 'APPROVED') {
      clearInterval(pollInterval);
      // Now get tokens
      await verifyMfa(transactionId, 'push');
    } else if (challenge_status === 'REJECTED' || challenge_status === 'EXPIRED') {
      clearInterval(pollInterval);
      handlePushFailed(challenge_status);
    }
  }, 2000); // Poll every 2 seconds
}

// OLD: Single endpoint
async function verifyPush(transactionId, pushResult, selectedNumber) {
  await fetch('/auth/mfa/verify', {
    method: 'POST',
    body: JSON.stringify({
      transactionId,
      method: 'push',
      pushResult,
      selectedNumber
    })
  });
}
```

### 4. Update Error Handling

```javascript
// OLD
if (error.responseTypeCode === 'INVALID_CREDENTIALS') {
  showError('Invalid credentials');
}

// NEW
if (error.error_code === 'CIAM_E01_01_001') {
  showError('Invalid credentials');
}

// Map error codes to user-friendly messages
const ERROR_MESSAGES = {
  'CIAM_E01_01_001': 'Invalid username or password',
  'CIAM_E01_01_016': 'Invalid username format',
  'CIAM_E01_01_002': 'Account locked. Try again later',
  'CIAM_E01_01_003': 'Account disabled. Contact support',
  'CIAM_E01_01_005': 'MFA locked. Contact support',
  'CIAM_E01_02_001': 'Session expired. Please login again',
  'CIAM_E01_02_002': 'Invalid session. Please login again',
  'CIAM_E05_00_001': 'Service unavailable. Try again',
  'CIAM_E05_00_002': 'Service unavailable. Try again'
};
```

### 5. Remove Deprecated Endpoint Calls

```javascript
// REMOVE these calls
await fetch('/auth/introspect', ...);
await fetch('/auth/post-mfa-check', ...);
await fetch('/auth/post-login-check', ...);
await fetch('/userinfo', ...);
await fetch('/esign/decline', ...);

// Token validation is now client-side
function validateToken(token) {
  try {
    const payload = parseJwt(token);
    return payload.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}
```

### 6. Update Field Names (snake_case)

```javascript
// Create a utility to convert responses
function convertToCamelCase(obj) {
  // Only if you want to maintain camelCase in your app
  // Otherwise, use snake_case directly
}

// Or use snake_case throughout your app
const { session_id, transaction_id, expires_in } = response;
```

### 7. Device Binding Update

```javascript
// OLD
async function trustDevice(username, deviceFingerprint) {
  await fetch('/device/bind', {
    method: 'POST',
    body: JSON.stringify({ username, deviceFingerprint })
  });
}

// NEW
async function trustDevice(transactionId) {
  await fetch('/device/bind', {
    method: 'POST',
    body: JSON.stringify({ transaction_id: transactionId })
  });
}
```

---

## Summary of Benefits

### 1. **Improved Security**
- Device fingerprints managed backend-only
- Separate mobile/web flows prevent token exposure
- Consistent error codes prevent information leakage

### 2. **Better UX**
- User info in JWT eliminates extra API calls
- Clear device trust prompts via `device_bound` flag
- Structured OTP method selection
- Clear push notification availability status

### 3. **OIDC Compliance**
- Snake_case field naming
- Standard JWT claims in id_token
- Proper token response structure

### 4. **Reduced API Surface**
- 5 endpoints removed
- Cleaner, more focused API
- Easier to maintain and document

### 5. **Better Error Handling**
- Consistent CIAM_* error code format
- Comprehensive error code documentation
- Clear HTTP status code usage

### 6. **Enhanced Mobile Support**
- Dedicated push approval endpoint
- Number matching security feature
- Clean separation of mobile/web concerns

---

## Testing Checklist

### Authentication
- [ ] Login with valid credentials returns 201 with all 3 tokens
- [ ] Login with invalid credentials returns 401 with CIAM_E01_01_001
- [ ] Login with locked account returns 423 with appropriate error code
- [ ] app_id and app_version are required and validated

### MFA - OTP
- [ ] MFA required response includes otp_methods array
- [ ] OTP initiate accepts mfa_option_id
- [ ] OTP verify with correct code returns tokens
- [ ] OTP verify with incorrect code returns 400

### MFA - Push
- [ ] Push initiate returns display_number
- [ ] Mobile approve endpoint validates selected_number
- [ ] Web polling detects approval status change
- [ ] Push verify returns tokens after approval

### eSign
- [ ] eSign required response includes document details
- [ ] Document retrieval works with snake_case path param
- [ ] Accept returns all 3 tokens
- [ ] Mandatory eSign cannot be skipped

### Device Trust
- [ ] device_bound flag accurately reflects trust status
- [ ] Device bind accepts transaction_id
- [ ] already_trusted flag works correctly

### Token Management
- [ ] All 3 tokens returned on successful auth
- [ ] Refresh token works with cookie auth
- [ ] id_token contains correct user claims
- [ ] Token expiry handled correctly

### Error Handling
- [ ] All error responses use new format
- [ ] Error codes match documentation
- [ ] 503 errors returned for service issues
- [ ] HTTP status codes are correct

---

## Support & Questions

For questions about these changes, please contact the CIAM Team or refer to:
- OpenAPI Specification: `openapi.yaml`
- This documentation: `API_CHANGES_DOCUMENTATION.md`
