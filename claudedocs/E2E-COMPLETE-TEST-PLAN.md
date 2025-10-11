# COMPLETE E2E Test Suite Implementation Plan

**Status**: Ready for full implementation
**Created**: 2025-10-10
**Purpose**: Complete working E2E regression test suite with correct UI selectors

---

## 🎯 CRITICAL SUCCESS CRITERIA

Before ANY migration work:
- ✅ **140 E2E tests** implemented and passing
- ✅ **All authentication flows** validated end-to-end
- ✅ **Baseline established** against current monolith (`index-simple.ts`)
- ✅ **Test report generated** with screenshots/videos
- ✅ **Zero breaking changes** - all tests must pass

---

## 📋 CORRECT UI SELECTORS (From Source Code Analysis)

### Storefront Navigation Component
- **Log In Button**: `Button` with text "Log In" (NOT "Sign In")
- **Authenticated User Button**: `Button` with `Avatar` and username text
- **User Menu**: Material-UI `Menu` with "My Account" and "Log Out" items
- **Logout Menu Item**: `MenuItem` with text "Log Out"

### Login Slide-Out (Drawer)
- **Component**: Material-UI `Drawer` (anchor="right")
- **Header**: Typography with text "Log In"
- **Close Button**: `IconButton` with `CloseIcon`
- **Username Field**: `TextField` with id `inline-username` and label "Username"
- **Password Field**: `TextField` with id `inline-password` and label "Password"
- **Submit Button**: `Button` with text "Log In" (aria-label="Log In")
- **Save Username Checkbox**: `Checkbox` with id `inline-rememberMeFlag`

### MFA Dialog (MfaMethodSelectionDialog)
- **Dialog**: Material-UI `Dialog` component
- **Method Selection**: Buttons/ToggleButtons for "Text Message (OTP)" and "Push Notification"
- **OTP Input**: TextField for 4-digit code
- **Verify Button**: Button with text containing "Verify"
- **Cancel Button**: Button with text containing "Cancel"

### eSign Dialog
- **Document Title**: "Terms of Service"
- **Accept Button**: Button with text "Accept"
- **Decline Button**: Button with text "Decline"

### Device Binding Dialog
- **Title**: "Trust This Device"
- **Checkbox**: For trusting device
- **Continue/Submit Button**: To proceed
- **Skip Button**: To skip device binding

---

## 🔧 UPDATED TEST HELPERS (Correct Selectors)

```typescript
// e2e-tests/helpers/auth-helpers.ts

import { Page, expect } from '@playwright/test';

export class AuthHelpers {
  constructor(private page: Page) {}

  /**
   * Open login slide-out by clicking "Log In" button in navigation
   */
  async openLoginSlideOut() {
    // Click the "Log In" button (when not authenticated)
    await this.page.getByRole('button', { name: 'Log In' }).click();

    // Wait for drawer to open (verify by checking for username field)
    await this.page.waitForSelector('input[id="inline-username"]', { state: 'visible', timeout: 5000 });
  }

  /**
   * Fill credentials in login form
   */
  async fillLoginCredentials(username: string, password: string) {
    await this.page.fill('input[id="inline-username"]', username);
    await this.page.fill('input[id="inline-password"]', password);
  }

  /**
   * Submit login form
   */
  async submitLoginForm() {
    await this.page.getByRole('button', { name: 'Log In' }).last().click(); // last() to get the submit button, not nav button
  }

  /**
   * Wait for successful authentication (drawer closes, user button appears)
   */
  async waitForAuthSuccess() {
    // Wait for drawer to close (username field disappears)
    await this.page.waitForSelector('input[id="inline-username"]', { state: 'hidden', timeout: 15000 });

    // Wait for authenticated user button to appear (has Avatar)
    await this.page.waitForSelector('button:has(> span[class*="MuiAvatar-root"])', { timeout: 5000 });
  }

  /**
   * Verify user is authenticated (user button visible with username)
   */
  async verifyStorefrontAuthenticated(displayName?: string) {
    if (displayName) {
      await expect(this.page.getByRole('button', { name: new RegExp(displayName, 'i') })).toBeVisible();
    } else {
      // Just verify user menu button exists
      await expect(this.page.locator('button:has(> span[class*="MuiAvatar-root"])')).toBeVisible();
    }
  }

  /**
   * Logout via user menu
   */
  async logout() {
    // Click user button to open menu
    await this.page.locator('button:has(> span[class*="MuiAvatar-root"])').click();

    // Click "Log Out" menu item
    await this.page.getByRole('menuitem', { name: 'Log Out' }).click();
  }

  /**
   * Wait for MFA method selection dialog
   */
  async waitForMfaMethodSelection() {
    await this.page.waitForSelector('text=Choose Verification Method', { timeout: 10000 });
  }

  /**
   * Select OTP (SMS) method
   */
  async selectOtpMethod() {
    await this.page.getByText(/text message.*otp/i).click();
    await this.page.getByRole('button', { name: /continue/i }).click();
  }

  /**
   * Enter OTP and verify
   */
  async enterOtpCode(code: string) {
    await this.page.waitForSelector('text=Enter Verification Code', { timeout: 10000 });

    // Find OTP input field (placeholder or label)
    const otpInput = this.page.locator('input[placeholder="1234"], input[type="text"]:near(:text("verification code"))').first();
    await otpInput.fill(code);

    await this.page.getByRole('button', { name: /verify/i }).click();
  }

  /**
   * Complete helper: Login with OTP
   */
  async loginWithOtp(username: string, password: string, otpCode: string = '1234') {
    await this.openLoginSlideOut();
    await this.fillLoginCredentials(username, password);
    await this.submitLoginForm();
    await this.waitForMfaMethodSelection();
    await this.selectOtpMethod();
    await this.enterOtpCode(otpCode);
    await this.waitForAuthSuccess();
  }

  /**
   * Verify error message displayed
   */
  async verifyErrorMessage(expectedError: string | RegExp) {
    // Material-UI Alert component
    await expect(this.page.locator('.MuiAlert-root:has-text("' + expectedError + '")')).toBeVisible({ timeout: 5000 });
  }
}
```

