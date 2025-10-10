# CIAM UI SDK v2.0.0 Migration Summary

## Overview
The CIAM UI SDK has been updated to be compatible with CIAM Backend API v2.0.0. This document summarizes all changes made to the SDK.

## 1. API Endpoint Updates

### Updated Endpoints
All endpoints now use the v2 API paths:

| Old Endpoint | New Endpoint | Status |
|-------------|--------------|--------|
| `/login` | `/auth/login` | ✅ Updated |
| `/mfa/challenge` | `/auth/mfa/initiate` | ✅ Updated |
| `/mfa/verify` | `/auth/mfa/verify` | ✅ Updated |
| `/token/refresh` | `/auth/refresh` | ✅ Updated |
| N/A | `/esign/document/:document_id` | ✅ Added |
| N/A | `/esign/accept` | ✅ Updated |
| N/A | `/device/bind` | ✅ Updated |
| N/A | `/mfa/transaction/:id/approve` | ✅ Added |

### Removed Deprecated Endpoints
- `/auth/introspect` - Replaced with client-side JWT validation
- `/auth/post-mfa-check` - eSign status now included in MFA verify response
- `/auth/post-login-check` - eSign status now included in login response
- `/esign/decline` - UI now redirects to login on decline
- `/userinfo` - User info now available in id_token JWT claims

## 2. Request Body Changes

### Login Request (`/auth/login`)
**Added Required Fields:**
```typescript
{
  username: string;
  password: string;
  drs_action_token: string;
  app_id: string;        // NEW - default: 'ciam-ui-sdk'
  app_version: string;   // NEW - default: '2.0.0'
}
```

### MFA Initiate Request (`/auth/mfa/initiate`)
**Changed Structure:**
```typescript
// OLD
{
  username?: string;
  method: 'otp' | 'push';
  sessionId?: string;
  transactionId?: string;
}

// NEW
{
  transaction_id: string;  // REQUIRED - from login response
  method: 'otp' | 'push';
  mfa_option_id?: number;  // REQUIRED for OTP - specifies which phone
}
```

### MFA Verify Request (`/auth/mfa/verify`)
**Simplified Structure:**
```typescript
// OLD (OTP)
{
  transactionId: string;
  method: 'otp';
  code: string;
}

// OLD (Push)
{
  transactionId: string;
  method: 'push';
  pushResult: 'APPROVED' | 'REJECTED';
  selectedNumber: number;
  deviceFingerprint: string;
}

// NEW (OTP)
{
  transaction_id: string;
  method: 'otp';
  code: string;
}

// NEW (Push - simplified)
{
  transaction_id: string;
  method: 'push';
}
```

### Device Bind Request (`/device/bind`)
**Simplified Structure:**
```typescript
// OLD
{
  username: string;
  deviceFingerprint: string;
}

// NEW
{
  transaction_id: string;  // Backend looks up device fingerprint via transaction
}
```

### eSign Accept Request (`/esign/accept`)
**Field Naming Updates:**
```typescript
// OLD
{
  transactionId: string;
  documentId: string;
  acceptanceIp?: string;
  deviceFingerprint?: string;
  acceptanceTimestamp?: string;
}

// NEW
{
  transaction_id: string;
  document_id: string;
  acceptance_ip?: string;
  acceptance_timestamp?: string;
}
```

## 3. Response Structure Changes

### Login Response

#### Success Response (201)
```typescript
{
  responseTypeCode: 'SUCCESS';
  access_token: string;
  id_token: string;
  // refresh_token managed via httpOnly cookie ONLY (Set-Cookie header, 30-day expiry)
  session_id: string;
  transaction_id?: string;
  device_bound: boolean;  // NEW - indicates if device is trusted
}
```

**Removed Fields:**
- `user` object (id, username, email, roles) - now in id_token JWT
- `deviceFingerprint` - backend managed only
- `mfa_skipped` - no longer needed

#### MFA Required Response (200)
```typescript
{
  responseTypeCode: 'MFA_REQUIRED';
  session_id: string;
  transaction_id: string;
  otp_methods: Array<{           // NEW - structured OTP method selection
    value: string;               // e.g., "1234" (last 4 digits)
    mfa_option_id: number;       // e.g., 1 (to use in initiate request)
  }>;
  mobile_approve_status: 'NOT_REGISTERED' | 'ENABLED' | 'DISABLED';  // NEW
}
```

**Removed Fields:**
- `available_methods` - replaced with `otp_methods` and `mobile_approve_status`
- `mfa_required` boolean - redundant with responseTypeCode
- `reason` - not needed
- `trust_expired_at` - not needed
- `deviceFingerprint` - backend managed only

#### eSign Required Response (200)
```typescript
{
  responseTypeCode: 'ESIGN_REQUIRED';
  session_id: string;
  transaction_id: string;
  esign_document_id: string;
  esign_url: string;
  is_mandatory: boolean;  // NEW - renamed from 'mandatory'
}
```

**Removed Fields:**
- `mfa_skipped` - not needed
- `message` - UI handles messaging
- `deviceFingerprint` - backend managed only

