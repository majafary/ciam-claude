# Enhanced Test User Table with API Call Flows

## Implementation Status Legend
- ✅ **IMPLEMENTED** - Fully working in current codebase
- 🔄 **DUPLICATE** - Redundant test user (maps to existing user)
- ⚠️ **PARTIAL** - Basic logic exists but no dedicated test user
- ❌ **MISSING** - Feature not implemented

---

## Complete Use Case Table with API Flows

| **Use Case ID** | **Test Username** | **Implementation Status** | **Login Response** | **MFA Flow** | **eSign** | **Device Binding** | **Final Result** | **API Call Sequence** |
|-----------------|-------------------|--------------------------|-------------------|--------------|-----------|-------------------|------------------|-----------------------|
| **A1** | `trusteduser` | ⚠️ **PARTIAL** (use `mfauser` + trusted device) | SUCCESS | Bypassed | Not Required | Already Bound | ✅ Instant login | 1→ POST /auth/login → SUCCESS |
| **A2** | `trustedesignuser` | ❌ **MISSING** (eSign not implemented) | ESIGN_REQUIRED | Bypassed | User Must Accept | Already Bound | ✅ Login + eSign only | 1→ POST /auth/login → ESIGN_REQUIRED<br>2→ POST /esign/accept → SUCCESS |
| **A3** | `trusteddeclineuser` | ❌ **MISSING** (eSign not implemented) | ESIGN_REQUIRED | Bypassed | User Declines | Already Bound | ❌ **Fails at eSign** | 1→ POST /auth/login → ESIGN_REQUIRED<br>2→ POST /esign/decline → ESIGN_DECLINED |
| **B1** | `mfauser` | ✅ **IMPLEMENTED** | MFA_REQUIRED | Complete OTP | Not Required | User Choice | ✅ Full flow success | 1→ POST /auth/login → MFA_REQUIRED<br>2→ POST /auth/mfa/initiate (method=otp)<br>3→ POST /auth/mfa/verify (code=1234) → SUCCESS |
| **B2** | `mfaesignuser` | ❌ **MISSING** (eSign not implemented) | MFA_REQUIRED | Complete OTP | User Accepts | User Choice | ✅ Complete enterprise flow | 1→ POST /auth/login → MFA_REQUIRED<br>2→ POST /auth/mfa/initiate<br>3→ POST /auth/mfa/verify → ESIGN_REQUIRED<br>4→ POST /esign/accept → SUCCESS |
| **B3** | `mfaesigndecline` | ❌ **MISSING** (eSign not implemented) | MFA_REQUIRED | Complete OTP | User Declines | N/A | ❌ **Fails at eSign** | 1→ POST /auth/login → MFA_REQUIRED<br>2→ POST /auth/mfa/initiate<br>3→ POST /auth/mfa/verify → ESIGN_REQUIRED<br>4→ POST /esign/decline → ESIGN_DECLINED |
| **B4** | `mfapushuser` | 🔄 **DUPLICATE** of B1 (use `mfauser`) | MFA_REQUIRED | Push Auto-Approve | Not Required | User Choice | ✅ Push flow success | 1→ POST /auth/login → MFA_REQUIRED<br>2→ POST /auth/mfa/initiate (method=push)<br>3→ GET /mfa/transaction/:id (poll until APPROVED)<br>4→ POST /auth/mfa/verify → SUCCESS |
| **B5** | `pushfail` | ✅ **IMPLEMENTED** | MFA_REQUIRED | Push Auto-Reject | N/A | N/A | ❌ **Push rejection** | 1→ POST /auth/login → MFA_REQUIRED<br>2→ POST /auth/mfa/initiate (method=push)<br>3→ GET /mfa/transaction/:id → REJECTED (after 7s)<br>4→ POST /auth/mfa/verify → INCORRECT_NUMBER |
| **B6** | `pushexpired` | ✅ **IMPLEMENTED** | MFA_REQUIRED | Push Timeout | N/A | N/A | ❌ **Timeout failure** | 1→ POST /auth/login → MFA_REQUIRED<br>2→ POST /auth/mfa/initiate (method=push)<br>3→ GET /mfa/transaction/:id → PENDING (stays forever)<br>4→ Frontend detects expiry via expiresAt |
| **C1** | `invaliduser` + `wrongpass` | ⚠️ **PARTIAL** (any invalid combo) | INVALID_CREDENTIALS | N/A | N/A | N/A | ❌ **Bad credentials** | 1→ POST /auth/login → INVALID_CREDENTIALS (401) |
| **C2** | `lockeduser` | ✅ **IMPLEMENTED** | ACCOUNT_LOCKED | N/A | N/A | N/A | ❌ **Account locked** | 1→ POST /auth/login → ACCOUNT_LOCKED (423) |
| **C3** | `nonexistentuser` | ⚠️ **PARTIAL** (same as C1) | INVALID_CREDENTIALS | N/A | N/A | N/A | ❌ **User not found** | 1→ POST /auth/login → INVALID_CREDENTIALS (401) |
| **D1** | `expiredtrustuser` | ❌ **MISSING** (trust expiry logic) | MFA_REQUIRED | Complete OTP | Per Policy | Re-bind Option | ✅ Fresh security cycle | 1→ POST /auth/login → MFA_REQUIRED (reason: TRUST_EXPIRED)<br>2→ MFA flow → SUCCESS with fresh device bind |
| **D2** | `riskuser` | ❌ **MISSING** (risk detection) | MFA_REQUIRED | Complete OTP | Per Policy | User Choice | ✅ Adaptive security | 1→ POST /auth/login → MFA_REQUIRED (reason: RISK_DETECTED)<br>2→ MFA flow → SUCCESS |
| **D3** | `corrupttrustuser` | ❌ **MISSING** (trust corruption) | MFA_REQUIRED | Complete OTP | Per Policy | Re-bind Option | ✅ Graceful degradation | 1→ POST /auth/login → MFA_REQUIRED (reason: TRUST_CORRUPT)<br>2→ MFA flow → SUCCESS with forced rebind |
| **E1** | `firsttimeuser` | ❌ **MISSING** (first login flow) | MFA_REQUIRED | Complete OTP | **Always Required** | User Choice | ✅ Onboarding compliance | 1→ POST /auth/login → MFA_REQUIRED (is_first_login=true)<br>2→ MFA flow → ESIGN_REQUIRED<br>3→ POST /esign/accept → SUCCESS |
| **E2** | `adminresetuser` | ❌ **MISSING** (admin reset) | MFA_REQUIRED | Complete OTP | Per Policy | Fresh Binding | ✅ Policy enforcement | 1→ POST /auth/login → MFA_REQUIRED (reason: ADMIN_RESET)<br>2→ MFA flow → SUCCESS with forced rebind |
| **E3** | `complianceuser` | ❌ **MISSING** (compliance flow) | SUCCESS or MFA_REQ | Any | **Force Required** | Per Flow | ✅ T&C compliance | 1→ POST /auth/login → SUCCESS (compliance_pending=true)<br>2→ POST /auth/post-login-check → ESIGN_REQUIRED<br>3→ POST /esign/accept → SUCCESS |
| **N/A** | `mfalockeduser` | ✅ **IMPLEMENTED** (extra) | MFA_LOCKED | N/A | N/A | N/A | ❌ **MFA locked** | 1→ POST /auth/login → MFA_LOCKED (423) |

