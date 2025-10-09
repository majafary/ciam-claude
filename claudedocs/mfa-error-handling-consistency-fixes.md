# MFA Error Handling Consistency Fixes

**Date**: October 9, 2025
**Component**: MfaMethodSelectionDialog.tsx

## Overview
Fixed inconsistencies in error handling between invalid OTP and push rejection scenarios to provide consistent UX with manual control during error display periods.

## Problem Statement

### Invalid OTP Issues
- ✅ Parent component has 2-second auto-redirect
- ❌ Timer bar keeps running (should stop)
- ❌ No Back button (should have one for manual control)

### Push Rejection Issues
- ✅ Timer stops correctly
- ✅ Back button exists
- ❌ NO auto-redirect after 2 seconds (timeout was being cleared)

## Root Cause Analysis

### Invalid OTP
The parent component (CiamLoginComponent.tsx) catches `INVALID_MFA_CODE` errors and sets a 2-second timeout to clear MFA state. However, the dialog component:
1. Doesn't stop the timer countdown
2. Doesn't show a Back button for user control

### Push Rejection
The auto-close timeout was set correctly (lines 225-228), but the cleanup effect was clearing it immediately:
- When `setPushStatus('rejected')` was called, it changed the `pushStatus` state
- This triggered the polling effect to re-run because `pushStatus` was in its dependencies
- The effect's cleanup function ran FIRST, clearing the `autoCloseTimeoutRef` we just set
- Result: timeout never fired, no auto-redirect

## Solution Implemented

### 1. Added OTP Failed State Flag (Line 70)
```typescript
const [otpFailedAndWaitingForRedirect, setOtpFailedAndWaitingForRedirect] = useState(false);
```
**Purpose**: Track when OTP has failed and parent's 2-second timeout is active

### 2. Updated OTP Timer Effect (Lines 85-93)
```typescript
useEffect(() => {
  // Stop timer if OTP failed and waiting for redirect, or if expired
  if ((transaction?.method === 'sms' || transaction?.method === 'voice') &&
      timeLeft > 0 && !isExpired && !otpFailedAndWaitingForRedirect) {
    const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    return () => clearTimeout(timer);
  } else if (timeLeft === 0 && !isExpired && !otpFailedAndWaitingForRedirect) {
    setIsExpired(true);
  }
}, [timeLeft, transaction, isExpired, otpFailedAndWaitingForRedirect]);
```
**Changes**: Timer stops when `otpFailedAndWaitingForRedirect` is true

### 3. Updated handleOtpVerify Function (Lines 309-330)
```typescript
const handleOtpVerify = async () => {
  if (!otp || otp.length !== 4 || verifying || !onOtpVerify) return;

  try {
    setVerifying(true);
    setOtpError(null);
    setOtpFailedAndWaitingForRedirect(false);
    await onOtpVerify(otp);
  } catch (error: any) {
    setOtpError(error.message || 'Invalid verification code. Please try again.');
    setOtp('');

    // If this is an invalid OTP error, stop timer and show Back button
    if (error.code === 'INVALID_MFA_CODE') {
      setOtpFailedAndWaitingForRedirect(true);
    }
  } finally {
    setVerifying(false);
  }
};
```
**Changes**: Set flag when `INVALID_MFA_CODE` error occurs

### 4. Hide Timer When OTP Fails (Lines 494-506)
```typescript
{/* Timer - hide when OTP failed and waiting for redirect */}
{!otpFailedAndWaitingForRedirect && (
  <Box sx={{ mb: 2 }}>
    <Typography variant="body2" color="textSecondary" gutterBottom>
      Time remaining: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
    </Typography>
    <LinearProgress
      variant="determinate"
      value={((10 - timeLeft) / 10) * 100}
      sx={{ height: 6, borderRadius: 3 }}
    />
  </Box>
)}
```
**Changes**: Timer is completely hidden when `otpFailedAndWaitingForRedirect` is true, matching push rejection behavior

### 5. Added Back Button to OTP Error Alert (Lines 508-527)
```typescript
{(otpError || error) && !isExpired && (
  <Alert severity="error" sx={{ mb: 2 }}>
    {otpError || error}
    {otpFailedAndWaitingForRedirect && (
      <Box sx={{ mt: 2 }}>
        <Button
          size="small"
          variant="outlined"
          onClick={() => {
            console.log('🔙 User clicked Back from invalid OTP - returning to login');
            handleCancel();
          }}
        >
          Back
        </Button>
      </Box>
    )}
  </Alert>
)}
```
**Changes**: Show Back button when `otpFailedAndWaitingForRedirect` is true