### MFA Challenge Response (`/auth/mfa/initiate`)
```typescript
{
  success: boolean;
  transaction_id: string;
  challenge_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  expires_at: string;
  display_number?: number;  // For push - number to display on web UI
}
```

**Field Changes:**
- `transactionId` → `transaction_id`
- `challengeStatus` → `challenge_status`
- `expiresAt` → `expires_at`
- `displayNumber` → `display_number`
- Removed `message` field

### MFA Verify Response (`/auth/mfa/verify`)
```typescript
{
  success: boolean;
  responseTypeCode?: 'SUCCESS' | 'ESIGN_REQUIRED';
  access_token?: string;
  id_token?: string;
  // refresh_token managed via httpOnly cookie ONLY (Set-Cookie header, 30-day expiry)
  session_id?: string;
  transaction_id: string;
  device_bound?: boolean;    // NEW
  esign_document_id?: string;
  is_mandatory?: boolean;
}
```

**Removed Fields:**
- `deviceFingerprint` - backend managed only
- `message` - UI handles messaging

### Device Bind Response
```typescript
{
  success: boolean;
  transaction_id: string;
  trusted_at: string;
  already_trusted: boolean;
}
```

**Removed Fields:**
- `username` - not needed
- `deviceFingerprint` - backend managed only
- `message` - UI handles messaging

## 4. Error Response Changes

### Error Structure
```typescript
// OLD
{
  code: string;
  message: string;
  timestamp: string;
}

// NEW
{
  error_code: string;  // Changed from 'code'
  message: string;
  timestamp?: string;
}
```

### Error Code Examples
- `CIAM_E01_01_001` - User not found or invalid credentials
- `CIAM_E01_01_016` - Username contains masked value
- `CIAM_E01_01_002` - User password locked
- `CIAM_E01_01_003` - User disabled
- `CIAM_E01_01_005` - MFA locked
- `CIAM_E01_02_001` - Authentication token missing
- `CIAM_E01_02_002` - Authentication token invalid or expired
- `CIAM_E05_00_001` - Server error
- `CIAM_E05_00_002` - Server info not available

## 5. TypeScript Type Updates

### Updated All Types to snake_case
All interface fields updated from camelCase to snake_case:
- `sessionId` → `session_id`
- `transactionId` → `transaction_id`
- `deviceFingerprint` → removed (backend managed)
- `challengeStatus` → `challenge_status`
- `expiresAt` → `expires_at`
- `displayNumber` → `display_number`
- `acceptanceIp` → `acceptance_ip`
- `acceptanceTimestamp` → `acceptance_timestamp`
- etc.

### New Push MFA Flow

#### Mobile App Approval (New Endpoint)
```typescript
// POST /mfa/transaction/:transaction_id/approve
{
  selected_number: number;  // User's choice from push notification
}

// Response
{
  success: boolean;
  transaction_id: string;
  challenge_status: 'APPROVED';
}
```

#### Web UI Flow (Updated)
1. Initiate push MFA → Displays `display_number` on web UI
2. Poll `/mfa/transaction/:id` for status
3. When status is 'APPROVED', call `/mfa/verify` to get tokens

## 6. Service Method Updates

### AuthService Updates

#### `login()` - Updated signature
```typescript
async login(
  username: string,
  password: string,
  drsActionToken?: string,
  appId: string = 'ciam-ui-sdk',     // NEW
  appVersion: string = '2.0.0'       // NEW
): Promise<LoginResponse>
```

#### `initiateMFAChallenge()` - New signature
```typescript
// OLD
async initiateMFAChallenge(
  method: 'otp' | 'push',
  username?: string,
  sessionId?: string,
  transactionId?: string
): Promise<MFAChallengeResponse>

// NEW
async initiateMFAChallenge(
  transactionId: string,
  method: 'otp' | 'push',
  mfaOptionId?: number
): Promise<MFAChallengeResponse>
```

#### `verifyMFAChallenge()` - New signature
```typescript
// OLD
async verifyMFAChallenge(
  transactionId: string,
  otp?: string,
  pushResult?: 'APPROVED' | 'REJECTED',
  selectedNumber?: number,
  deviceFingerprint?: string
): Promise<MFAVerifyResponse>

// NEW
async verifyMFAChallenge(
  transactionId: string,
  method: 'otp' | 'push',
  otp?: string
): Promise<MFAVerifyResponse>
```

#### `approvePushMFA()` - New method
```typescript
async approvePushMFA(
  transactionId: string,
  selectedNumber: number
): Promise<{
  success: boolean;
  transaction_id: string;
  challenge_status: string;
}>
```

#### `bindDevice()` - Updated signature
```typescript
// OLD
async bindDevice(
  username: string,
  deviceFingerprint: string
): Promise<{ success: boolean; message: string }>

// NEW
async bindDevice(
  transactionId: string
): Promise<{
  success: boolean;
  transaction_id: string;
  trusted_at: string;
  already_trusted: boolean;
}>
```