---

## Detailed API Request/Response Examples

### **A1: Trusted Device - Instant Login** ✅ WORKING
**Username:** `mfauser` (with previously bound device)
**Implementation:** Use existing `mfauser` with valid `drs_action_token`

#### API Flow:
```javascript
// Step 1: Login with device fingerprint
POST /auth/login
{
  "username": "mfauser",
  "password": "password",
  "drs_action_token": "action_abc123xyz"
}

// Response: SUCCESS (MFA bypassed due to trusted device)
200 OK
{
  "responseTypeCode": "SUCCESS",
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 900,
  "sessionId": "session-1727699100000",
  "transactionId": "txn-1727699100000-abc123",
  "deviceFingerprint": "device_789456_1a2b3c",
  "mfa_skipped": true,
  "user": {
    "id": "mfauser",
    "username": "mfauser",
    "email": "mfauser@example.com",
    "roles": ["user"]
  }
}

// Step 2: Get user info with access token
GET /userinfo
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

200 OK
{
  "sub": "mfauser",
  "preferred_username": "mfauser",
  "email": "mfauser@example.com",
  "email_verified": true,
  "given_name": "Mfauser",
  "family_name": "User",
  "roles": ["user"],
  "lastLoginAt": "2025-09-29T15:30:00.000Z"
}
```

