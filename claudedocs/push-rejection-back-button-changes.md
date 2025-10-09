# Push Rejection UX Improvements - Back Button Implementation

**Date**: October 9, 2025
**Component**: MfaMethodSelectionDialog.tsx

## Overview
Improved the user experience when push notifications are rejected by replacing confusing retry buttons with a single "Back" button that gives users manual control during the error display period.

## Problem Statement
When a push notification is rejected:
- "Try Push Again" and "Use SMS Instead" buttons were shown
- These buttons don't make sense because the backend has already invalidated the MFA session
- Users couldn't manually override the 2-second auto-close timer
- User wanted ability to return to MFA selection (not just login) during the error display

## Solution Implemented

### 1. Added Timeout Tracking (Line 73)
```typescript
const autoCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
```
**Purpose**: Track the 2-second auto-close timer so it can be cancelled when user clicks Back

### 2. Updated Polling Error Handler (Lines 218-225)
```typescript
if (error.code === 'PUSH_REJECTED') {
  setPushStatus('rejected');
  // Store timeout ID so user can cancel it by clicking Back button
  autoCloseTimeoutRef.current = setTimeout(() => {
    console.log('🔴 Push rejected - auto-closing after 2 seconds');
    onCancel();
  }, 2000);
}
```
**Changes**: Store setTimeout return value in ref for later cancellation

### 3. Replaced Retry Buttons with Back Button (Lines 668-690)
**Before** (Lines 666-723):
- Alert with two action buttons:
  - "Try Push Again" (reinitiates push flow - won't work, session invalidated)
  - "Use SMS Instead" (switches to SMS - won't work, session invalidated)

**After**:
```typescript
{pushStatus === 'rejected' && (
  <Alert severity="error" sx={{ mb: 2 }}>
    Push notification was rejected. You selected an incorrect number on your mobile device.
    <Box sx={{ mt: 2 }}>
      <Button
        size="small"
        variant="outlined"
        onClick={() => {
          console.log('🔙 User clicked Back - cancelling auto-close and returning to MFA selection');
          // Cancel the auto-close timeout
          if (autoCloseTimeoutRef.current) {
            clearTimeout(autoCloseTimeoutRef.current);
            autoCloseTimeoutRef.current = null;
          }
          // Immediately close dialog - backend will invalidate transaction when user creates new one
          handleCancel();
        }}
      >
        Back
      </Button>
    </Box>
  </Alert>
)}
```

**Changes**:
- Removed "Try Push Again" button
- Removed "Use SMS Instead" button
- Added single "Back" button that:
  - Cancels the 2-second auto-close timer
  - Immediately calls handleCancel() to close dialog
  - Returns user to MFA selection (where they can retry if desired)

### 4. Added Cleanup on Unmount (Lines 253-257)
```typescript
if (autoCloseTimeoutRef.current) {
  console.log('🧹 Cleaning up auto-close timeout');
  clearTimeout(autoCloseTimeoutRef.current);
  autoCloseTimeoutRef.current = null;
}
```
**Purpose**: Prevent memory leaks by cleaning up timeout when component unmounts

## User Experience Flow

### Scenario 1: Push Rejected - User Waits (Auto-close)
1. User selects incorrect number on mobile device
2. Backend detects rejection and returns PUSH_REJECTED error
3. Frontend displays error alert: "Push notification was rejected..."
4. "Back" button is shown
5. **After 2 seconds**: Dialog auto-closes and returns to login
6. User can start login process again

### Scenario 2: Push Rejected - User Clicks Back (Manual control)
1. User selects incorrect number on mobile device
2. Backend detects rejection and returns PUSH_REJECTED error
3. Frontend displays error alert: "Push notification was rejected..."
4. "Back" button is shown
5. **User clicks "Back" immediately** (no need to wait 2 seconds)
6. Auto-close timer is cancelled
7. Dialog closes immediately and returns to login
8. User can start login process again

## Backend Transaction Handling
- Backend automatically invalidates `transaction_id` when new transaction is created for same `context_id`
- Frontend doesn't need to explicitly invalidate the rejected transaction
- When user returns to login and selects MFA method again, backend creates new transaction and invalidates the old one

## Benefits

1. **Clearer UX**: Removed confusing retry buttons that wouldn't work
2. **User Control**: Users can manually override auto-close by clicking Back
3. **Consistent Pattern**: Follows same pattern as OTP invalid code handling
4. **Backend Integration**: Properly leverages backend's automatic transaction invalidation
5. **Clean State Management**: Proper cleanup prevents memory leaks

## Testing Verification
- ✅ TypeScript compilation passes (no type errors)
- ✅ Clean implementation with proper cleanup
- ✅ Consistent with existing error handling patterns

## Files Modified
- `ciam-ui/src/components/MfaMethodSelectionDialog.tsx`
  - Added: autoCloseTimeoutRef (line 73)
  - Modified: Polling error handler (lines 218-225)
  - Modified: Push rejection alert (lines 668-690)
  - Modified: Cleanup function (lines 253-257)

## Related Documentation
- See `mfa-pending-response-changes.md` for POST-based polling architecture
- See `invalid-otp-mfa-delete-changes.md` for similar OTP error handling pattern