### 6. Reset Flag on Transaction Change (Line 107)
```typescript
setOtpFailedAndWaitingForRedirect(false);
```
**Purpose**: Clean state when new transaction starts

### 7. Fixed Push Rejection Auto-Redirect (Lines 259-268)
**Before** (Bug):
```typescript
// Single effect with autoCloseTimeoutRef cleanup
useEffect(() => {
  // ... polling logic ...
  return () => {
    // ... interval cleanup ...
    if (autoCloseTimeoutRef.current) {
      clearTimeout(autoCloseTimeoutRef.current); // ❌ Clears on every re-render!
    }
  };
}, [isPushWaiting, transaction, pushStatus, isExpired]); // pushStatus change triggers cleanup
```

**After** (Fixed):
```typescript
// Separate polling effect
useEffect(() => {
  // ... polling logic ...
  return () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };
}, [isPushWaiting, transaction, pushStatus, isExpired, startPolling]);

// Separate cleanup effect for auto-close timeout - only on unmount
useEffect(() => {
  return () => {
    if (autoCloseTimeoutRef.current) {
      console.log('🧹 Cleaning up auto-close timeout on unmount');
      clearTimeout(autoCloseTimeoutRef.current);
      autoCloseTimeoutRef.current = null;
    }
  };
}, []); // Empty deps = only runs on mount/unmount
```

**Fix**: Moved auto-close timeout cleanup to separate effect with empty dependencies, so it only runs on unmount, not when `pushStatus` changes

## User Experience Flow

### Invalid OTP - Consistent with Push Rejection
1. User enters invalid OTP code
2. Backend returns `INVALID_MFA_CODE` error
3. **Timer is hidden** (removed from display)
4. Error alert displays with **Back button**
5. User can either:
   - **Wait 2 seconds**: Auto-redirect to login (parent timeout)
   - **Click Back**: Immediately return to login

### Push Rejection - Fixed Auto-Redirect
1. User selects incorrect number on mobile device
2. Backend detects rejection and returns `PUSH_REJECTED` error
3. **Timer is hidden** (removed from display)
4. Error alert displays with **Back button** (already working)
5. **Auto-redirect now works!** User can either:
   - **Wait 2 seconds**: Auto-redirect to login (dialog timeout)
   - **Click Back**: Cancel timeout and immediately return to login

## Benefits

1. **Consistent UX**: Both invalid OTP and push rejection now have identical behavior
2. **Timer Hidden**: Timer is completely removed from display when error occurs (cleaner UI)
3. **User Control**: Back button gives manual override of auto-redirect
4. **Auto-Redirect Works**: Fixed bug where push rejection timeout was being cleared
5. **Clean Code**: Separated concerns - polling cleanup vs timeout cleanup

## Technical Details

### Bug Fix Explanation
The push rejection bug was caused by React's useEffect cleanup timing:

1. **Initial state**: `pushStatus = null`, timeout not set
2. **Error occurs**: Call `setPushStatus('rejected')` → state changes to `'rejected'`
3. **Also in same error handler**: Set `autoCloseTimeoutRef.current = setTimeout(..., 2000)`
4. **React re-renders**: Because `pushStatus` changed
5. **Effect cleanup runs**: Because `pushStatus` dependency changed
6. **Cleanup clears timeout**: `clearTimeout(autoCloseTimeoutRef.current)` → **Timeout never fires!**

**Solution**: Move timeout cleanup to separate effect with empty dependencies (`[]`), so it only runs on unmount, not on state changes.

## Testing Verification
- ✅ TypeScript compilation passes (no type errors)
- ✅ Invalid OTP: Timer hidden, Back button shows, auto-redirect works
- ✅ Push rejection: Timer hidden, Back button shows, auto-redirect now works
- ✅ Completely consistent UX between both error scenarios

## Files Modified
- `ciam-ui/src/components/MfaMethodSelectionDialog.tsx`
  - Added: otpFailedAndWaitingForRedirect state (line 70)
  - Modified: Timer effect to stop on flag (lines 85-93)
  - Modified: Reset flag on transaction change (line 107)
  - Modified: handleOtpVerify to set flag (lines 309-330)
  - Modified: Hide OTP timer when error occurs (lines 494-506)
  - Modified: OTP error alert to show Back button (lines 508-527)
  - Fixed: Separated auto-close timeout cleanup effect (lines 259-268)

## Related Documentation
- See `push-rejection-back-button-changes.md` for initial Back button implementation
- See `mfa-pending-response-changes.md` for POST-based polling architecture
- See `invalid-otp-mfa-delete-changes.md` for parent component timeout logic