**Key Fields:**
- `responseTypeCode`: "SUCCESS" - indicates authentication completed
- `sessionId`: Unique identifier for this login session
- `transactionId`: Transaction tracking ID for correlation
- `deviceFingerprint`: Device identification hash from DRS token
- `mfa_skipped`: true - confirms MFA was bypassed via device trust

---

### **B1: MFA Required - OTP Flow** ✅ WORKING
**Username:** `mfauser` (without trusted device)

#### API Flow:
```javascript
// Step 1: Initial login
POST /auth/login
{
  "username": "mfauser",
  "password": "password",
  "drs_action_token": "action_newdevice123"
}

// Response: MFA_REQUIRED
428 Precondition Required
{
  "responseTypeCode": "MFA_REQUIRED",
  "message": "Multi-factor authentication required",
  "mfa_required": true,
  "available_methods": ["otp", "push"],
  "sessionId": "session-1727699200000",
  "transactionId": "txn-1727699200000-def456",
  "deviceFingerprint": "device_123789_4d5e6f"
}

// Step 2: Initiate OTP challenge
POST /auth/mfa/initiate
{
  "method": "otp",
  "username": "mfauser",
  "sessionId": "session-1727699200000"
}

// Response: Challenge created
200 OK
{
  "success": true,
  "transactionId": "mfa-otp-mfauser-1727699200000",
  "challengeStatus": "PENDING",
  "expiresAt": "2025-09-30T16:05:10.000Z",
  "message": "OTP sent to your device"
}

// Step 3: Verify OTP
POST /auth/mfa/verify
{
  "transactionId": "mfa-otp-mfauser-1727699200000",
  "method": "otp",
  "code": "1234",
  "deviceFingerprint": "device_123789_4d5e6f"  // Bind device after MFA
}

// Response: Authentication successful
200 OK
{
  "success": true,
  "id_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 900,
  "sessionId": "session-1727699210000",
  "transactionId": "mfa-otp-mfauser-1727699200000",
  "deviceFingerprint": "device_123789_4d5e6f",
  "device_bound": true,
  "message": "MFA verification successful"
}
```

**Key Fields:**
- `available_methods`: ["otp", "push"] - user can choose method
- `challengeStatus`: "PENDING" → becomes verified on successful code entry
- `device_bound`: true - device was bound during this MFA verification

---

### **B4: MFA Required - Push Flow** ✅ WORKING (🔄 DUPLICATE of B1)
**Username:** `mfauser` (same user as B1, just use push method)
**Note:** This is a DUPLICATE test user. Use `mfauser` and select "push" method.

#### API Flow:
```javascript
// Step 1: Initial login (same as B1)
POST /auth/login
// ... same as B1 ...

// Step 2: Initiate Push challenge
POST /auth/mfa/initiate
{
  "method": "push",
  "username": "mfauser",
  "sessionId": "session-1727699200000"
}

// Response: Push challenge created
200 OK
{
  "success": true,
  "transactionId": "mfa-push-mfauser-1727699300000",
  "challengeStatus": "PENDING",
  "expiresAt": "2025-09-30T16:10:10.000Z",
  "displayNumber": 7,  // Number shown to user on their screen
  "message": "Push notification sent. Select the number shown below on your mobile device"
}

// Step 3: Poll for push status (every 2 seconds)
GET /mfa/transaction/mfa-push-mfauser-1727699300000

// Response: Still pending (t=0-4s)
200 OK
{
  "transactionId": "mfa-push-mfauser-1727699300000",
  "challengeStatus": "PENDING",
  "updatedAt": "2025-09-30T16:10:03.000Z",
  "expiresAt": "2025-09-30T16:10:10.000Z",
  "displayNumber": 7,
  "message": "Push challenge pending user selection"
}

// Response: Auto-approved after 5s (mfauser auto-selects correct number)
200 OK
{
  "transactionId": "mfa-push-mfauser-1727699300000",
  "challengeStatus": "APPROVED",
  "updatedAt": "2025-09-30T16:10:05.000Z",
  "expiresAt": "2025-09-30T16:10:10.000Z",
  "displayNumber": 7,
  "selectedNumber": 7,  // Auto-selected correct number
  "message": "User selected correct number: 7"
}

// Step 4: Verify push
POST /auth/mfa/verify
{
  "transactionId": "mfa-push-mfauser-1727699300000",
  "method": "push",
  "selectedNumber": 7,
  "deviceFingerprint": "device_123789_4d5e6f"
}

// Response: Success
200 OK
{
  "success": true,
  "id_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 900,
  "sessionId": "session-1727699305000",
  "transactionId": "mfa-push-mfauser-1727699300000",
  "deviceFingerprint": "device_123789_4d5e6f",
  "device_bound": true,
  "message": "Push verification successful - correct number selected: 7"
}
```