---

## 📝 COMPLETE TEST IMPLEMENTATION CHECKLIST

### Phase 1: Infrastructure (✅ DONE)
- [x] Playwright config
- [x] Test fixtures (test accounts)
- [x] Directory structure

### Phase 2: Fix Helpers with Correct Selectors (⏳ IN PROGRESS)
- [ ] Update `auth-helpers.ts` with correct Material-UI selectors
- [ ] Test each helper function individually
- [ ] Create `api-helpers.ts` for backend API assertions

### Phase 3: Basic Tests (Priority 1 - CRITICAL)
- [ ] **01-storefront-navigation.spec.ts** (5 tests)
  - Anonymous user can browse
  - Hero section visible
  - "Log In" button opens drawer
  - No protected content without auth
  - Build info displays

- [ ] **02-basic-login.spec.ts** (10 tests)
  - Trusted user instant login
  - Token validation (cookies)
  - device_bound flag verification
  - Invalid credentials error
  - Account locked error
  - MFA locked error
  - Missing credentials errors

### Phase 4: MFA Tests (Priority 1 - CRITICAL)
- [ ] **03-mfa-otp.spec.ts** (12 tests)
  - MFA_REQUIRED response
  - SMS method selection
  - OTP verification (valid/invalid)
  - OTP-only user (no push option)
  - Token issuance after OTP
  - Timeout scenarios

- [ ] **04-mfa-push.spec.ts** (15 tests)
  - Push method selection
  - Push approval (auto after 5s for mfauser)
  - Push rejection (pushfail user)
  - Push timeout (pushexpired user)
  - Push-only user verification
  - Polling mechanism validation

### Phase 5: eSign Tests (Priority 2 - HIGH)
- [ ] **05-esign-flows.spec.ts** (18 tests)
  - eSign after MFA
  - eSign with trusted device
  - eSign acceptance flow
  - eSign decline flow
  - Device binding after eSign
  - Compliance eSign scenarios

### Phase 6: Cross-App Integration (Priority 2 - HIGH)
- [ ] **06-cross-app-integration.spec.ts** (8 tests)
  - Storefront → Snapshot navigation
  - Session persistence across apps
  - Logout from snapshot → storefront session cleared
  - Multi-tab consistency

### Phase 7: Session & Device Management (Priority 3 - MEDIUM)
- [ ] **07-session-management.spec.ts** (10 tests)
  - Token refresh
  - Logout clears cookies
  - Session expiry
  - Device trust validation
  - Device trust expiry

### Phase 8: Error Scenarios (Priority 3 - MEDIUM)
- [ ] **08-error-scenarios.spec.ts** (20 tests)
  - All error codes (CIAM_E01_01_001, etc.)
  - Invalid transaction IDs
  - Missing parameters
  - Expired transactions

### Phase 9: Snapshot Application (Priority 4 - LOW)
- [ ] **09-snapshot-protected.spec.ts** (10 tests)
  - Auth redirect when not logged in
  - Snapshot page loads when authenticated
  - Account data displays
  - Navigation within snapshot

---

## 🚀 EXECUTION PLAN

### Step 1: Fix Auth Helpers (30 min)
```bash
# Update auth-helpers.ts with correct selectors
# Test individual helper functions
```

### Step 2: Implement Critical Tests First (2 hours)
```bash
# Implement tests in this order:
1. 01-storefront-navigation.spec.ts
2. 02-basic-login.spec.ts
3. 03-mfa-otp.spec.ts
4. 04-mfa-push.spec.ts

# Run after each file to ensure they pass
npx playwright test e2e-tests/tests/01-storefront-navigation.spec.ts
```

### Step 3: Implement Remaining Tests (2 hours)
```bash
5. 05-esign-flows.spec.ts
6. 06-cross-app-integration.spec.ts
7. 07-session-management.spec.ts
8. 08-error-scenarios.spec.ts
9. 09-snapshot-protected.spec.ts
```

### Step 4: Full Regression Run (30 min)
```bash
# Run complete suite
npx playwright test

# Generate HTML report
npx playwright show-report

# Take baseline screenshots
```

### Step 5: Baseline Documentation (30 min)
```bash
# Document all results
# Save screenshots/videos
# Create baseline comparison report
```

---

## 📊 SUCCESS METRICS

- **✅ 100% Test Pass Rate**: All 140 tests passing
- **✅ <5min Total Runtime**: Full suite completes in under 5 minutes
- **✅ Zero Flaky Tests**: All tests stable and reproducible
- **✅ Full Coverage**: Every user journey validated
- **✅ Baseline Documented**: Screenshots + videos + report saved

---

## ⚠️ MIGRATION APPROVAL GATES

**DO NOT PROCEED** with migration until:
1. ✅ All 140 tests implemented
2. ✅ All tests passing (100% pass rate)
3. ✅ Baseline report generated and reviewed
4. ✅ Test suite documented
5. ✅ Explicit user approval obtained

**ONLY AFTER** these gates are met can we safely migrate monolith → modular architecture.

---

## 🎯 NEXT IMMEDIATE ACTIONS

1. **Update auth-helpers.ts** with correct Material-UI selectors
2. **Create ONE working smoke test** to validate infrastructure
3. **Implement remaining 139 tests** in priority order
4. **Run full suite** and establish baseline
5. **Generate report** for user approval

**Estimated Completion Time**: 5-6 hours total work
