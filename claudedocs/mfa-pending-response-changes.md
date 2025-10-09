# MFA Polling Architecture Changes - POST-based with MFA_PENDING Response

## Overview
This document summarizes the changes made to implement POST-based polling for push MFA using a clean `MFA_PENDING` response pattern instead of using HTTP 400 errors for the "pending" state.

## Design Decision
The key design insight was that "pending" is a **valid state**, not an error. Using `200 OK` with `response_type_code` pattern maintains consistency with the rest of the v3 API (e.g., `MFA_REQUIRED`, `ESIGN_REQUIRED`) and follows proper HTTP semantics:
- **200 OK**: Valid states (SUCCESS, MFA_PENDING, ESIGN_REQUIRED, DEVICE_BIND_REQUIRED)
- **201 Created**: MFA verification successful (tokens created)
- **400 Bad Request**: Actual client errors (invalid OTP, missing fields)
- **410 Gone**: Transaction expired or rejected

## Changes Summary

### 1. OpenAPI v3 Specification
**File**: `ciam-backend/changes/10072025/001/openapi_v3.yaml`

#### Added: MFAPendingResponse Schema
```yaml
MFAPendingResponse:
  type: object
  required:
    - response_type_code
    - transaction_id
    - context_id
  properties:
    response_type_code:
      type: string
      enum: [MFA_PENDING]
    transaction_id:
      type: string
    context_id:
      type: string
    message:
      type: string
      example: "Awaiting mobile device approval"
    expires_at:
      type: string
      format: date-time
    retry_after:
      type: integer
      example: 1000
```

#### Updated: POST `/mfa/transaction/{transaction_id}` Responses
```yaml
responses:
  '200':
    description: Transaction state check - pending approval or next step required
    content:
      application/json:
        schema:
          oneOf:
            - $ref: '#/components/schemas/MFAPendingResponse'
            - $ref: '#/components/schemas/ESignRequiredResponse'
            - $ref: '#/components/schemas/DeviceBindRequiredResponse'
  '201':
    description: MFA verification successful
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/MFAVerifySuccessResponse'
  '410':
    description: Transaction expired or rejected by user
```

#### Removed: MFATransactionStatusResponse Schema
- Deleted entire schema (33 lines)
- Removed unused GET endpoint pattern

### 2. Backend Type Definitions
**File**: `ciam-backend/src/types/index.ts`

#### Added
```typescript
export interface MFAPendingResponse {
  response_type_code: 'MFA_PENDING';
  transaction_id: string;
  context_id: string;
  message?: string;
  expires_at?: string;
  retry_after?: number;
}

export type MFAVerifyResponse =
  | MFAVerifySuccessResponse
  | MFAPendingResponse
  | ESignRequiredResponse
  | DeviceBindRequiredResponse;
```

#### Removed
```typescript
// Removed entire MFATransactionStatusResponse interface
```

### 3. Backend Controller Changes
**File**: `ciam-backend/src/controllers/mfaController.ts`

#### Modified: verifyPushChallenge Function
Now returns `200 + MFA_PENDING` when transaction is still pending:

```typescript
// V3: Check transaction status - return MFA_PENDING for polling
if (transaction.status === 'PENDING') {
  const response: MFAPendingResponse = {
    response_type_code: 'MFA_PENDING',
    transaction_id: transaction_id,
    context_id: context_id,
    message: 'Awaiting mobile device approval',
    expires_at: transaction.expiresAt.toISOString(),
    retry_after: 1000
  };

  logAuthEvent('mfa_pending', transaction.userId, {
    transactionId: transaction_id,
    method: 'push',
    ip: req.ip
  });

  res.status(200).json(response);
  return;
}
```

#### Removed: getTransactionStatus Function
- Completely removed function (29 lines)
- No longer needed - polling uses POST endpoint directly

### 4. Backend Routes
**File**: `ciam-backend/src/index-simple.ts`
- Removed: `app.get('/mfa/transaction/:transactionId', ...)`
- Updated endpoint listing to remove GET status endpoint

**File**: `ciam-backend/src/index.ts`
- Removed: `getTransactionStatus` from mfaController imports

### 5. Frontend Type Definitions
**File**: `ciam-ui/src/types/index.ts`

#### Updated: MFAVerifyResponse
```typescript
export interface MFAVerifyResponse {
  response_type_code: 'SUCCESS' | 'MFA_PENDING' | 'ESIGN_REQUIRED' | 'DEVICE_BIND_REQUIRED';
  // ... other fields
  message?: string;
  expires_at?: string;
  retry_after?: number;
}
```

#### Updated: UseMfaReturn Interface
```typescript
export interface UseMfaReturn {
  // ...
  pollPushStatus: (contextId: string, transactionId: string) => Promise<MFAVerifyResponse>;
  // Removed: checkStatus
}
```

#### Removed
- Entire `MFATransactionStatusResponse` interface

### 6. Frontend Service Layer
**File**: `ciam-ui/src/services/AuthService.ts`

#### Removed
```typescript
// Removed entire method:
async getMFATransactionStatus(transactionId: string): Promise<MFATransactionStatusResponse> {
  return this.apiCall<MFATransactionStatusResponse>(`/mfa/transaction/${encodeURIComponent(transactionId)}`);
}
```

### 7. Frontend React Hook
**File**: `ciam-ui/src/hooks/useMfa.ts`