**Key Behaviors:**
- Push generates 3 random numbers, displays 1 correct number to user
- Status polling required to detect when user selects number on device
- `mfauser` auto-approves after 5 seconds (simulates user selecting correct number)
- `displayNumber`: The number shown on user's screen (must match mobile selection)
- `selectedNumber`: The number user actually selected on mobile device

---

### **B5: Push Rejection** ✅ WORKING
**Username:** `pushfail`

#### API Flow:
```javascript
// Steps 1-2: Same as B4 (login + initiate push)

// Step 3: Poll for status - Auto-rejects after 7s
GET /mfa/transaction/mfa-push-pushfail-1727699400000

// Response: Rejected (after 7s)
200 OK
{
  "transactionId": "mfa-push-pushfail-1727699400000",
  "challengeStatus": "REJECTED",
  "updatedAt": "2025-09-30T16:15:07.000Z",
  "expiresAt": "2025-09-30T16:15:10.000Z",
  "displayNumber": 5,
  "selectedNumber": 3,  // Auto-selected WRONG number
  "message": "User selected wrong number: 3"
}

// Step 4: Attempt verification (will fail)
POST /auth/mfa/verify
{
  "transactionId": "mfa-push-pushfail-1727699400000",
  "method": "push",
  "selectedNumber": 3
}

// Response: Verification failed
400 Bad Request
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
- `challengeStatus` changes from "PENDING" to "REJECTED"
- Verification returns error with retry option

---

### **B6: Push Timeout** ✅ WORKING
**Username:** `pushexpired`

#### API Flow:
```javascript
// Steps 1-2: Same as B4 (login + initiate push)

// Step 3: Poll for status - NEVER resolves (stays PENDING forever)
GET /mfa/transaction/mfa-push-pushexpired-1727699500000

// Response: Always pending, even after expiry
200 OK
{
  "transactionId": "mfa-push-pushexpired-1727699500000",
  "challengeStatus": "PENDING",
  "updatedAt": "2025-09-30T16:20:12.000Z",
  "expiresAt": "2025-09-30T16:20:10.000Z",  // Already expired!
  "displayNumber": 4,
  "message": "Push challenge pending user selection"
}

// Step 4: Frontend detects timeout
// Client-side logic: if (Date.now() > new Date(expiresAt)) { showTimeout(); }
// No verification attempt is made
```

**Key Behavior:**
- Never auto-resolves (stays PENDING indefinitely)
- Frontend must detect timeout by comparing `expiresAt` with current time
- User sees "Push notification expired. Please try again." message

---

### **C1: Invalid Credentials** ⚠️ PARTIAL
**Username:** Any invalid combination (e.g., `invaliduser` / `wrongpass`)

#### API Flow:
```javascript
POST /auth/login
{
  "username": "invaliduser",
  "password": "wrongpass"
}

// Response: Invalid credentials
401 Unauthorized
{
  "responseTypeCode": "INVALID_CREDENTIALS",
  "message": "Invalid username or password",
  "timestamp": "2025-09-30T16:25:00.000Z",
  "sessionId": "session-1727699700000",
  "transactionId": "txn-1727699700000-invalid"
}
```

---

### **C2: Account Locked** ✅ WORKING
**Username:** `lockeduser`

#### API Flow:
```javascript
POST /auth/login
{
  "username": "lockeduser",
  "password": "password"
}

// Response: Account locked
423 Locked
{
  "responseTypeCode": "ACCOUNT_LOCKED",
  "message": "Account is temporarily locked",
  "timestamp": "2025-09-30T16:30:00.000Z",
  "sessionId": "session-1727700000000",
  "transactionId": "txn-1727700000000-locked"
}
```

---

### **MFA Locked** ✅ WORKING (Extra scenario)
**Username:** `mfalockeduser`

#### API Flow:
```javascript
POST /auth/login
{
  "username": "mfalockeduser",
  "password": "password"
}

