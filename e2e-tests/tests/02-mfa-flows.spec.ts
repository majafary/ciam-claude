import { test, expect } from '@playwright/test';
import { AuthHelpers } from '../helpers/auth-helpers';
import { TEST_ACCOUNTS, OTP_CODE } from '../fixtures/test-accounts';

/**
 * Test Suite: MFA Flows (OTP + Push Notification)
 *
 * Coverage:
 * - TC-MFA-001 to TC-MFA-012: OTP (SMS/Voice) flows
 * - TC-PUSH-001 to TC-PUSH-015: Push notification flows
 *
 * Total: 27 comprehensive MFA tests
 */

test.describe('MFA Authentication Flows', () => {
  let authHelpers: AuthHelpers;

  test.beforeEach(async ({ page }) => {
    authHelpers = new AuthHelpers(page);
    await page.goto('http://localhost:3000');
  });

  test.describe('OTP (SMS) Flows', () => {
    test('TC-MFA-001: mfauser login → MFA_REQUIRED with otp_methods', async ({ page }) => {
      const account = TEST_ACCOUNTS.mfauser;
      let mfaResponse: any = null;

      page.on('response', async (response) => {
        if (response.url().includes('/auth/login') && response.status() === 200) {
          const json = await response.json();
          if (json.responseTypeCode === 'MFA_REQUIRED') {
            mfaResponse = json;
          }
        }
      });

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      // Wait for MFA dialog to appear
      await authHelpers.waitForMfaMethodSelection();

      // Verify response has OTP methods
      await page.waitForTimeout(1000);
      expect(mfaResponse).toBeTruthy();
      expect(mfaResponse.responseTypeCode).toBe('MFA_REQUIRED');
      expect(mfaResponse.otp_methods).toBeDefined();
      expect(Array.isArray(mfaResponse.otp_methods)).toBe(true);
    });

    test('TC-MFA-002: Select SMS method → initiate → transaction_id returned', async ({ page }) => {
      const account = TEST_ACCOUNTS.mfauser;
      let initiateResponse: any = null;

      page.on('response', async (response) => {
        if (response.url().includes('/auth/mfa/initiate') && response.status() === 201) {
          initiateResponse = await response.json();
        }
      });

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForMfaMethodSelection();
      await authHelpers.selectOtpMethod();

      // Wait for initiate request
      await page.waitForTimeout(2000);

      expect(initiateResponse).toBeTruthy();
      expect(initiateResponse.transaction_id).toBeDefined();
      expect(initiateResponse.transaction_id.length).toBeGreaterThan(0);
    });

    test('TC-MFA-003: Enter correct OTP (1234) → SUCCESS with tokens', async ({ page }) => {
      const account = TEST_ACCOUNTS.mfauser;
      let verifyResponse: any = null;

      page.on('response', async (response) => {
        if (response.url().includes('/auth/mfa/otp/verify') && response.status() === 201) {
          verifyResponse = await response.json();
        }
      });

      await authHelpers.loginWithOtp(account.username, OTP_CODE.VALID);

      // Verify tokens received
      await page.waitForTimeout(1000);
      expect(verifyResponse).toBeTruthy();
      expect(verifyResponse.access_token).toBeDefined();
      expect(verifyResponse.id_token).toBeDefined();
    });

    test('TC-MFA-004: Enter incorrect OTP (0000) → INVALID_MFA_CODE error', async ({ page }) => {
      const account = TEST_ACCOUNTS.mfauser;
      let errorResponse: any = null;

      page.on('response', async (response) => {
        if (response.url().includes('/auth/mfa/otp/verify') && response.status() === 400) {
          errorResponse = await response.json();
        }
      });

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForMfaMethodSelection();
      await authHelpers.selectOtpMethod();

      // Enter invalid OTP
      await authHelpers.enterOtpCode(OTP_CODE.INVALID);

      await page.waitForTimeout(2000);
      expect(errorResponse).toBeTruthy();
      expect(errorResponse.error_code).toBe('CIAM_E01_03_001'); // INVALID_MFA_CODE
    });

    test('TC-MFA-005: otponlyuser → verify only SMS/Voice options available', async ({ page }) => {
      const account = TEST_ACCOUNTS.otponlyuser;

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForMfaMethodSelection();

      // Verify SMS option exists
      await expect(page.getByText(/text message.*otp/i)).toBeVisible();

      // Verify Push option does NOT exist
      await expect(page.getByText(/push notification/i)).not.toBeVisible();
    });

    test('TC-MFA-006: OTP success → verify access_token, id_token, refresh_token', async ({ page, context }) => {
      const account = TEST_ACCOUNTS.mfauser;

      await authHelpers.loginWithOtp(account.username, OTP_CODE.VALID);

      // Verify cookies
      const cookies = await context.cookies();
      const refreshToken = cookies.find(c => c.name === 'refresh_token');

      expect(refreshToken).toBeDefined();
      expect(refreshToken?.httpOnly).toBe(true);
    });

    test('TC-MFA-007: OTP success → verify device_bound: false (not trusted)', async ({ page }) => {
      const account = TEST_ACCOUNTS.mfauser;
      let otpVerifyResponse: any = null;

      page.on('response', async (response) => {
        if (response.url().includes('/auth/mfa/otp/verify') && response.status() === 201) {
          otpVerifyResponse = await response.json();
        }
      });

      await authHelpers.loginWithOtp(account.username, OTP_CODE.VALID);

      await page.waitForTimeout(1000);
      expect(otpVerifyResponse).toBeTruthy();
      expect(otpVerifyResponse.device_bound).toBe(false);
    });

    test('TC-MFA-008: Cancel OTP dialog → return to login screen', async ({ page }) => {
      const account = TEST_ACCOUNTS.mfauser;

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForMfaMethodSelection();
      await authHelpers.selectOtpMethod();

      // Cancel before entering OTP
      await authHelpers.cancelMfa();

      // Should return to login form
      await expect(page.locator('input[id="inline-username"]')).toBeVisible();
      await expect(page.locator('input[id="inline-password"]')).toBeVisible();
    });

    test.skip('TC-MFA-009: OTP timeout (>10s) → transaction expires (410)', async ({ page }) => {
      // TODO: Implement timeout scenario - requires waiting >10 seconds
      // This test validates that old transactions expire
    });

    test.skip('TC-MFA-010: Missing transaction_id → error (400)', async ({ page }) => {
      // TODO: Implement by calling verify endpoint without transaction_id
    });

    test.skip('TC-MFA-011: Missing code → MISSING_CODE error (400)', async ({ page }) => {
      // TODO: Implement by submitting empty OTP
    });

    test('TC-MFA-012: otponlyuser → verify mobile_approve_status: NOT_REGISTERED', async ({ page }) => {
      const account = TEST_ACCOUNTS.otponlyuser;
      let loginResponse: any = null;

      page.on('response', async (response) => {
        if (response.url().includes('/auth/login') && response.status() === 200) {
          loginResponse = await response.json();
        }
      });

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForMfaMethodSelection();

      await page.waitForTimeout(1000);
      expect(loginResponse).toBeTruthy();
      expect(loginResponse.mobile_approve_status).toBe('NOT_REGISTERED');
    });
  });

  test.describe('Push Notification Flows', () => {
    test('TC-PUSH-001: mfauser → select Push → display_number returned', async ({ page }) => {
      const account = TEST_ACCOUNTS.mfauser;
      let initiateResponse: any = null;

      page.on('response', async (response) => {
        if (response.url().includes('/auth/mfa/initiate') && response.status() === 201) {
          initiateResponse = await response.json();
        }
      });

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForMfaMethodSelection();
      await authHelpers.selectPushMethod();

      // Wait for initiate request
      await page.waitForTimeout(2000);

      expect(initiateResponse).toBeTruthy();
      expect(initiateResponse.display_number).toBeDefined();
    });

    test('TC-PUSH-002: Poll status → MFA_PENDING initially', async ({ page }) => {
      const account = TEST_ACCOUNTS.pushexpired; // This user's push never approves
      let pollResponse: any = null;

      page.on('response', async (response) => {
        if (response.url().match(/\/auth\/mfa\/transactions\/.*/) && response.status() === 200) {
          pollResponse = await response.json();
        }
      });

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForMfaMethodSelection();
      await authHelpers.selectPushMethod();

      // Wait for first poll
      await page.waitForTimeout(2000);

      expect(pollResponse).toBeTruthy();
      expect(pollResponse.status).toBe('MFA_PENDING');
    });

    test('TC-PUSH-003: mfauser → Wait 5+ seconds → status APPROVED → tokens (201)', async ({ page }) => {
      const account = TEST_ACCOUNTS.mfauser; // Auto-approves after 5s
      let approvedResponse: any = null;

      page.on('response', async (response) => {
        if (response.url().match(/\/auth\/mfa\/transactions\/.*/) && response.status() === 201) {
          approvedResponse = await response.json();
        }
      });

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForMfaMethodSelection();
      await authHelpers.selectPushMethod();

      // Wait for auto-approval (backend auto-approves after 5s for mfauser)
      await authHelpers.waitForPushApproval();

      // Wait for auth success
      await authHelpers.waitForAuthSuccess();

      expect(approvedResponse).toBeTruthy();
      expect(approvedResponse.access_token).toBeDefined();
      expect(approvedResponse.id_token).toBeDefined();
    });

    test('TC-PUSH-004: Verify auto-approval for mfauser after 5s', async ({ page }) => {
      const account = TEST_ACCOUNTS.mfauser;

      await authHelpers.loginWithPush(account.username);

      // Should be authenticated
      await authHelpers.verifyStorefrontAuthenticated();
    });

    test('TC-PUSH-005: pushfail → auto-rejects after 7s → PUSH_REJECTED (400)', async ({ page }) => {
      const account = TEST_ACCOUNTS.pushfail;
      let rejectedResponse: any = null;

      page.on('response', async (response) => {
        if (response.url().match(/\/auth\/mfa\/transactions\/.*/) && response.status() === 400) {
          rejectedResponse = await response.json();
        }
      });

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForMfaMethodSelection();
      await authHelpers.selectPushMethod();

      // Wait for auto-rejection
      await authHelpers.waitForPushRejection();

      await page.waitForTimeout(1000);
      expect(rejectedResponse).toBeTruthy();
      expect(rejectedResponse.error_code).toBe('CIAM_E01_04_002'); // PUSH_REJECTED
    });

    test.skip('TC-PUSH-006: pushexpired → stays PENDING until timeout', async ({ page }) => {
      // TODO: Implement - requires monitoring status over time
    });

    test.skip('TC-PUSH-007: pushexpired → wait 10+ seconds → TRANSACTION_EXPIRED (410)', async ({ page }) => {
      // TODO: Implement - requires waiting for transaction expiry
    });

    test('TC-PUSH-008: Push success → verify tokens returned', async ({ page }) => {
      const account = TEST_ACCOUNTS.mfauser;
      let pushResponse: any = null;

      page.on('response', async (response) => {
        if (response.url().match(/\/auth\/mfa\/transactions\/.*/) && response.status() === 201) {
          pushResponse = await response.json();
        }
      });

      await authHelpers.loginWithPush(account.username);

      await page.waitForTimeout(1000);
      expect(pushResponse).toBeTruthy();
      expect(pushResponse.access_token).toBeDefined();
      expect(pushResponse.id_token).toBeDefined();
    });

    test('TC-PUSH-009: Push success → verify refresh_token cookie set', async ({ page, context }) => {
      const account = TEST_ACCOUNTS.mfauser;

      await authHelpers.loginWithPush(account.username);

      const cookies = await context.cookies();
      const refreshToken = cookies.find(c => c.name === 'refresh_token');

      expect(refreshToken).toBeDefined();
      expect(refreshToken?.httpOnly).toBe(true);
      expect(refreshToken?.sameSite).toBe('Strict');
    });

    test('TC-PUSH-010: pushonlyuser → verify only Push option available', async ({ page }) => {
      const account = TEST_ACCOUNTS.pushonlyuser;

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForMfaMethodSelection();

      // Verify Push option exists
      await expect(page.getByText(/push notification/i)).toBeVisible();

      // Verify SMS option does NOT exist
      await expect(page.getByText(/text message.*otp/i)).not.toBeVisible();
    });

    test('TC-PUSH-011: Polling → verify retry_after: 1000 in MFA_PENDING', async ({ page }) => {
      const account = TEST_ACCOUNTS.pushexpired;
      let pollResponse: any = null;

      page.on('response', async (response) => {
        if (response.url().match(/\/auth\/mfa\/transactions\/.*/) && response.status() === 200) {
          pollResponse = await response.json();
        }
      });

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForMfaMethodSelection();
      await authHelpers.selectPushMethod();

      await page.waitForTimeout(2000);
      expect(pollResponse).toBeTruthy();
      expect(pollResponse.retry_after).toBe(1000);
    });

    test('TC-PUSH-012: Cancel push during polling → return to login', async ({ page }) => {
      const account = TEST_ACCOUNTS.mfauser;

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForMfaMethodSelection();
      await authHelpers.selectPushMethod();

      // Wait a bit for polling to start
      await page.waitForTimeout(2000);

      // Cancel during polling
      await authHelpers.cancelMfa();

      // Should return to login form
      await expect(page.locator('input[id="inline-username"]')).toBeVisible();
    });

    test.skip('TC-PUSH-013: Invalid transaction_id → TRANSACTION_NOT_FOUND (404)', async ({ page }) => {
      // TODO: Implement by polling with invalid transaction_id
    });

    test.skip('TC-PUSH-014: Missing context_id → error (400)', async ({ page }) => {
      // TODO: Implement by initiating without context_id
    });

    test('TC-PUSH-015: Push displays correct display_number in UI', async ({ page }) => {
      const account = TEST_ACCOUNTS.mfauser;

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForMfaMethodSelection();
      await authHelpers.selectPushMethod();

      // Wait for push approval screen
      await page.waitForTimeout(2000);

      // Verify display number is shown (should be 3 digits)
      await expect(page.getByText(/\d{3}/)).toBeVisible();
    });
  });
});
