import { test, expect } from '@playwright/test';
import { AuthHelpers } from '../helpers/auth-helpers';
import { TEST_ACCOUNTS, APP_INFO } from '../fixtures/test-accounts';

/**
 * Test Suite: Cross-App Integration
 *
 * Coverage:
 * - Storefront (port 3000) ↔ Account Servicing/Snapshot (port 3001) navigation
 * - Session persistence across applications
 * - Logout propagation between apps
 * - Multi-tab session consistency
 *
 * Total: 8 comprehensive cross-app integration tests
 */

test.describe('Cross-App Integration Tests', () => {
  let authHelpers: AuthHelpers;

  test.beforeEach(async ({ page }) => {
    authHelpers = new AuthHelpers(page);
    await page.goto('http://localhost:3000');
  });

  test.describe('Storefront → Snapshot Navigation', () => {
    test('TC-CROSS-001: Login on Storefront → Navigate to Snapshot → Session preserved', async ({ page }) => {
      const account = TEST_ACCOUNTS.trusteduser;

      // Login on storefront
      await authHelpers.loginAsTrustedUser(account.username);
      await authHelpers.verifyStorefrontAuthenticated();

      // Navigate to snapshot
      await authHelpers.navigateToSnapshot();

      // Should be authenticated on snapshot (no redirect to login)
      await authHelpers.verifySnapshotPageLoaded();
    });

    test('TC-CROSS-002: Snapshot page displays account data after cross-app navigation', async ({ page }) => {
      const account = TEST_ACCOUNTS.trusteduser;

      await authHelpers.loginAsTrustedUser(account.username);
      await authHelpers.navigateToSnapshot();

      await authHelpers.verifySnapshotPageLoaded();

      // Verify account-specific data is displayed
      await expect(page.getByText(/account balance|transaction history/i)).toBeVisible();
    });

    test('TC-CROSS-003: Anonymous user on Storefront → Navigate to Snapshot → Redirected to login', async ({ page }) => {
      // Do NOT login, navigate directly to snapshot
      await page.goto('http://localhost:3001');

      // Should either redirect back or show login requirement
      // Wait a moment for potential redirect
      await page.waitForTimeout(2000);

      const currentUrl = page.url();
      // Should either be back at storefront login OR show auth required message
      const isRedirected = currentUrl.includes('localhost:3000');
      const hasAuthMessage = await page.getByText(/sign in|log in|authentication required/i).isVisible().catch(() => false);

      expect(isRedirected || hasAuthMessage).toBe(true);
    });

    test('TC-CROSS-004: Refresh token shared across Storefront and Snapshot', async ({ page, context }) => {
      const account = TEST_ACCOUNTS.trusteduser;

      await authHelpers.loginAsTrustedUser(account.username);

      // Get cookies after login
      const storefrontCookies = await context.cookies();
      const storefrontRefreshToken = storefrontCookies.find(c => c.name === 'refresh_token');

      expect(storefrontRefreshToken).toBeDefined();

      // Navigate to snapshot
      await authHelpers.navigateToSnapshot();
      await authHelpers.verifySnapshotPageLoaded();

      // Get cookies on snapshot
      const snapshotCookies = await context.cookies();
      const snapshotRefreshToken = snapshotCookies.find(c => c.name === 'refresh_token');

      // Same refresh token should be accessible (same domain/path)
      expect(snapshotRefreshToken).toBeDefined();
      expect(snapshotRefreshToken?.value).toBe(storefrontRefreshToken?.value);
    });
  });

  test.describe('Logout Cross-App Propagation', () => {
    test('TC-CROSS-005: Logout from Snapshot → Session cleared on Storefront', async ({ page, context }) => {
      const account = TEST_ACCOUNTS.trusteduser;

      // Login on storefront
      await authHelpers.loginAsTrustedUser(account.username);

      // Navigate to snapshot
      await authHelpers.navigateToSnapshot();
      await authHelpers.verifySnapshotPageLoaded();

      // Logout from snapshot
      await authHelpers.logout();

      // Navigate back to storefront
      await page.goto('http://localhost:3000');

      // Should NOT be authenticated on storefront
      await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible();

      // Verify refresh token cleared
      const cookies = await context.cookies();
      const refreshToken = cookies.find(c => c.name === 'refresh_token');
      expect(refreshToken === undefined || refreshToken.value === '').toBe(true);
    });

    test('TC-CROSS-006: Logout from Storefront → Session cleared on Snapshot', async ({ page }) => {
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

  test.describe('Multi-Tab Session Consistency', () => {
    test('TC-CROSS-007: Login in Tab 1 → Open Tab 2 → Both tabs authenticated', async ({ context }) => {
      const account = TEST_ACCOUNTS.trusteduser;

      // Tab 1: Storefront
      const page1 = await context.newPage();
      const authHelpers1 = new AuthHelpers(page1);
      await page1.goto('http://localhost:3000');

      await authHelpers1.loginAsTrustedUser(account.username);
      await authHelpers1.verifyStorefrontAuthenticated();

      // Tab 2: Also Storefront
      const page2 = await context.newPage();
      await page2.goto('http://localhost:3000');

      // Wait a moment for session to load
      await page2.waitForTimeout(2000);

      // Tab 2 should also be authenticated (shared cookies)
      const authHelpers2 = new AuthHelpers(page2);
      await authHelpers2.verifyStorefrontAuthenticated();

      await page1.close();
      await page2.close();
    });

    test('TC-CROSS-008: Logout in Tab 1 → Tab 2 session also cleared', async ({ context }) => {
      const account = TEST_ACCOUNTS.trusteduser;

      // Tab 1: Storefront - login
      const page1 = await context.newPage();
      const authHelpers1 = new AuthHelpers(page1);
      await page1.goto('http://localhost:3000');
      await authHelpers1.loginAsTrustedUser(account.username);

      // Tab 2: Storefront - should also be authenticated
      const page2 = await context.newPage();
      await page2.goto('http://localhost:3000');
      await page2.waitForTimeout(2000);

      // Logout from Tab 1
      await authHelpers1.logout();

      // Refresh Tab 2
      await page2.reload();
      await page2.waitForTimeout(2000);

      // Tab 2 should now be logged out
      await expect(page2.getByRole('button', { name: 'Log In' })).toBeVisible();

      await page1.close();
      await page2.close();
    });
  });
});
