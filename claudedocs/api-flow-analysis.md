# CIAM API Flow Analysis - Complete Test User Mapping

## Executive Summary

This document maps all test users from the requirements table to the current implementation, identifies duplicates, documents API call flows, and highlights gaps for future implementation.

---

## Current Implementation Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/auth/login` | POST | Initial authentication with optional device fingerprint |
| `/auth/mfa/initiate` | POST | Start MFA challenge (OTP or Push) |
| `/mfa/transaction/:transactionId` | GET | Poll MFA transaction status (for Push) |
| `/auth/mfa/verify` | POST | Verify MFA with OTP code or Push result |
| `/userinfo` | GET | Get authenticated user information |
| `/auth/refresh` | POST | Refresh access token using refresh token |
| `/auth/logout` | POST | Logout and clear tokens |

---

## Test User Mapping & Duplicate Analysis

### ✅ IMPLEMENTED Test Users

| Table ID | Table Username | Code Username | Status | Notes |
|----------|----------------|---------------|--------|-------|
| **B1** | `mfauser` | `mfauser` | ✅ EXACT MATCH | Full MFA flow with OTP/Push |
| **B4** | `mfapushuser` | `mfauser` | 🔄 **DUPLICATE** | Same as B1, just use Push method |
| **B5** | `pushfail` | `pushfail` | ✅ EXACT MATCH | Push auto-rejects after 7s |
| **B6** | `pushexpired` | `pushexpired` | ✅ EXACT MATCH | Push times out after 10s |
| **C2** | `lockeduser` | `lockeduser` | ✅ EXACT MATCH | Account locked error |
| **N/A** | `mfalockeduser` | `mfalockeduser` | ✅ IMPLEMENTED | MFA locked scenario |

### 🔄 PARTIALLY IMPLEMENTED

| Table ID | Table Username | Code Equivalent | Implementation Status |
|----------|----------------|-----------------|----------------------|
| **A1** | `trusteduser` | `testuser` + trusted device | ⚠️ PARTIAL | Device trust works, but no dedicated test user |
| **C1** | `invaliduser` + `wrongpass` | Any invalid combo | ⚠️ PARTIAL | Default error handler, no specific user |
| **C3** | `nonexistentuser` | Any non-existent user | ⚠️ PARTIAL | Same as C1 |

### ❌ NOT IMPLEMENTED

| Table ID | Table Username | Missing Feature |
|----------|----------------|-----------------|
| **A2** | `trustedesignuser` | eSign flow |
| **A3** | `trusteddeclineuser` | eSign decline handling |
| **B2** | `mfaesignuser` | MFA + eSign flow |
| **B3** | `mfaesigndecline` | MFA + eSign decline |
| **D1** | `expiredtrustuser` | Expired device trust handling |
| **D2** | `riskuser` | Risk-based adaptive MFA |
| **D3** | `corrupttrustuser` | Corrupt trust data recovery |
| **E1** | `firsttimeuser` | First-time login with mandatory eSign |
| **E2** | `adminresetuser` | Admin reset flow |
| **E3** | `complianceuser` | T&C compliance flow |

---

## API Call Flow Documentation

### **A1: Trusted Device - Instant Login**
**Current Implementation:** `testuser` OR `mfauser` with trusted device
**Status:** ✅ Working

#### Request/Response Flow:
```
1. POST /auth/login
   Request:
   {
     "username": "mfauser",
     "password": "password",
     "drs_action_token": "action_xyz123..."
   }

   Response (Device Trusted - MFA Bypassed):
   {
     "responseTypeCode": "SUCCESS",
     "access_token": "eyJhbGc...",
     "token_type": "Bearer",
     "expires_in": 900,
     "sessionId": "session-1234567890",
     "transactionId": "txn-1234567890-abc123",
     "deviceFingerprint": "device_123456_xyz",
     "mfa_skipped": true,
     "user": { "id": "mfauser", "username": "mfauser", ... }
   }

2. GET /userinfo (with Bearer token)
   Response:
   {
     "sub": "mfauser",
     "preferred_username": "mfauser",
     "email": "mfauser@example.com",
     "lastLoginAt": "2025-09-30T10:15:30.000Z"
   }
```

**Key Fields:**
- `responseTypeCode`: "SUCCESS" (MFA bypassed)
- `sessionId`: Unique session identifier for this login
- `transactionId`: Transaction tracking ID
- `deviceFingerprint`: Device identification hash
- `mfa_skipped`: true (indicates device trust bypass)

---

### **A2: Trusted Device + eSign Required**
**Required Username:** `trustedesignuser`
**Status:** ❌ NOT IMPLEMENTED

