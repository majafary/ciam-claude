/**
 * Test Account Configuration
 *
 * These accounts map to the USER_SCENARIOS defined in:
 * ciam-backend/src/controllers/auth-simple.ts (lines 245-342)
 */

export interface TestAccount {
  username: string;
  password: string;
  scenario: string;
  mfaBehavior?: 'normal' | 'push_fail' | 'push_expired';
  esignBehavior?: 'accept' | 'decline' | 'first_login' | 'compliance';
  trustBehavior?: 'normal' | 'expired' | 'corrupt';
  availableMethods?: ('sms' | 'voice' | 'push')[];
  description: string;
}

export const TEST_ACCOUNTS: Record<string, TestAccount> = {
  // A1: Trusted Device - Instant Login
  trusteduser: {
    username: 'trusteduser',
    password: 'password',
    scenario: 'trusted',
    trustBehavior: 'normal',
    description: 'Pre-trusted device, instant login without MFA',
  },

  // A2: Trusted Device + eSign Required
  trustedesignuser: {
    username: 'trustedesignuser',
    password: 'password',
    scenario: 'esign_required',
    trustBehavior: 'normal',
    esignBehavior: 'accept',
    description: 'Trusted device but requires eSign acceptance',
  },

  // B1 & B4: MFA Required (OTP or Push)
  mfauser: {
    username: 'mfauser',
    password: 'password',
    scenario: 'mfa_required',
    mfaBehavior: 'normal',
    availableMethods: ['sms', 'push'],
    description: 'Standard MFA user with SMS and Push options',
  },

  // B2: MFA + eSign Accept
  mfaesignuser: {
    username: 'mfaesignuser',
    password: 'password',
    scenario: 'mfa_required',
    esignBehavior: 'accept',
    availableMethods: ['sms', 'push'],
    description: 'MFA required, then eSign after MFA success',
  },

  // B5: Push Rejection
  pushfail: {
    username: 'pushfail',
    password: 'password',
    scenario: 'mfa_required',
    mfaBehavior: 'push_fail',
    availableMethods: ['sms', 'push'],
    description: 'Push notification auto-rejects after 7 seconds',
  },

  // B6: Push Timeout
  pushexpired: {
    username: 'pushexpired',
    password: 'password',
    scenario: 'mfa_required',
    mfaBehavior: 'push_expired',
    availableMethods: ['sms', 'push'],
    description: 'Push notification never approves, expires after 10 seconds',
  },

  // C2: Account Locked
  lockeduser: {
    username: 'lockeduser',
    password: 'password',
    scenario: 'locked',
    description: 'Account is locked, returns error CIAM_E01_01_002',
  },

  // MFA Locked
  mfalockeduser: {
    username: 'mfalockeduser',
    password: 'password',
    scenario: 'mfa_locked',
    description: 'MFA locked due to too many failed attempts, returns CIAM_E01_01_005',
  },

  // D1: Expired Device Trust
  expiredtrustuser: {
    username: 'expiredtrustuser',
    password: 'password',
    scenario: 'mfa_required',
    trustBehavior: 'expired',
    availableMethods: ['sms', 'push'],
    description: 'Device trust expired, requires MFA again',
  },

  // E3: Compliance User
  complianceuser: {
    username: 'complianceuser',
    password: 'password',
    scenario: 'esign_required',
    esignBehavior: 'compliance',
    description: 'eSign required for compliance/policy update',
  },

  // F1: SMS-only MFA User
  otponlyuser: {
    username: 'otponlyuser',
    password: 'password',
    scenario: 'mfa_required',
    mfaBehavior: 'normal',
    availableMethods: ['sms'],
    description: 'Only SMS/Voice MFA available, no push option',
  },

  // F2: Push-only MFA User
  pushonlyuser: {
    username: 'pushonlyuser',
    password: 'password',
    scenario: 'mfa_required',
    mfaBehavior: 'normal',
    availableMethods: ['push'],
    description: 'Only Push notification MFA available',
  },

  // C1: Invalid Credentials
  invaliduser: {
    username: 'invaliduser',
    password: 'wrongpassword',
    scenario: 'invalid',
    description: 'Invalid credentials, returns error CIAM_E01_01_001',
  },
};

export const OTP_CODE = {
  VALID: '1234',
  INVALID: '0000',
};

export const APP_INFO = {
  APP_ID: 'storefront-web-app',
  APP_VERSION: '1.0.0',
};