// Response: MFA locked
423 Locked
{
  "responseTypeCode": "MFA_LOCKED",
  "message": "Your MFA has been locked due to too many failed attempts. Please call our call center at 1-800-SUPPORT to reset your MFA setup.",
  "timestamp": "2025-09-30T16:35:00.000Z",
  "sessionId": "session-1727700300000",
  "transactionId": "txn-1727700300000-mfalocked"
}
```

---

## Missing Scenarios - Implementation Required

### **A2: Trusted Device + eSign** ❌ MISSING
**Requires:** eSign implementation + `trustedesignuser`

#### Proposed API Flow:
```javascript
// Step 1: Login with trusted device
POST /auth/login
{
  "username": "trustedesignuser",
  "password": "password",
  "drs_action_token": "action_trusted123"
}

// Response: eSign required (MFA bypassed)
200 OK
{
  "responseTypeCode": "ESIGN_REQUIRED",
  "sessionId": "session-123",
  "transactionId": "txn-123",
  "esign_document_id": "terms-v1-2025",
  "esign_url": "/esign/document/terms-v1-2025",
  "message": "Please review and accept the updated terms and conditions"
}

// Step 2: Accept eSign
POST /esign/accept  // NEW ENDPOINT
{
  "transactionId": "txn-123",
  "document_id": "terms-v1-2025",
  "acceptance_ip": "192.168.1.1",
  "acceptance_timestamp": "2025-09-30T16:40:00.000Z"
}

// Response: Success
200 OK
{
  "responseTypeCode": "SUCCESS",
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 900,
  "sessionId": "session-123",
  "transactionId": "txn-123",
  "esign_accepted": true,
  "esign_accepted_at": "2025-09-30T16:40:00.000Z"
}
```

---

### **D1: Expired Device Trust** ❌ MISSING
**Requires:** Trust expiry logic + `expiredtrustuser`

#### Proposed API Flow:
```javascript
// Step 1: Login with expired device trust
POST /auth/login
{
  "username": "expiredtrustuser",
  "password": "password",
  "drs_action_token": "action_expired456"
}

// Response: MFA required (trust expired)
428 Precondition Required
{
  "responseTypeCode": "MFA_REQUIRED",
  "message": "Device trust expired. Please complete MFA to re-authenticate.",
  "reason": "TRUST_EXPIRED",
  "trust_expired_at": "2025-09-25T10:00:00.000Z",
  "sessionId": "session-123",
  "transactionId": "txn-123",
  "available_methods": ["otp", "push"]
}

// Steps 2-4: Complete MFA flow (same as B1)
// Device can be re-bound during MFA verification
```

---

### **E1: First-Time User** ❌ MISSING
**Requires:** First login detection + mandatory eSign + `firsttimeuser`

#### Proposed API Flow:
```javascript
// Step 1: First login
POST /auth/login
{
  "username": "firsttimeuser",
  "password": "temporaryPassword123"
}

// Response: MFA required
428 Precondition Required
{
  "responseTypeCode": "MFA_REQUIRED",
  "message": "First-time login. MFA setup required.",
  "is_first_login": true,
  "must_change_password": false,
  "sessionId": "session-123",
  "transactionId": "txn-123",
  "available_methods": ["otp", "push"]
}

// Steps 2-4: Complete MFA flow

// Step 5: Post-MFA check
POST /auth/post-mfa-check  // NEW ENDPOINT
{
  "sessionId": "session-123",
  "transactionId": "txn-123"
}

// Response: eSign required
200 OK
{
  "responseTypeCode": "ESIGN_REQUIRED",
  "message": "Welcome! Please review and accept our terms of service.",
  "esign_document_id": "terms-v1-2025",
  "is_mandatory": true,
  "is_first_login": true
}

// Step 6: Accept eSign
POST /esign/accept
// ... accepts terms ...