#### Proposed Flow:
```
1. POST /auth/login
   Response:
   {
     "responseTypeCode": "ESIGN_REQUIRED",
     "sessionId": "session-123",
     "transactionId": "txn-123",
     "esign_document_id": "doc-456",
     "esign_url": "/esign/doc-456",
     "message": "Please review and accept the agreement"
   }

2. POST /esign/accept (NEW ENDPOINT)
   Request:
   {
     "transactionId": "txn-123",
     "document_id": "doc-456",
     "signature": "user_signature_data"
   }

   Response:
   {
     "responseTypeCode": "SUCCESS",
     "access_token": "eyJhbGc...",
     ...
   }
```

---

### **A3: Trusted Device + eSign Declined**
**Required Username:** `trusteddeclineuser`
**Status:** ❌ NOT IMPLEMENTED

#### Proposed Flow:
```
1. POST /auth/login
   Response: (Same as A2)

2. POST /esign/decline (NEW ENDPOINT)
   Request:
   {
     "transactionId": "txn-123",
     "document_id": "doc-456",
     "reason": "user_declined"
   }

   Response:
   {
     "responseTypeCode": "ESIGN_DECLINED",
     "message": "Authentication failed. Agreement must be accepted.",
     "sessionId": "",
     "can_retry": true
   }
```

---

### **B1: MFA Required - OTP Flow**
**Current Implementation:** `mfauser`
**Status:** ✅ Working

#### Request/Response Flow:
```
1. POST /auth/login
   Request:
   {
     "username": "mfauser",
     "password": "password",
     "drs_action_token": "action_xyz123..."
   }

   Response (Device NOT Trusted):
   {
     "responseTypeCode": "MFA_REQUIRED",
     "message": "Multi-factor authentication required",
     "mfa_required": true,
     "available_methods": ["otp", "push"],
     "sessionId": "session-1234567890",
     "transactionId": "txn-1234567890-abc123",
     "deviceFingerprint": "device_123456_xyz"
   }

2. POST /auth/mfa/initiate
   Request:
   {
     "method": "otp",
     "username": "mfauser",
     "sessionId": "session-1234567890"
   }

   Response:
   {
     "success": true,
     "transactionId": "mfa-otp-mfauser-1234567890",
     "challengeStatus": "PENDING",
     "expiresAt": "2025-09-30T10:25:40.000Z",
     "message": "OTP sent to your device"
   }

3. POST /auth/mfa/verify
   Request:
   {
     "transactionId": "mfa-otp-mfauser-1234567890",
     "method": "otp",
     "code": "1234",
     "deviceFingerprint": "device_123456_xyz"  // Optional: bind device
   }

   Response:
   {
     "success": true,
     "id_token": "eyJhbGc...",
     "access_token": "eyJhbGc...",
     "token_type": "Bearer",
     "expires_in": 900,
     "sessionId": "session-1234567891",
     "transactionId": "mfa-otp-mfauser-1234567890",
     "deviceFingerprint": "device_123456_xyz",
     "device_bound": true,
     "message": "MFA verification successful"
   }
```

**Key Fields:**
- `responseTypeCode`: "MFA_REQUIRED" (step 1) → "SUCCESS" (step 3)
- `available_methods`: ["otp", "push"] - methods user can choose
- `challengeStatus`: "PENDING" → verified via code submission
- `device_bound`: true if deviceFingerprint provided in verify request

---

### **B4: MFA Required - Push Flow**
**Current Implementation:** `mfauser` (DUPLICATE with B1, same user)
**Status:** ✅ Working, 🔄 **DUPLICATE USER**

