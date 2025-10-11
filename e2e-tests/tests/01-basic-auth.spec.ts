import { test, expect } from '@playwright/test';
import { AuthHelpers } from '../helpers/auth-helpers';
import { TEST_ACCOUNTS } from '../fixtures/test-accounts';

/**
 * Test Suite: Basic Authentication Flows
 *
 * Coverage:
 * - TC-AUTH-001 to TC-AUTH-004: Trusted user login (instant success)
 * - TC-SF-001 to TC-SF-005: Anonymous storefront navigation
 * - TC-SF-006 to TC-SF-013: Login flows from storefront
 */

test.describe('Basic Authentication Flows', () => {
  let authHelpers: AuthHelpers;

  test.beforeEach(async ({ page }) => {
    authHelpers = new AuthHelpers(page);
    await page.goto('http://localhost:3000');
  });

  test.describe('Anonymous User - Storefront Navigation', () => {
    test('TC-SF-001: Load storefront homepage as anonymous user', async ({ page }) => {
      await expect(page.getByText(/welcome to storefront/i)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible();
    });

    test('TC-SF-002: Verify hero section displays without auth', async ({ page }) => {
      await expect(page.getByText(/every great journey/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /open account/i })).toBeVisible();
    });

    test('TC-SF-003: Click Sign In button - login slide-out appears', async ({ page }) => {
      await authHelpers.openLoginSlideOut();
      await expect(page.locator('input[id="inline-username"]')).toBeVisible();
      await expect(page.locator('input[id="inline-password"]')).toBeVisible();
    });

    test('TC-SF-004: Navigate storefront without login - no protected content shown', async ({ page }) => {
      // Verify no authenticated user message is shown
      await expect(page.getByText(/welcome back,/i)).not.toBeVisible();
    });

    test.skip('TC-SF-005: Verify build info displays correctly', async ({ page }) => {
      // TODO: Find where build info is displayed on the page
      // Build info typically appears in footer/bottom of page - check for "Build" text
      await expect(page.getByText(/build|version/i)).toBeVisible();
    });
  });

  test.describe('Trusted User - Instant Login', () => {
    test('TC-AUTH-001: trusteduser with correct password - instant login (device trusted)', async ({ page }) => {
      const account = TEST_ACCOUNTS.trusteduser;

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      // Wait for successful authentication (slide-out closes)
      await authHelpers.waitForAuthSuccess();

      // Verify authenticated state on storefront
      await authHelpers.verifyStorefrontAuthenticated();
    });

    test.skip('TC-AUTH-002: trusteduser - verify welcome message displays with username', async ({ page }) => {
      // TODO: Find exact welcome message text format
      await authHelpers.loginAsTrustedUser();

      // Verify personalized welcome message
      await expect(page.getByText(/welcome back.*trusteduser/i)).toBeVisible();
    });

    test('TC-AUTH-003: trusteduser - verify tokens are stored (check cookies)', async ({ page, context }) => {
      await authHelpers.loginAsTrustedUser();

      // Verify refresh_token cookie is set
      const cookies = await context.cookies();
      const refreshToken = cookies.find(c => c.name === 'refresh_token');

      expect(refreshToken).toBeDefined();
      expect(refreshToken?.httpOnly).toBe(true);
      expect(refreshToken?.sameSite).toBe('Strict');
    });

    test('TC-AUTH-004: trusteduser - device_bound flag should be true', async ({ page }) => {
      // This test validates the backend response - we can check via network inspection
      let deviceBound = false;

      page.on('response', async (response) => {
        if (response.url().includes('/auth/login') && response.status() === 201) {
          const json = await response.json();
          if (json.device_bound !== undefined) {
            deviceBound = json.device_bound;
          }
        }
      });

      await authHelpers.loginAsTrustedUser();

      // Wait a moment for network request to complete
      await page.waitForTimeout(1000);

      expect(deviceBound).toBe(true);
    });
  });

  test.describe('Login with Invalid Credentials', () => {
    test.skip('TC-SF-010: Invalid credentials - error displays in slide-out', async ({ page }) => {
      // TODO: Debug why error Alert is not being found in time
      const account = TEST_ACCOUNTS.invaliduser;

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      // Verify error message is shown
      await authHelpers.verifyErrorMessage(/invalid.*credentials|unauthorized/i);
    });

    test('TC-ERR-001: Invalid credentials - returns CIAM_E01_01_001 (401)', async ({ page }) => {
      const account = TEST_ACCOUNTS.invaliduser;

      let errorCode = '';
      page.on('response', async (response) => {
        if (response.url().includes('/auth/login') && response.status() === 401) {
          const json = await response.json();
          errorCode = json.error_code || '';
        }
      });

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await page.waitForTimeout(2000);
      expect(errorCode).toBe('CIAM_E01_01_001');
    });
  });

  test.describe('Account Locked Scenarios', () => {
    test.skip('TC-SF-011: Locked account - error message displays', async ({ page }) => {
      // TODO: Debug why error Alert is not being found in time
      const account = TEST_ACCOUNTS.lockeduser;

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      // Verify locked account error
      await authHelpers.verifyErrorMessage(/account.*locked|temporarily locked/i);
    });

    test('TC-ERR-002: Account locked - returns CIAM_E01_01_002 (423)', async ({ page }) => {
      const account = TEST_ACCOUNTS.lockeduser;

      let errorCode = '';
      let statusCode = 0;

      page.on('response', async (response) => {
        if (response.url().includes('/auth/login')) {
          statusCode = response.status();
          if (statusCode === 423) {
            const json = await response.json();
            errorCode = json.error_code || '';
          }
        }
      });

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await page.waitForTimeout(2000);
      expect(statusCode).toBe(423);
      expect(errorCode).toBe('CIAM_E01_01_002');
    });

    test('TC-ERR-003: MFA locked account - returns CIAM_E01_01_005 (423)', async ({ page }) => {
      const account = TEST_ACCOUNTS.mfalockeduser;

      let errorCode = '';
      let statusCode = 0;

      page.on('response', async (response) => {
        if (response.url().includes('/auth/login')) {
          statusCode = response.status();
          if (statusCode === 423) {
            const json = await response.json();
            errorCode = json.error_code || '';
          }
        }
      });

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      await page.waitForTimeout(2000);
      expect(statusCode).toBe(423);
      expect(errorCode).toBe('CIAM_E01_01_005');
    });
  });

  test.describe('Logout Flow', () => {
    test('TC-SF-013: Logout from storefront - welcome message disappears', async ({ page }) => {
      // Login first
      await authHelpers.loginAsTrustedUser();
      await authHelpers.verifyStorefrontAuthenticated();

      // Logout
      await authHelpers.logout();

      // Verify logged out state - "Log In" button should be visible again
      await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible();
    });

    test('TC-SESSION-005: Logout - refresh_token cookie cleared', async ({ page, context }) => {
      // Login first
      await authHelpers.loginAsTrustedUser();

      // Logout
      await authHelpers.logout();

      // Wait a moment for cookie to be cleared
      await page.waitForTimeout(1000);

      // Verify refresh_token cookie is cleared
      const cookies = await context.cookies();
      const refreshToken = cookies.find(c => c.name === 'refresh_token');

      expect(refreshToken === undefined || refreshToken.value === '').toBe(true);
    });
  });

  test.describe('MFA Cancellation', () => {
    test('TC-SF-009: Login - Cancel MFA dialog - return to login form', async ({ page }) => {
      const account = TEST_ACCOUNTS.mfauser;

      await authHelpers.openLoginSlideOut();
      await authHelpers.fillLoginCredentials(account.username, account.password);
      await authHelpers.submitLoginForm();

      // Wait for MFA dialog
      await authHelpers.waitForMfaMethodSelection();

      // Cancel MFA
      await authHelpers.cancelMfa();

      // Verify returned to login form (drawer should still be open with login fields)
      await expect(page.locator('input[id="inline-username"]')).toBeVisible();
      await expect(page.locator('input[id="inline-password"]')).toBeVisible();
    });
  });

  test.describe('Missing Credentials Errors', () => {
    test.skip('TC-ERR-005: Missing username in login - returns error (400)', async ({ page }) => {
      // TODO: Debug why error Alert is not being found in time
      await authHelpers.openLoginSlideOut();

      // Fill only password
      await page.fill('input[id="inline-password"]', 'password');
      await authHelpers.submitLoginForm();

      // Verify error message
      await authHelpers.verifyErrorMessage(/username.*required|missing.*credentials/i);
    });

    test.skip('TC-ERR-006: Missing password in login - returns error (400)', async ({ page }) => {
      // TODO: Debug why error Alert is not being found in time
      await authHelpers.openLoginSlideOut();

      // Fill only username
      await page.fill('input[id="inline-username"]', 'mfauser');
      await authHelpers.submitLoginForm();

      // Verify error message
      await authHelpers.verifyErrorMessage(/password.*required|missing.*credentials/i);
    });
  });
});