#### Added: pollPushStatus Function
```typescript
const pollPushStatus = useCallback(async (
  contextId: string,
  transactionId: string
): Promise<MFAVerifyResponse> => {
  try {
    // Use verifyPushChallenge for polling - returns MFA_PENDING if still pending
    const response = await authService.verifyPushChallenge(contextId, transactionId);

    // Update transaction status based on response
    if (response.response_type_code === 'MFA_PENDING') {
      setState(prev => ({
        ...prev,
        transaction: prev.transaction ? {
          ...prev.transaction,
          status: 'PENDING',
        } : null,
      }));
    } else if (response.response_type_code === 'SUCCESS') {
      setState(prev => ({
        ...prev,
        transaction: prev.transaction ? {
          ...prev.transaction,
          status: 'APPROVED',
        } : null,
      }));
    }

    return response;
  } catch (error) {
    const apiError = error as ApiError;
    setState(prev => ({
      ...prev,
      error: apiError.message || 'Failed to check push status',
    }));
    throw error;
  }
}, [authService]);
```

#### Removed
- `checkStatus` function completely removed

### 8. Frontend Components

#### File: `ciam-ui/src/components/MfaMethodSelectionDialog.tsx`

**Updated Props**:
```typescript
export interface MfaMethodSelectionProps {
  // ...
  onPollPushStatus?: (contextId: string, transactionId: string) => Promise<any>;
  mfaContextId?: string;
  // Removed: onCheckStatus
}
```

**Updated startPolling Function**:
```typescript
const startPolling = useCallback(async (transactionId: string) => {
  if (!onPollPushStatus || !mfaContextId || !onPushVerify) {
    console.log('❌ Missing polling callbacks or context');
    return;
  }

  // ... polling setup ...

  intervalRef.current = setInterval(async () => {
    try {
      const response = await onPollPushStatus(mfaContextId, transactionId);

      // Handle different response types
      if (response.response_type_code === 'SUCCESS') {
        // Stop polling, call success handler
        clearInterval(intervalRef.current);
        await onPushVerify('APPROVED');
      } else if (response.response_type_code === 'MFA_PENDING') {
        // Continue polling, update timer
        // Update expires_at based timer
      } else if (response.response_type_code === 'ESIGN_REQUIRED') {
        // Handle eSign flow
      } else if (response.response_type_code === 'DEVICE_BIND_REQUIRED') {
        // Handle device binding flow
      }
    } catch (error: any) {
      // Handle 410 Gone for expired/rejected transactions
      if (error.code === 410 || error.message?.includes('expired')) {
        // Stop polling, show expiration UI
      }
    }
  }, 1000);
}, [onPollPushStatus, mfaContextId, onPushVerify, onMfaSuccess]);
```

#### File: `ciam-ui/src/components/CiamLoginComponent.tsx`

**Updated Hook Usage**:
```typescript
const { transaction, initiateChallenge, verifyOtp, verifyPush, cancelTransaction, pollPushStatus } = useMfa();
```

**Updated Dialog Props**:
```typescript
<MfaMethodSelectionDialog
  // ...
  onPollPushStatus={pollPushStatus}
  mfaContextId={mfaContextId}
  // Removed: onCheckStatus
/>
```

## API Flow Comparison

### Old Flow (with errors)
```
Client → POST /mfa/transaction/{id}
       ← 400 CIAM_E01_01_018 "Not yet approved"  // ❌ Misuse of error codes
Client → POST /mfa/transaction/{id} (poll again)
       ← 400 CIAM_E01_01_018 "Not yet approved"
Client → POST /mfa/transaction/{id}
       ← 201 SUCCESS with tokens
```

### New Flow (clean state machine)
```
Client → POST /mfa/transaction/{id}
       ← 200 MFA_PENDING                        // ✅ Valid pending state
Client → POST /mfa/transaction/{id} (poll again)
       ← 200 MFA_PENDING
Client → POST /mfa/transaction/{id}
       ← 201 SUCCESS with tokens                 // ✅ Creation successful
```

## Benefits

1. **Semantic Correctness**: HTTP status codes used properly (200 for states, not errors)
2. **API Consistency**: Follows same pattern as `MFA_REQUIRED`, `ESIGN_REQUIRED`
3. **Better DX**: Client code uses response type checking vs error parsing
4. **Self-Documenting**: API behavior is clear from response types
5. **Type Safety**: TypeScript discriminated unions work cleanly
6. **Extensibility**: Easy to add new response types in the future

## Testing Verification

- ✅ TypeScript compilation passes (frontend: ciam-ui)
- ✅ Backend running successfully on port 8080
- ✅ No breaking changes to existing OTP (SMS/Voice) flows
- ✅ Clean removal of unused GET endpoint and schemas
- ✅ All imports and exports updated correctly

## Migration Notes

### For API Consumers
- **Change**: POST `/mfa/transaction/{transaction_id}` now returns 200 + MFA_PENDING instead of 400
- **Action**: Update client code to check `response_type_code === 'MFA_PENDING'` instead of catching 400 errors
- **Removed**: GET `/mfa/transaction/{transaction_id}` endpoint - use POST for both verification and polling

### For Mobile Devices (Push Approval)
- **No changes** to POST `/mfa/transaction/{transaction_id}/approve` endpoint
- Mobile approval flow remains unchanged

## Files Modified

### Backend
1. `ciam-backend/changes/10072025/001/openapi_v3.yaml`
2. `ciam-backend/src/types/index.ts`
3. `ciam-backend/src/controllers/mfaController.ts`
4. `ciam-backend/src/index-simple.ts`
5. `ciam-backend/src/index.ts`

### Frontend
1. `ciam-ui/src/types/index.ts`
2. `ciam-ui/src/services/AuthService.ts`
3. `ciam-ui/src/hooks/useMfa.ts`
4. `ciam-ui/src/components/MfaMethodSelectionDialog.tsx`
5. `ciam-ui/src/components/CiamLoginComponent.tsx`

## Date
October 9, 2025
