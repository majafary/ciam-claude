import { test, expect } from '@playwright/test';
import { AuthHelpers } from '../helpers/auth-helpers';
import { TEST_ACCOUNTS, OTP_CODE } from '../fixtures/test-accounts';

/**
 * Test Suite: eSign (Electronic Signature) Flows
 *
 * Coverage:
 * - eSign after login (trustedesignuser)
 * - eSign after MFA (mfaesignuser)
 * - eSign acceptance and decline flows
 * - Device binding after eSign
 * - Compliance eSign scenarios (complianceuser)
 *
 * Total: 18 comprehensive eSign tests
 */

test.describe('eSign (Electronic Signature) Flows', () => {
  let authHelpers: AuthHelpers;

  test.beforeEach(async ({ page }) => {
    authHelpers = new AuthHelpers(page);
    await page.goto('http://localhost:3000');
  });

  test.describe('eSign After Trusted Login', () => {
    test('TC-ESIGN-001: trustedesignuser → Login → ESIGN_REQUIRED', async ({ page }) => {
      const account = TEST_ACCOUNTS.trustedesignuser;

      const responsePromise = page.waitForResponse(
        response => response.url().includes('/auth/login') && response.status() === 200
      );

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      // Wait for and parse response
      const response = await responsePromise;
      const loginResponse = await response.json();

      // Wait for eSign dialog
      await authHelpers.waitForESignDialog();

      expect(loginResponse).toBeTruthy();
      expect(loginResponse.response_type_code).toBe('ESIGN_REQUIRED');
      expect(loginResponse.esign_document_id).toBeDefined();
    });

    test('TC-ESIGN-002: eSign dialog displays document title (Terms of Service)', async ({ page }) => {
      const account = TEST_ACCOUNTS.trustedesignuser;

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForESignDialog();

      // Verify document title
      await expect(page.getByText(/terms of service/i)).toBeVisible();
    });

    test('TC-ESIGN-003: Accept eSign → Device bind dialog appears', async ({ page }) => {
      const account = TEST_ACCOUNTS.trustedesignuser;

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForESignDialog();
      await authHelpers.acceptESign();

      // Should show device binding dialog
      await authHelpers.waitForDeviceBindDialog();
      await expect(page.getByText(/trust this device/i)).toBeVisible();
    });

    test('TC-ESIGN-004: Accept eSign → Trust device → Authenticated', async ({ page }) => {
      const account = TEST_ACCOUNTS.trustedesignuser;

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForESignDialog();
      await authHelpers.acceptESign();

      await authHelpers.waitForDeviceBindDialog();
      await authHelpers.trustDevice();

      // Should be authenticated
      await authHelpers.waitForAuthSuccess();
      await authHelpers.verifyStorefrontAuthenticated();
    });

    test('TC-ESIGN-005: Accept eSign → Skip device trust → Authenticated', async ({ page }) => {
      const account = TEST_ACCOUNTS.trustedesignuser;

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForESignDialog();
      await authHelpers.acceptESign();

      await authHelpers.waitForDeviceBindDialog();
      await authHelpers.skipDeviceTrust();

      // Should be authenticated
      await authHelpers.waitForAuthSuccess();
      await authHelpers.verifyStorefrontAuthenticated();
    });

    test('TC-ESIGN-006: Decline eSign → Return to login screen', async ({ page }) => {
      const account = TEST_ACCOUNTS.trustedesignuser;

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForESignDialog();
      await authHelpers.declineESign();

      // Should return to login form
      await expect(page.locator('input[id="inline-username"]')).toBeVisible();
      await expect(page.locator('input[id="inline-password"]')).toBeVisible();
    });

    test('TC-ESIGN-007: Decline eSign → User not authenticated', async ({ page }) => {
      const account = TEST_ACCOUNTS.trustedesignuser;

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForESignDialog();
      await authHelpers.declineESign();

      // Verify NOT authenticated (Log In button should be visible)
      await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible();
    });
  });

  test.describe('eSign After MFA', () => {
    test('TC-ESIGN-008: mfaesignuser → MFA → ESIGN_REQUIRED', async ({ page }) => {
      const account = TEST_ACCOUNTS.mfaesignuser;

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForMfaMethodSelection();
      await authHelpers.selectOtpMethod();

      const responsePromise = page.waitForResponse(
        response => response.url().includes('/auth/mfa/otp/verify') && response.status() === 200
      );

      await authHelpers.enterOtpCode(OTP_CODE.VALID);

      // Wait for and parse response
      const response = await responsePromise;
      const mfaVerifyResponse = await response.json();

      // eSign should appear after MFA
      await authHelpers.waitForESignDialog();

      expect(mfaVerifyResponse).toBeTruthy();
      expect(mfaVerifyResponse.response_type_code).toBe('ESIGN_REQUIRED');
    });

    test('TC-ESIGN-009: MFA → eSign accept → Device bind → Authenticated', async ({ page }) => {
      const account = TEST_ACCOUNTS.mfaesignuser;

      await authHelpers.loginWithMfaAndESign(account.username, true);

      // Should be authenticated
      await authHelpers.verifyStorefrontAuthenticated();
    });

    test('TC-ESIGN-010: MFA → eSign decline → Return to login', async ({ page }) => {
      const account = TEST_ACCOUNTS.mfaesignuser;

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForMfaMethodSelection();
      await authHelpers.selectOtpMethod();
      await authHelpers.enterOtpCode(OTP_CODE.VALID);

      await authHelpers.waitForESignDialog();
      await authHelpers.declineESign();

      // Should return to login form
      await expect(page.locator('input[id="inline-username"]')).toBeVisible();
    });

    test('TC-ESIGN-011: MFA → eSign → Trust device → device_bound flag validated', async ({ page }) => {
      const account = TEST_ACCOUNTS.mfaesignuser;

      const responsePromise = page.waitForResponse(
        response => response.url().includes('/auth/device/bind') && response.status() === 201
      );

      await authHelpers.loginWithMfaAndESign(account.username, true);

      // Wait for and parse response
      const response = await responsePromise;
      const deviceBindResponse = await response.json();

      expect(deviceBindResponse).toBeTruthy();
      expect(deviceBindResponse.device_bound).toBe(true);
    });
  });

  test.describe('Compliance eSign Scenarios', () => {
    test('TC-ESIGN-012: complianceuser → eSign for compliance update', async ({ page }) => {
      const account = TEST_ACCOUNTS.complianceuser;

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      // Should show eSign for compliance
      await authHelpers.waitForESignDialog();
      await expect(page.getByText(/terms of service|privacy policy|compliance/i)).toBeVisible();
    });

    test('TC-ESIGN-013: Compliance eSign → is_mandatory flag true', async ({ page }) => {
      const account = TEST_ACCOUNTS.complianceuser;

      const responsePromise = page.waitForResponse(
        response => response.url().includes('/auth/login') && response.status() === 200
      );

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      // Wait for and parse response
      const response = await responsePromise;
      const loginResponse = await response.json();

      await authHelpers.waitForESignDialog();

      expect(loginResponse).toBeTruthy();
      expect(loginResponse.is_mandatory).toBe(true);
    });

    test('TC-ESIGN-014: Compliance eSign accept → Complete authentication', async ({ page }) => {
      const account = TEST_ACCOUNTS.complianceuser;

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForESignDialog();
      await authHelpers.acceptESign();

      await authHelpers.waitForDeviceBindDialog();
      await authHelpers.trustDevice();

      await authHelpers.waitForAuthSuccess();
      await authHelpers.verifyStorefrontAuthenticated();
    });
  });

  test.describe('eSign API Response Validation', () => {
    test('TC-ESIGN-015: eSign response includes esign_document_id', async ({ page }) => {
      const account = TEST_ACCOUNTS.trustedesignuser;

      const responsePromise = page.waitForResponse(
        response => response.url().includes('/auth/login') && response.status() === 200
      );

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      // Wait for and parse response
      const response = await responsePromise;
      const loginResponse = await response.json();

      await authHelpers.waitForESignDialog();

      expect(loginResponse.esign_document_id).toBeDefined();
      expect(loginResponse.esign_document_id.length).toBeGreaterThan(0);
    });

    test('TC-ESIGN-016: eSign accept → POST /auth/esign/accept called', async ({ page }) => {
      const account = TEST_ACCOUNTS.trustedesignuser;

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForESignDialog();

      const responsePromise = page.waitForResponse(
        response => response.url().includes('/auth/esign/accept') && response.status() === 201
      );

      await authHelpers.acceptESign();

      // Wait for and parse response
      const response = await responsePromise;
      const acceptResponse = await response.json();

      expect(acceptResponse).toBeTruthy();
    });

    test('TC-ESIGN-017: eSign document fetch → GET /auth/esign/documents/:id', async ({ page }) => {
      const account = TEST_ACCOUNTS.trustedesignuser;

      const responsePromise = page.waitForResponse(
        response => response.url().match(/\/auth\/esign\/documents\/.*/) && response.status() === 200
      );

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForESignDialog();

      // Wait for and parse response
      const response = await responsePromise;
      const documentResponse = await response.json();

      expect(documentResponse).toBeTruthy();
      expect(documentResponse.title).toBeDefined();
      expect(documentResponse.content).toBeDefined();
    });

    test('TC-ESIGN-018: eSign decline → Returns to login with context preserved', async ({ page }) => {
      const account = TEST_ACCOUNTS.trustedesignuser;

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await authHelpers.waitForESignDialog();
      await authHelpers.declineESign();

      // Username should still be in the form (preserved)
      const usernameValue = await page.locator('input[id="inline-username"]').inputValue();
      expect(usernameValue).toBe(account.username);

      // But should NOT be authenticated
      await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible();
    });
  });
});