#### Request/Response Flow:
```
1. POST /auth/login
   Response: (Same as B1)

2. POST /auth/mfa/initiate
   Request:
   {
     "method": "push",
     "username": "mfauser",
     "sessionId": "session-1234567890"
   }

   Response:
   {
     "success": true,
     "transactionId": "mfa-push-mfauser-1234567890",
     "challengeStatus": "PENDING",
     "expiresAt": "2025-09-30T10:25:50.000Z",
     "displayNumber": 7,  // Number to display on UI
     "message": "Push notification sent. Select the number shown below on your mobile device"
   }

3. GET /mfa/transaction/mfa-push-mfauser-1234567890 (Polling every 2s)
   Response (While Pending):
   {
     "transactionId": "mfa-push-mfauser-1234567890",
     "challengeStatus": "PENDING",
     "updatedAt": "2025-09-30T10:25:42.000Z",
     "expiresAt": "2025-09-30T10:25:50.000Z",
     "displayNumber": 7,
     "message": "Push challenge pending user selection"
   }

   Response (After 5s - Auto-Approved for mfauser):
   {
     "transactionId": "mfa-push-mfauser-1234567890",
     "challengeStatus": "APPROVED",
     "updatedAt": "2025-09-30T10:25:45.000Z",
     "expiresAt": "2025-09-30T10:25:50.000Z",
     "displayNumber": 7,
     "selectedNumber": 7,  // Auto-selected correct number
     "message": "User selected correct number: 7"
   }

4. POST /auth/mfa/verify
   Request:
   {
     "transactionId": "mfa-push-mfauser-1234567890",
     "method": "push",
     "selectedNumber": 7,
     "deviceFingerprint": "device_123456_xyz"
   }

   Response:
   {
     "success": true,
     "id_token": "eyJhbGc...",
     "access_token": "eyJhbGc...",
     "token_type": "Bearer",
     "expires_in": 900,
     "sessionId": "session-1234567892",
     "transactionId": "mfa-push-mfauser-1234567890",
     "deviceFingerprint": "device_123456_xyz",
     "device_bound": true,
     "message": "Push verification successful - correct number selected: 7"
   }
```

**Key Behavior:**
- Push challenges generate 3 random numbers, display 1 correct number
- Status polling required to detect user action on mobile device
- Auto-approved after 5s for `mfauser` (simulates user selecting correct number)

---

### **B5: Push Rejection**
**Current Implementation:** `pushfail`
**Status:** ✅ Working

#### Request/Response Flow:
```
1-2. POST /auth/login → POST /auth/mfa/initiate
     (Same as B4)

3. GET /mfa/transaction/mfa-push-pushfail-1234567890 (Polling)
   Response (After 7s - Auto-Rejected):
   {
     "transactionId": "mfa-push-pushfail-1234567890",
     "challengeStatus": "REJECTED",
     "updatedAt": "2025-09-30T10:25:47.000Z",
     "expiresAt": "2025-09-30T10:25:50.000Z",
     "displayNumber": 5,
     "selectedNumber": 3,  // Auto-selected wrong number
     "message": "User selected wrong number: 3"
   }

4. POST /auth/mfa/verify
   Request:
   {
     "transactionId": "mfa-push-pushfail-1234567890",
     "method": "push",
     "selectedNumber": 3
   }

   Response (400 Bad Request):
   {
     "success": false,
     "error": "INCORRECT_NUMBER",
     "message": "Incorrect number selected. You selected 3, but that was not the correct number.",
     "attempts": 1,
     "canRetry": true
   }
```

**Key Behavior:**
- Auto-selects wrong number after 7 seconds
- challengeStatus changes to "REJECTED"
- Verification fails with retry option

---

### **B6: Push Timeout**
**Current Implementation:** `pushexpired`
**Status:** ✅ Working

#### Request/Response Flow:
```
1-2. POST /auth/login → POST /auth/mfa/initiate
     (Same as B4)

3. GET /mfa/transaction/mfa-push-pushexpired-1234567890 (Polling)
   Response (Always Pending - Never Auto-Resolves):
   {
     "transactionId": "mfa-push-pushexpired-1234567890",
     "challengeStatus": "PENDING",
     "updatedAt": "2025-09-30T10:25:55.000Z",
     "expiresAt": "2025-09-30T10:25:50.000Z",  // Already expired
     "displayNumber": 4,
     "message": "Push challenge pending user selection"
   }

4. Frontend detects expiry (expiresAt < now)
   UI shows: "Push notification expired. Please try again."
```

**Key Behavior:**
- Never auto-resolves (stays PENDING forever)
- Frontend handles timeout based on `expiresAt` timestamp
- No verification attempt made

---

### **C1: Invalid Credentials**
**Current Implementation:** Any invalid username/password combo
**Status:** ⚠️ PARTIAL (no specific test user)

#### Request/Response Flow:
```
POST /auth/login
Request:
{
  "username": "invaliduser",
  "password": "wrongpass"
}

Response (401 Unauthorized):
{
  "responseTypeCode": "INVALID_CREDENTIALS",
  "message": "Invalid username or password",
  "timestamp": "2025-09-30T10:26:00.000Z",
  "sessionId": "session-1234567893",
  "transactionId": "txn-1234567893-abc123"
}
```

---

### **C2: Account Locked**
**Current Implementation:** `lockeduser`
**Status:** ✅ Working

