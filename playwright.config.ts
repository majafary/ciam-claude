import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration for CIAM Integration Suite
 *
 * Test Coverage:
 * - Storefront Web App (localhost:3000)
 * - Account Servicing App (localhost:3001)
 * - CIAM Backend API (localhost:8080)
 */

export default defineConfig({
  testDir: './e2e-tests',

  // Maximum time one test can run
  timeout: 60 * 1000,

  // Expect timeout for assertions
  expect: {
    timeout: 10 * 1000,
  },

  // Run tests in files in parallel
  fullyParallel: false, // Sequential execution to avoid race conditions with shared backend state

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : 1, // Single worker to avoid state conflicts

  // Reporter to use
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'playwright-report/results.json' }],
    ['list'],
  ],

  // Shared settings for all the projects below
  use: {
    // Base URL for page.goto() calls
    baseURL: 'http://localhost:3000',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',

    // Timeout for each action (click, fill, etc.)
    actionTimeout: 10 * 1000,

    // Timeout for navigation
    navigationTimeout: 30 * 1000,
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // Uncomment for cross-browser testing after baseline established
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // Run your local dev server before starting the tests
  // NOTE: Tests assume services are already running via npm run dev:all
  // webServer: [
  //   {
  //     command: 'npm run dev:backend',
  //     url: 'http://localhost:8080/health',
  //     reuseExistingServer: !process.env.CI,
  //     timeout: 120 * 1000,
  //   },
  //   {
  //     command: 'npm run dev:ciam-ui && npm run dev:storefront',
  //     url: 'http://localhost:3000',
  //     reuseExistingServer: !process.env.CI,
  //   },
  //   {
  //     command: 'npm run dev:account',
  //     url: 'http://localhost:3001',
  //     reuseExistingServer: !process.env.CI,
  //   },
  // ],
});
