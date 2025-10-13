import { test, expect } from '@playwright/test';
import { AuthHelpers } from '../helpers/auth-helpers';
import { TEST_ACCOUNTS, OTP_CODE } from '../fixtures/test-accounts';

/**
 * Test Suite: Error Scenarios & Edge Cases
 *
 * Coverage:
 * - Authentication error codes (CIAM_E01_01_xxx)
 * - eSign error codes (CIAM_E01_02_xxx)
 * - MFA error codes (CIAM_E01_03_xxx, CIAM_E01_04_xxx)
 * - Session/Token error codes (CIAM_E04_00_xxx, CIAM_E05_00_xxx)
 * - Missing parameters and invalid requests
 * - Transaction timeout and expiry scenarios
 *
 * Total: 25+ comprehensive error scenario tests
 */

test.describe('Error Scenarios & Edge Cases', () => {
  let authHelpers: AuthHelpers;

  test.beforeEach(async ({ page }) => {
    authHelpers = new AuthHelpers(page);
    await page.goto('http://localhost:3000');
  });

  test.describe('Authentication Errors (CIAM_E01_01_xxx)', () => {
    test('TC-ERR-001: Invalid credentials → CIAM_E01_01_001 (401)', async ({ page }) => {
      const account = TEST_ACCOUNTS.invaliduser;

      const responsePromise = page.waitForResponse(
        response => response.url().includes('/auth/login') && response.status() === 401
      );

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      // Wait for and parse response
      const response = await responsePromise;
      const errorResponse = await response.json();

      expect(errorResponse).toBeTruthy();
      expect(errorResponse.error_code).toBe('CIAM_E01_01_001');
    });

    test('TC-ERR-002: Account locked → CIAM_E01_01_002 (423)', async ({ page }) => {
      const account = TEST_ACCOUNTS.lockeduser;

      const responsePromise = page.waitForResponse(
        response => response.url().includes('/auth/login') && response.status() === 423
      );

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      // Wait for and parse response
      const response = await responsePromise;
      const errorResponse = await response.json();

      expect(errorResponse).toBeTruthy();
      expect(errorResponse.error_code).toBe('CIAM_E01_01_002');
    });

    test('TC-ERR-003: MFA locked account → CIAM_E01_01_005 (423)', async ({ page }) => {
      const account = TEST_ACCOUNTS.mfalockeduser;

      const responsePromise = page.waitForResponse(
        response => response.url().includes('/auth/login') && response.status() === 423
      );

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      // Wait for and parse response
      const response = await responsePromise;
      const errorResponse = await response.json();

      expect(errorResponse).toBeTruthy();
      expect(errorResponse.error_code).toBe('CIAM_E01_01_005');
    });

    test.skip('TC-ERR-004: Missing username → Error (400)', async ({ page }) => {
      // TODO: Implement validation for missing username
      let errorResponse: any = null;

      page.on('response', async (response) => {
        if (response.url().includes('/auth/login') && response.status() === 400) {
          errorResponse = await response.json();
        }
      });

      await authHelpers.openLoginSlideOut();
      await page.fill('input[id="inline-password"]', 'password');
      await authHelpers.submitLoginForm();

      await page.waitForTimeout(2000);
      expect(errorResponse).toBeTruthy();
    });

    test.skip('TC-ERR-005: Missing password → Error (400)', async ({ page }) => {
      // TODO: Implement validation for missing password
      let errorResponse: any = null;

      page.on('response', async (response) => {
        if (response.url().includes('/auth/login') && response.status() === 400) {
          errorResponse = await response.json();
        }
      });

      await authHelpers.openLoginSlideOut();
      await page.fill('input[id="inline-username"]', 'mfauser');
      await authHelpers.submitLoginForm();

      await page.waitForTimeout(2000);
      expect(errorResponse).toBeTruthy();
    });
  });

  test.describe('eSign Errors (CIAM_E01_02_xxx)', () => {
    test('TC-ERR-006: eSign decline returns to login', async ({ page }) => {
      const account = TEST_ACCOUNTS.trustedesignuser;

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForESignDialog();
      await authHelpers.declineESign();

      // Should return to login form
      await expect(page.locator('input[id="inline-username"]')).toBeVisible();
      await expect(page.locator('input[id="inline-password"]')).toBeVisible();

      // User should NOT be authenticated
      await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible();
    });

    test.skip('TC-ERR-007: eSign with invalid document_id → CIAM_E01_02_001', async ({ page }) => {
      // TODO: Implement by calling eSign accept with invalid document_id
      // This would require direct API calls or intercepting/modifying requests
    });

    test.skip('TC-ERR-008: eSign without context → CIAM_E01_02_002', async ({ page }) => {
      // TODO: Implement by calling eSign accept without valid context
    });
  });

  test.describe('MFA Errors (CIAM_E01_03_xxx, CIAM_E01_04_xxx)', () => {
    test('TC-ERR-009: Invalid OTP code → CIAM_E01_03_001 (400)', async ({ page }) => {
      const account = TEST_ACCOUNTS.mfauser;

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForMfaMethodSelection();
      await authHelpers.selectOtpMethod();

      const responsePromise = page.waitForResponse(
        response => response.url().includes('/auth/mfa/otp/verify') && response.status() === 400
      );

      await authHelpers.enterOtpCode(OTP_CODE.INVALID);

      // Wait for and parse response
      const response = await responsePromise;
      const errorResponse = await response.json();

      expect(errorResponse).toBeTruthy();
      expect(errorResponse.error_code).toBe('CIAM_E01_03_001');
    });

    test('TC-ERR-010: Push rejected → CIAM_E01_04_002 (400)', async ({ page }) => {
      const account = TEST_ACCOUNTS.pushfail; // Auto-rejects after 7s

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForMfaMethodSelection();

      const responsePromise = page.waitForResponse(
        response => response.url().match(/\/auth\/mfa\/transactions\/.*/) && response.status() === 400
      );

      await authHelpers.selectPushMethod();

      // Wait for auto-rejection
      await authHelpers.waitForPushRejection();

      // Wait for and parse response
      const response = await responsePromise;
      const errorResponse = await response.json();

      expect(errorResponse).toBeTruthy();
      expect(errorResponse.error_code).toBe('CIAM_E01_04_002');
    });

    test.skip('TC-ERR-011: OTP timeout → CIAM_E01_03_002 (410)', async ({ page }) => {
      // TODO: Implement by waiting >10 seconds for OTP transaction to expire
      // Backend should return 410 Gone with CIAM_E01_03_002
    });

    test.skip('TC-ERR-012: Push timeout → CIAM_E01_05_001 (410)', async ({ page }) => {
      // TODO: Implement by waiting for push transaction to expire
      // pushexpired user stays pending until timeout
    });

    test.skip('TC-ERR-013: Missing transaction_id → CIAM_E01_03_004', async ({ page }) => {
      // TODO: Implement by calling OTP verify without transaction_id
    });

    test.skip('TC-ERR-014: Invalid transaction_id → CIAM_E04_00_011', async ({ page }) => {
      // TODO: Implement by polling with non-existent transaction_id
    });

    test.skip('TC-ERR-015: Missing context_id → CIAM_E04_00_010', async ({ page }) => {
      // TODO: Implement by initiating MFA without context_id
    });

    test.skip('TC-ERR-016: Missing OTP code → Error (400)', async ({ page }) => {
      // TODO: Implement by submitting OTP verify without code
    });
  });

  test.describe('Session & Token Errors (CIAM_E04_00_xxx, CIAM_E05_00_xxx)', () => {
    test.skip('TC-ERR-017: Expired refresh token → Redirect to login', async ({ page, context }) => {
      // TODO: Implement by simulating expired refresh token
      // User should be redirected to login when refresh token expires
      // Expected: Session cleared, user must re-authenticate
    });

    test.skip('TC-ERR-018: Invalid refresh token → CIAM_E04_00_002', async ({ page, context }) => {
      // TODO: Implement by providing corrupted refresh token
      // Backend should return 401 with CIAM_E04_00_002
    });

    test.skip('TC-ERR-019: Null refresh token → CIAM_E04_00_008', async ({ page }) => {
      // TODO: Implement by calling refresh endpoint without token
    });

    test.skip('TC-ERR-020: Session expired → CIAM_E04_00_005', async ({ page }) => {
      // TODO: Implement by simulating session timeout (inactivity)
    });

    test('TC-ERR-021: Logout clears session → No authenticated state', async ({ page, context }) => {
      // Login first
      await authHelpers.loginAsTrustedUser();
      await authHelpers.verifyStorefrontAuthenticated();

      // Logout
      await authHelpers.logout();

      // Verify logged out state
      await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible();

      // Verify refresh_token cookie is cleared
      const cookies = await context.cookies();
      const refreshToken = cookies.find(c => c.name === 'refresh_token');
      expect(refreshToken === undefined || refreshToken.value === '').toBe(true);
    });
  });

  test.describe('Network & API Error Handling', () => {
    test.skip('TC-ERR-022: Network timeout → Error displayed', async ({ page }) => {
      // TODO: Implement by simulating network timeout
      // Use Playwright's route interception to delay/block requests
    });

    test.skip('TC-ERR-023: 500 Internal Server Error → Graceful error handling', async ({ page }) => {
      // TODO: Implement by intercepting and returning 500 error
      // Verify error message displayed to user
    });

    test.skip('TC-ERR-024: 503 Service Unavailable → Error displayed', async ({ page }) => {
      // TODO: Implement by intercepting and returning 503 error
    });
  });

  test.describe('Edge Cases & Boundary Testing', () => {
    test('TC-ERR-025: Cancel MFA before completion → Return to login', async ({ page }) => {
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

    test('TC-ERR-026: Cancel push notification → Return to login', async ({ page }) => {
      const account = TEST_ACCOUNTS.mfauser;

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForMfaMethodSelection();
      await authHelpers.selectPushMethod();

      // Wait for polling to start
      await page.waitForTimeout(2000);

      // Cancel during polling
      await authHelpers.cancelMfa();

      // Should return to login form
      await expect(page.locator('input[id="inline-username"]')).toBeVisible();
    });

    test('TC-ERR-027: Decline eSign preserves username in form', async ({ page }) => {
      const account = TEST_ACCOUNTS.trustedesignuser;

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForESignDialog();
      await authHelpers.declineESign();

      // Username should still be in the form (preserved)
      const usernameValue = await page.locator('input[id="inline-username"]').inputValue();
      expect(usernameValue).toBe(account.username);

      // But user should NOT be authenticated
      await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible();
    });

    test.skip('TC-ERR-028: Extremely long username → Validation error', async ({ page }) => {
      // TODO: Implement validation for extremely long inputs
      const longUsername = 'a'.repeat(1000);

      await authHelpers.openLoginSlideOut();
      await page.fill('input[id="inline-username"]', longUsername);
      await page.fill('input[id="inline-password"]', 'password');
      await authHelpers.submitLoginForm();

      // Should show validation error
      await page.waitForTimeout(2000);
    });

    test.skip('TC-ERR-029: Special characters in username → Handled correctly', async ({ page }) => {
      // TODO: Implement special character handling test
      const specialUsername = "user'; DROP TABLE users;--";

      await authHelpers.openLoginSlideOut();
      await page.fill('input[id="inline-username"]', specialUsername);
      await page.fill('input[id="inline-password"]', 'password');
      await authHelpers.submitLoginForm();

      await page.waitForTimeout(2000);
      // Should either reject or sanitize, never execute SQL
    });

    test('TC-ERR-030: Multiple rapid login attempts → Consistent error handling', async ({ page }) => {
      const account = TEST_ACCOUNTS.invaliduser;
      const responsePromises: Promise<any>[] = [];

      // Attempt 3 rapid logins
      for (let i = 0; i < 3; i++) {
        await authHelpers.openLoginSlideOut();
        await authHelpers.fillLoginCredentials(account.username, account.password);

        const responsePromise = page.waitForResponse(
          response => response.url().includes('/auth/login') && response.status() === 401
        );
        responsePromises.push(responsePromise);

        await authHelpers.submitLoginForm();
        await page.waitForTimeout(1000);
      }

      // Wait for all responses
      const responses = await Promise.all(responsePromises);

      // Should have received 3 error responses
      expect(responses.length).toBe(3);

      // Verify all are 401 errors
      for (const response of responses) {
        expect(response.status()).toBe(401);
      }
    });
  });

  test.describe('Device Binding Error Scenarios', () => {
    test('TC-ERR-031: Skip device trust → device_bound remains false', async ({ page }) => {
      const account = TEST_ACCOUNTS.mfauser;

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForMfaMethodSelection();
      await authHelpers.selectOtpMethod();

      const responsePromise = page.waitForResponse(
        response => response.url().includes('/auth/mfa/otp/verify') && response.status() === 201
      );

      await authHelpers.enterOtpCode(OTP_CODE.VALID);

      // Wait for and parse response
      const response = await responsePromise;
      const otpVerifyResponse = await response.json();

      await authHelpers.waitForDeviceBindDialog();
      await authHelpers.skipDeviceTrust();

      // Should complete authentication without binding
      await authHelpers.waitForAuthSuccess();
      await authHelpers.verifyStorefrontAuthenticated();

      // Verify device_bound is false
      expect(otpVerifyResponse).toBeTruthy();
      expect(otpVerifyResponse.device_bound).toBe(false);
    });

    test('TC-ERR-032: Expired device trust → MFA required again', async ({ page }) => {
      const account = TEST_ACCOUNTS.expiredtrustuser;

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      // Should show MFA (device trust expired)
      await authHelpers.waitForMfaMethodSelection();
      await expect(page.getByText(/choose verification method/i)).toBeVisible();
    });

    test.skip('TC-ERR-033: Device bind without transaction → Error', async ({ page }) => {
      // TODO: Implement by calling device/bind without valid transaction
    });
  });

  test.describe('Cross-App Error Scenarios', () => {
    test('TC-ERR-034: Anonymous user accessing protected route → Redirect or error', async ({ page }) => {
      // Do NOT login, navigate directly to snapshot (protected route)
      await page.goto('http://localhost:3001');

      // Should either redirect back or show auth required message
      await page.waitForTimeout(2000);

      const currentUrl = page.url();
      const isRedirected = currentUrl.includes('localhost:3000');
      const hasAuthMessage = await page.getByText(/sign in|log in|authentication required/i).isVisible().catch(() => false);

      expect(isRedirected || hasAuthMessage).toBe(true);
    });

    test('TC-ERR-035: Logout from one app → Session cleared on other app', async ({ page }) => {
      const account = TEST_ACCOUNTS.trusteduser;

      // Login on storefront
      await authHelpers.loginAsTrustedUser(account.username);

      // Logout from storefront
      await authHelpers.logout();

      // Verify logged out on storefront
      await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible();

      // Navigate to snapshot
      await page.goto('http://localhost:3001');

      // Should be redirected or show login requirement
      await page.waitForTimeout(2000);
      const currentUrl = page.url();
      const isRedirected = currentUrl.includes('localhost:3000');
      const hasAuthMessage = await page.getByText(/sign in|log in|authentication required/i).isVisible().catch(() => false);

      expect(isRedirected || hasAuthMessage).toBe(true);
    });
  });
});