#### Request/Response Flow:
```
POST /auth/login
Request:
{
  "username": "lockeduser",
  "password": "password"
}

Response (423 Locked):
{
  "responseTypeCode": "ACCOUNT_LOCKED",
  "message": "Account is temporarily locked",
  "timestamp": "2025-09-30T10:26:10.000Z",
  "sessionId": "session-1234567894",
  "transactionId": "txn-1234567894-abc123"
}
```

---

### **C3: Non-Existent User**
**Current Implementation:** Any non-existent username
**Status:** ⚠️ PARTIAL (same as C1)

#### Request/Response Flow:
```
Same as C1 - returns INVALID_CREDENTIALS
```

---

### **MFA Locked Scenario**
**Current Implementation:** `mfalockeduser`
**Status:** ✅ Working (not in original table)

#### Request/Response Flow:
```
POST /auth/login
Request:
{
  "username": "mfalockeduser",
  "password": "password"
}

Response (423 Locked):
{
  "responseTypeCode": "MFA_LOCKED",
  "message": "Your MFA has been locked due to too many failed attempts. Please call our call center at 1-800-SUPPORT to reset your MFA setup.",
  "timestamp": "2025-09-30T10:26:20.000Z",
  "sessionId": "session-1234567895",
  "transactionId": "txn-1234567895-abc123"
}
```

---

## Missing Use Cases - Required Implementation

### **D1: Expired Device Trust**
**Required:** `expiredtrustuser`

#### Proposed Flow:
```
1. POST /auth/login (with expired trust)
   Response:
   {
     "responseTypeCode": "MFA_REQUIRED",
     "message": "Device trust expired. Please complete MFA to re-authenticate.",
     "reason": "TRUST_EXPIRED",
     "sessionId": "session-123",
     "transactionId": "txn-123",
     "trust_expired_at": "2025-09-25T10:00:00.000Z"
   }

2-4. Complete MFA flow (same as B1)
```

---

### **D2: Risk-Based MFA**
**Required:** `riskuser`

#### Proposed Flow:
```
1. POST /auth/login (risk detected)
   Response:
   {
     "responseTypeCode": "MFA_REQUIRED",
     "message": "Unusual activity detected. Please verify your identity.",
     "reason": "RISK_DETECTED",
     "risk_factors": ["new_location", "new_device"],
     "sessionId": "session-123",
     "transactionId": "txn-123"
   }

2-4. Complete MFA flow
```

---

### **D3: Corrupt Device Trust**
**Required:** `corrupttrustuser`

#### Proposed Flow:
```
1. POST /auth/login (corrupt trust data)
   Response:
   {
     "responseTypeCode": "MFA_REQUIRED",
     "message": "Device verification failed. Please complete MFA.",
     "reason": "TRUST_CORRUPT",
     "sessionId": "session-123",
     "transactionId": "txn-123"
   }

2-4. Complete MFA flow with fresh device binding
```

---

### **E1: First-Time User (Mandatory eSign)**
**Required:** `firsttimeuser`

#### Proposed Flow:
```
1. POST /auth/login
   Response:
   {
     "responseTypeCode": "MFA_REQUIRED",
     "message": "First-time login. MFA setup required.",
     "is_first_login": true,
     "sessionId": "session-123",
     "transactionId": "txn-123"
   }

2-4. Complete MFA flow

5. POST /auth/post-mfa-check (NEW ENDPOINT)
   Response:
   {
     "responseTypeCode": "ESIGN_REQUIRED",
     "message": "Please review and accept our terms",
     "esign_document_id": "terms-v1",
     "is_mandatory": true
   }

6. POST /esign/accept
   Response:
   {
     "responseTypeCode": "SUCCESS",
     "access_token": "eyJhbGc...",
     ...
   }
```

---

### **E2: Admin Reset**
**Required:** `adminresetuser`

#### Proposed Flow:
```
1. POST /auth/login
   Response:
   {
     "responseTypeCode": "MFA_REQUIRED",
     "message": "Admin reset detected. Fresh MFA required.",
     "reason": "ADMIN_RESET",
     "reset_at": "2025-09-30T09:00:00.000Z",
     "sessionId": "session-123",
     "transactionId": "txn-123"
   }

2-4. Complete MFA flow with forced device rebinding
```

---

### **E3: Compliance/T&C Update**
**Required:** `complianceuser`