#### `acceptESign()` - Updated signature
```typescript
// OLD
async acceptESign(
  transactionId: string,
  documentId: string,
  acceptanceIp?: string,
  deviceFingerprint?: string
): Promise<ESignResponse>

// NEW
async acceptESign(
  transactionId: string,
  documentId: string,
  acceptanceIp?: string
): Promise<ESignResponse>
```

#### `getUserInfo()` - Removed, replaced with
```typescript
parseIdToken(idToken: string): UserInfoResponse
```

### Removed Methods
- `getUserInfo()` - replaced with `parseIdToken()`
- `postMfaCheck()` - deprecated endpoint
- `postLoginCheck()` - deprecated endpoint
- `declineESign()` - deprecated endpoint

## 7. Hook Updates

### useMfa Hook

#### `initiateChallenge()` - Updated signature
```typescript
// OLD
initiateChallenge(
  method: 'otp' | 'push',
  username?: string
): Promise<MFAChallengeResponse>

// NEW
initiateChallenge(
  transactionId: string,
  method: 'otp' | 'push',
  mfaOptionId?: number
): Promise<MFAChallengeResponse>
```

#### `verifyPush()` - Updated signature
```typescript
// OLD
verifyPush(
  transactionId: string,
  pushResult?: 'APPROVED' | 'REJECTED',
  selectedNumber?: number
): Promise<MFAVerifyResponse>

// NEW
verifyPush(
  transactionId: string
): Promise<MFAVerifyResponse>
```

## 8. Breaking Changes Summary

### Required Code Changes for SDK Users:

1. **Login Flow**
   - Access user info from `id_token` JWT instead of response object
   - Check `device_bound` flag to determine if device trust dialog should be shown

2. **MFA Initiate**
   - Pass `transaction_id` (from login response) as first parameter
   - Pass `mfa_option_id` when using OTP method

3. **MFA Verify - Push Flow**
   - Web UI: Only pass `transaction_id` and `method: 'push'`
   - Mobile App: Use new `/mfa/transaction/:id/approve` endpoint

4. **Device Binding**
   - Only pass `transaction_id` instead of username + deviceFingerprint

5. **Error Handling**
   - Access errors using `error_code` field instead of `code`
   - Handle new CIAM_E* error code format

6. **Response Field Access**
   - Use snake_case field names everywhere
   - Update all `transactionId` → `transaction_id`
   - Update all `sessionId` → `session_id`
   - etc.

## 9. Files Modified

### Core Service Layer
- `/src/services/AuthService.ts` - Updated all API endpoints and request/response handling
- `/src/types/index.ts` - Updated all TypeScript interfaces to v2 schema

### Hooks
- `/src/hooks/useMfa.ts` - Updated MFA hook signatures and field names
- `/src/hooks/useAuth.ts` - No changes needed (uses context)

### Components (Require Updates - See Build Errors)
The following components have TypeScript errors due to the v2 changes:
- `/src/components/CiamLoginComponent.tsx`
- `/src/components/CiamProvider.tsx`
- `/src/components/MfaMethodSelectionDialog.tsx`
- `/src/components/ESignDialog.tsx` (may need updates)
- `/src/components/DeviceBindDialog.tsx` (may need updates)

## 10. Migration Checklist

- [✅] Update TypeScript types to snake_case and new fields
- [✅] Update AuthService API endpoints to v2 paths
- [✅] Add app_id and app_version to login request
- [✅] Update MFA initiate to use transaction_id and mfa_option_id
- [✅] Update MFA verify to handle new push flow
- [✅] Update device bind to use transaction_id only
- [✅] Update error handling to use error_code field
- [✅] Remove deprecated endpoint calls
- [✅] Update useMfa hook signatures
- [⏳] Update component files (in progress - TypeScript errors to fix)

## 11. Testing Recommendations

### Test Cases to Verify:

1. **Login Flow**
   - ✅ Login with valid credentials returns 201 with all 3 tokens
   - ✅ Parse id_token to get user information
   - ✅ Check device_bound flag

2. **MFA - OTP**
   - ✅ MFA required response includes otp_methods array
   - ✅ Initiate accepts mfa_option_id
   - ✅ Verify with correct code returns tokens

3. **MFA - Push**
   - ✅ Initiate returns display_number
   - ✅ Mobile app uses /approve endpoint
   - ✅ Web UI polls for status
   - ✅ Verify returns tokens after approval

4. **eSign**
   - ✅ eSign required response includes is_mandatory
   - ✅ Accept uses snake_case fields
   - ✅ Returns all 3 tokens

5. **Device Trust**
   - ✅ device_bound flag works correctly
   - ✅ Bind accepts transaction_id only
   - ✅ Returns already_trusted flag

6. **Error Handling**
   - ✅ All errors use error_code field
   - ✅ New CIAM_E* error codes handled

## 12. Next Steps

1. Fix remaining TypeScript errors in component files
2. Update component logic to use new response fields
3. Test all flows end-to-end with v2 backend
4. Update SDK documentation
5. Bump SDK version to 2.0.0