// Response: Success
{
  "responseTypeCode": "SUCCESS",
  "access_token": "...",
  "onboarding_complete": true
}
```

---

## Key Field Glossary

### `responseTypeCode` Values
| Value | HTTP Status | Meaning | Next Action |
|-------|-------------|---------|-------------|
| `SUCCESS` | 200 | Authentication completed | Proceed with access |
| `MFA_REQUIRED` | 428 | MFA challenge needed | Initiate MFA |
| `ESIGN_REQUIRED` | 200 | eSign acceptance needed | Show eSign document |
| `ACCOUNT_LOCKED` | 423 | Account is locked | Show error, contact support |
| `MFA_LOCKED` | 423 | MFA is locked | Show error with call center info |
| `INVALID_CREDENTIALS` | 401 | Bad username/password | Show error, allow retry |
| `ESIGN_DECLINED` | 400 | User declined eSign | Show error, logout |

### `sessionId`
- **Purpose:** Unique session identifier for the authentication attempt
- **Generated:** At login (/auth/login)
- **Used In:** All subsequent calls (MFA initiate, verify, eSign, etc.)
- **Format:** `session-{timestamp}`
- **Lifecycle:** Created at login → carried through all steps → linked to final access token

### `transactionId`
- **Purpose:** Unique transaction identifier for the entire auth flow
- **Generated:** At login (/auth/login)
- **Used In:** MFA initiate, verify, eSign operations
- **Format:** `txn-{timestamp}-{random}` or `mfa-{method}-{username}-{timestamp}`
- **Lifecycle:** Created at login → used for correlation → enables replay protection

### `deviceFingerprint`
- **Purpose:** Device identification for trust management
- **Generated:** From `drs_action_token` at login
- **Used For:**
  - Checking if device is trusted (MFA bypass)
  - Binding device during MFA verification
  - Risk detection (new device, unusual location)
- **Format:** `device_{hash}_{timestamp}`
- **Lifecycle:** Generated → checked → optionally bound → stored for future trust checks

### `challengeStatus`
| Value | Meaning | Polling Continues? |
|-------|---------|-------------------|
| `PENDING` | Waiting for user action | Yes |
| `APPROVED` | User approved/correct action | No - proceed to verify |
| `REJECTED` | User rejected/wrong action | No - show error |
| `EXPIRED` | Challenge timed out | No - restart flow |

---

## Recommendations

### 1. **Eliminate Duplicate Test Users**
- ✅ **Remove from table:** `mfapushuser` (B4) - use `mfauser` with push method
- ✅ **Keep:** `mfauser` for both OTP (B1) and Push (B4) flows

### 2. **Create Dedicated Test Users for Partial Scenarios**
- ✅ **Add:** `trusteduser` specifically for A1 (instant login)
- ✅ **Add:** `invaliduser` for C1 testing
- ✅ **Add:** `nonexistentuser` for C3 testing

### 3. **Implement Missing Features (Priority Order)**

**Phase 1: eSign Foundation (High Priority)**
- Create `/esign/*` endpoints (accept, decline, document retrieval)
- Add `ESIGN_REQUIRED` and `ESIGN_DECLINED` response codes
- Implement test users: `trustedesignuser`, `trusteddeclineuser`, `mfaesignuser`, `mfaesigndecline`

**Phase 2: Device Trust Edge Cases (Medium Priority)**
- Implement device trust expiry logic
- Add risk-based MFA triggers
- Implement test users: `expiredtrustuser`, `riskuser`, `corrupttrustuser`

**Phase 3: Onboarding & Compliance (Low Priority)**
- Implement first-time login flow
- Add admin reset handling
- Add compliance/T&C flows
- Implement test users: `firsttimeuser`, `adminresetuser`, `complianceuser`

### 4. **New Endpoints Required**
```
POST   /esign/accept                - Accept eSign document
POST   /esign/decline               - Decline eSign document
GET    /esign/document/:id          - Retrieve eSign document
POST   /auth/post-mfa-check         - Check for post-MFA requirements
POST   /auth/post-login-check       - Check for post-login requirements
GET    /auth/device-trust/status    - Check device trust status
POST   /auth/device-trust/revoke    - Revoke device trust
```

---

## Summary Statistics

| Category | Count | Percentage |
|----------|-------|------------|
| ✅ Fully Implemented | 6 | 33% |
| 🔄 Duplicates (to remove) | 1 | 6% |
| ⚠️ Partially Implemented | 3 | 17% |
| ❌ Missing (need implementation) | 10 | 56% |
| **Total Use Cases** | **18** (+ 1 extra) | **100%** |

**Implementation Gap:** 56% of use cases require new features (primarily eSign and device trust edge cases)
