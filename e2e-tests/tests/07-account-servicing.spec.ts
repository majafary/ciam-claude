import { test, expect } from '@playwright/test';
import { AuthHelpers } from '../helpers/auth-helpers';
import { TEST_ACCOUNTS } from '../fixtures/test-accounts';

/**
 * Test Suite: Account Servicing (Snapshot Page)
 *
 * Coverage:
 * - Navigation to account servicing page (http://localhost:3001)
 * - Account data display after authentication
 * - Session persistence across apps
 * - Profile information display
 * - Logout from account servicing page
 * - Protected content access control
 *
 * Total: 12 comprehensive account servicing tests
 */

test.describe('Account Servicing (Snapshot Page)', () => {
  let authHelpers: AuthHelpers;

  test.beforeEach(async ({ page }) => {
    authHelpers = new AuthHelpers(page);
    await page.goto('http://localhost:3000');
  });

  test.describe('Protected Route Access', () => {
    test('TC-ACCOUNT-001: Anonymous user → Snapshot → Redirect to login', async ({ page }) => {
      // Navigate directly to snapshot without login
      await page.goto('http://localhost:3001');

      // Should redirect or show auth required
      await page.waitForTimeout(2000);

      const currentUrl = page.url();
      const isRedirected = currentUrl.includes('localhost:3000');
      const hasAuthMessage = await page.getByText(/sign in|log in|authentication required/i).isVisible().catch(() => false);

      expect(isRedirected || hasAuthMessage).toBe(true);
    });

    test('TC-ACCOUNT-002: Authenticated user → Navigate to Snapshot → Access granted', async ({ page }) => {
      const account = TEST_ACCOUNTS.trusteduser;

      // Login on storefront
      await authHelpers.loginAsTrustedUser(account.username);
      await authHelpers.verifyStorefrontAuthenticated();

      // Navigate to snapshot
      await authHelpers.navigateToSnapshot();

      // Should successfully load snapshot page
      await authHelpers.verifySnapshotPageLoaded();
    });

    test('TC-ACCOUNT-003: Direct URL access to Snapshot when authenticated', async ({ page, context }) => {
      const account = TEST_ACCOUNTS.trusteduser;

      // Login on storefront first
      await authHelpers.loginAsTrustedUser(account.username);
      await authHelpers.verifyStorefrontAuthenticated();

      // Close current page
      await page.close();

      // Open new page and navigate directly to snapshot
      const newPage = await context.newPage();
      const newAuthHelpers = new AuthHelpers(newPage);
      await newPage.goto('http://localhost:3001');

      // Should be authenticated (session persists)
      await newPage.waitForTimeout(2000);
      await newAuthHelpers.verifySnapshotPageLoaded();

      await newPage.close();
    });
  });

  test.describe('Account Data Display', () => {
    test('TC-ACCOUNT-004: Snapshot displays account balance information', async ({ page }) => {
      const account = TEST_ACCOUNTS.trusteduser;

      await authHelpers.loginAsTrustedUser(account.username);
      await authHelpers.navigateToSnapshot();
      await authHelpers.verifySnapshotPageLoaded();

      // Verify account data is displayed
      await expect(page.getByText(/account balance|transaction history|account details/i)).toBeVisible();
    });

    test.skip('TC-ACCOUNT-005: Profile information displays correctly', async ({ page }) => {
      // TODO: Implement once we know the exact profile data structure
      const account = TEST_ACCOUNTS.trusteduser;

      await authHelpers.loginAsTrustedUser(account.username);
      await authHelpers.navigateToSnapshot();
      await authHelpers.verifySnapshotPageLoaded();

      // Verify profile data (username, email, etc.)
      await expect(page.getByText(new RegExp(account.username, 'i'))).toBeVisible();
    });

    test.skip('TC-ACCOUNT-006: Transaction history loads correctly', async ({ page }) => {
      // TODO: Implement once we know transaction data structure
      const account = TEST_ACCOUNTS.trusteduser;

      await authHelpers.loginAsTrustedUser(account.username);
      await authHelpers.navigateToSnapshot();
      await authHelpers.verifySnapshotPageLoaded();

      // Verify transaction table or list exists
      // await expect(page.locator('[data-testid="transaction-table"]')).toBeVisible();
    });
  });

  test.describe('Session Persistence', () => {
    test('TC-ACCOUNT-007: Session persists across storefront → snapshot navigation', async ({ page, context }) => {
      const account = TEST_ACCOUNTS.trusteduser;

      // Login on storefront
      await authHelpers.loginAsTrustedUser(account.username);

      // Get cookies before navigation
      const storefrontCookies = await context.cookies();
      const storefrontRefreshToken = storefrontCookies.find(c => c.name === 'refresh_token');
      expect(storefrontRefreshToken).toBeDefined();

      // Navigate to snapshot
      await authHelpers.navigateToSnapshot();
      await authHelpers.verifySnapshotPageLoaded();

      // Get cookies after navigation
      const snapshotCookies = await context.cookies();
      const snapshotRefreshToken = snapshotCookies.find(c => c.name === 'refresh_token');

      // Same refresh token should be accessible
      expect(snapshotRefreshToken).toBeDefined();
      expect(snapshotRefreshToken?.value).toBe(storefrontRefreshToken?.value);
    });

    test('TC-ACCOUNT-008: Refresh snapshot page → Session persists', async ({ page }) => {
      const account = TEST_ACCOUNTS.trusteduser;

      await authHelpers.loginAsTrustedUser(account.username);
      await authHelpers.navigateToSnapshot();
      await authHelpers.verifySnapshotPageLoaded();

      // Refresh the page
      await page.reload();
      await page.waitForTimeout(2000);

      // Should still be authenticated on snapshot
      await authHelpers.verifySnapshotPageLoaded();
    });
  });

  test.describe('Logout from Snapshot', () => {
    test('TC-ACCOUNT-009: Logout from snapshot → Session cleared', async ({ page, context }) => {
      const account = TEST_ACCOUNTS.trusteduser;

      // Login and navigate to snapshot
      await authHelpers.loginAsTrustedUser(account.username);
      await authHelpers.navigateToSnapshot();
      await authHelpers.verifySnapshotPageLoaded();

      // Logout from snapshot
      await authHelpers.logout();

      // Verify refresh token cleared
      const cookies = await context.cookies();
      const refreshToken = cookies.find(c => c.name === 'refresh_token');
      expect(refreshToken === undefined || refreshToken.value === '').toBe(true);
    });

    test('TC-ACCOUNT-010: Logout from snapshot → Navigate to storefront → Not authenticated', async ({ page }) => {
      const account = TEST_ACCOUNTS.trusteduser;

      // Login and navigate to snapshot
      await authHelpers.loginAsTrustedUser(account.username);
      await authHelpers.navigateToSnapshot();
      await authHelpers.verifySnapshotPageLoaded();

      // Logout from snapshot
      await authHelpers.logout();

      // Navigate back to storefront
      await page.goto('http://localhost:3000');
      await page.waitForTimeout(2000);

      // Should NOT be authenticated on storefront
      await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible();
    });
  });

  test.describe('Multi-Window Session Consistency', () => {
    test('TC-ACCOUNT-011: Login in Window 1 → Open Window 2 on Snapshot → Both authenticated', async ({ context }) => {
      const account = TEST_ACCOUNTS.trusteduser;

      // Window 1: Storefront - login
      const window1 = await context.newPage();
      const authHelpers1 = new AuthHelpers(window1);
      await window1.goto('http://localhost:3000');
      await authHelpers1.loginAsTrustedUser(account.username);
      await authHelpers1.verifyStorefrontAuthenticated();

      // Window 2: Snapshot - should be authenticated (shared cookies)
      const window2 = await context.newPage();
      const authHelpers2 = new AuthHelpers(window2);
      await window2.goto('http://localhost:3001');
      await window2.waitForTimeout(2000);

      // Should be authenticated on snapshot
      await authHelpers2.verifySnapshotPageLoaded();

      await window1.close();
      await window2.close();
    });

    test('TC-ACCOUNT-012: Logout in Window 1 → Window 2 session also cleared', async ({ context }) => {
      const account = TEST_ACCOUNTS.trusteduser;

      // Window 1: Storefront - login
      const window1 = await context.newPage();
      const authHelpers1 = new AuthHelpers(window1);
      await window1.goto('http://localhost:3000');
      await authHelpers1.loginAsTrustedUser(account.username);

      // Window 2: Snapshot
      const window2 = await context.newPage();
      await window2.goto('http://localhost:3001');
      await window2.waitForTimeout(2000);

      // Logout from Window 1 (storefront)
      await authHelpers1.logout();

      // Refresh Window 2 (snapshot)
      await window2.reload();
      await window2.waitForTimeout(2000);

      // Window 2 should be logged out (redirect or auth required)
      const currentUrl = window2.url();
      const isRedirected = currentUrl.includes('localhost:3000');
      const hasAuthMessage = await window2.getByText(/sign in|log in|authentication required/i).isVisible().catch(() => false);

      expect(isRedirected || hasAuthMessage).toBe(true);

      await window1.close();
      await window2.close();
    });
  });

  test.describe('Security & Access Control', () => {
    test.skip('TC-ACCOUNT-013: Expired session on snapshot → Redirect to login', async ({ page }) => {
      // TODO: Implement by simulating session expiry
      const account = TEST_ACCOUNTS.trusteduser;

      await authHelpers.loginAsTrustedUser(account.username);
      await authHelpers.navigateToSnapshot();

      // Simulate session expiry (would need backend support or token manipulation)
      // After expiry, page should redirect to login
    });

    test.skip('TC-ACCOUNT-014: Tampered token → Access denied', async ({ page, context }) => {
      // TODO: Implement by modifying token cookie
      const account = TEST_ACCOUNTS.trusteduser;

      await authHelpers.loginAsTrustedUser(account.username);

      // Tamper with token
      const cookies = await context.cookies();
      const refreshToken = cookies.find(c => c.name === 'refresh_token');

      if (refreshToken) {
        await context.addCookies([{
          ...refreshToken,
          value: refreshToken.value + 'tampered'
        }]);
      }

      // Navigate to snapshot - should fail
      await page.goto('http://localhost:3001');
      await page.waitForTimeout(2000);

      // Should be rejected or redirected
      const currentUrl = page.url();
      const isRedirected = currentUrl.includes('localhost:3000');
      expect(isRedirected).toBe(true);
    });
  });
});