#### Proposed Flow:
```
1. POST /auth/login
   Response:
   {
     "responseTypeCode": "SUCCESS",  // Or MFA_REQUIRED based on policy
     "access_token": "eyJhbGc...",
     "compliance_pending": true,
     "sessionId": "session-123"
   }

2. POST /auth/post-login-check (NEW ENDPOINT)
   Response:
   {
     "responseTypeCode": "ESIGN_REQUIRED",
     "message": "Updated terms and conditions require your acceptance",
     "esign_document_id": "terms-v2",
     "is_mandatory": true,
     "force_logout_if_declined": true
   }

3. POST /esign/accept
   Response:
   {
     "compliance_accepted": true,
     "message": "Terms accepted successfully"
   }
```

---

## Key Field Usage Summary

### `responseTypeCode`
**Purpose:** Primary flow control indicator
**Values:**
- `SUCCESS` - Authentication completed
- `MFA_REQUIRED` - MFA challenge needed
- `ESIGN_REQUIRED` - eSign acceptance needed
- `ACCOUNT_LOCKED` - Account is locked
- `MFA_LOCKED` - MFA is locked
- `INVALID_CREDENTIALS` - Bad username/password
- `ESIGN_DECLINED` - User declined eSign

### `sessionId`
**Purpose:** Unique session identifier for the authentication attempt
**Lifecycle:**
- Generated at login
- Carried through all MFA steps
- Used for session management and tracking
- Included in all responses for correlation

### `transactionId`
**Purpose:** Unique transaction identifier for the entire auth flow
**Lifecycle:**
- Generated at login
- Used to correlate login → MFA → verification
- Required for MFA initiate and verify calls
- Enables transaction replay protection

### `deviceFingerprint`
**Purpose:** Device identification for trust management
**Lifecycle:**
- Generated from `drs_action_token` at login
- Checked against trusted devices for MFA bypass
- Optionally sent in MFA verify to bind device
- Stored server-side for future trust checks

---

## Recommendations

### 1. **Consolidate Duplicate Test Users**
- ✅ **Keep:** `mfauser` for both B1 (OTP) and B4 (Push)
- ❌ **Remove from table:** `mfapushuser` - redundant

### 2. **Implement Missing Test Users**
Priority order:
1. **High Priority:** eSign scenarios (A2, A3, B2, B3, E1, E3)
2. **Medium Priority:** Device trust edge cases (D1, D2, D3)
3. **Low Priority:** Admin scenarios (E2)

### 3. **New Endpoints Required**
- `POST /esign/accept` - Accept eSign document
- `POST /esign/decline` - Decline eSign document
- `GET /esign/document/:id` - Retrieve eSign document
- `POST /auth/post-mfa-check` - Check for post-MFA requirements
- `POST /auth/post-login-check` - Check for post-login requirements

### 4. **Enhanced `responseTypeCode` Values**
Add to type definition:
- `ESIGN_REQUIRED`
- `ESIGN_DECLINED`
- `TRUST_EXPIRED`
- `RISK_DETECTED`

---

## Test User Summary Table

| Use Case | Username | Status | Duplicate Of | Missing Feature |
|----------|----------|--------|--------------|-----------------|
| A1 | trusteduser | ⚠️ Partial | testuser + device trust | Dedicated user |
| A2 | trustedesignuser | ❌ Missing | - | eSign |
| A3 | trusteddeclineuser | ❌ Missing | - | eSign decline |
| B1 | mfauser | ✅ Working | - | - |
| B2 | mfaesignuser | ❌ Missing | - | MFA + eSign |
| B3 | mfaesigndecline | ❌ Missing | - | MFA + eSign decline |
| B4 | mfapushuser | 🔄 **DUPLICATE** | **B1 (mfauser)** | - |
| B5 | pushfail | ✅ Working | - | - |
| B6 | pushexpired | ✅ Working | - | - |
| C1 | invaliduser | ⚠️ Partial | Any invalid combo | Specific user |
| C2 | lockeduser | ✅ Working | - | - |
| C3 | nonexistentuser | ⚠️ Partial | Same as C1 | Specific user |
| D1 | expiredtrustuser | ❌ Missing | - | Trust expiry logic |
| D2 | riskuser | ❌ Missing | - | Risk detection |
| D3 | corrupttrustuser | ❌ Missing | - | Trust corruption |
| E1 | firsttimeuser | ❌ Missing | - | First login + eSign |
| E2 | adminresetuser | ❌ Missing | - | Admin reset flow |
| E3 | complianceuser | ❌ Missing | - | T&C compliance |
| N/A | mfalockeduser | ✅ Working | - | (Extra scenario) |

**Summary:**
- ✅ **6 Working** (including 1 not in table)
- 🔄 **1 Duplicate** (B4 = B1)
- ⚠️ **3 Partial** (basic logic works, no specific user)
- ❌ **10 Missing** (require new features)
