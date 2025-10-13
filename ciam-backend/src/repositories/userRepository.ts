/**
 * User Repository
 * Data access layer for user data and scenarios
 */

export interface UserScenario {
  password: string;
  scenario: 'success' | 'mfa_required' | 'trusted' | 'esign_required' | 'locked' | 'mfa_locked' | 'invalid';
  mfaBehavior?: 'normal' | 'push_fail' | 'push_expired';
  esignBehavior?: 'accept' | 'decline' | 'first_login' | 'compliance';
  trustBehavior?: 'normal' | 'expired' | 'corrupt';
  riskLevel?: 'low' | 'high';
  isFirstLogin?: boolean;
  adminReset?: boolean;
  availableMethods?: ('sms' | 'voice' | 'push')[];
}

export interface User {
  id: string;
  username: string;
  email: string;
  given_name: string;
  family_name: string;
  roles: string[];
  isLocked: boolean;
  mfaLocked: boolean;
  scenario: UserScenario;
}

/**
 * User scenarios configuration
 * Extracted from auth-simple.ts lines 245-343
 */
const USER_SCENARIOS: Record<string, UserScenario> = {
  // A1: Trusted Device - Instant Login
  'trusteduser': {
    password: 'password',
    scenario: 'trusted',
    trustBehavior: 'normal'
  },

  // A2: Trusted Device + eSign Required
  'trustedesignuser': {
    password: 'password',
    scenario: 'esign_required',
    trustBehavior: 'normal',
    esignBehavior: 'accept'
  },

  // B1 & B4: MFA Required (OTP or Push) - CONSOLIDATED USER
  'mfauser': {
    password: 'password',
    scenario: 'mfa_required',
    mfaBehavior: 'normal'
  },

  // B2: MFA + eSign Accept
  'mfaesignuser': {
    password: 'password',
    scenario: 'mfa_required',
    esignBehavior: 'accept'
  },

  // B5: Push Rejection
  'pushfail': {
    password: 'password',
    scenario: 'mfa_required',
    mfaBehavior: 'push_fail'
  },

  // B6: Push Timeout
  'pushexpired': {
    password: 'password',
    scenario: 'mfa_required',
    mfaBehavior: 'push_expired'
  },

  // C1: Invalid Credentials (handled by default)
  // C2: Account Locked
  'lockeduser': {
    password: 'password',
    scenario: 'locked'
  },

  // C3: Non-existent user (handled by default)
  // MFA Locked
  'mfalockeduser': {
    password: 'password',
    scenario: 'mfa_locked'
  },

  // D1: Expired Device Trust
  'expiredtrustuser': {
    password: 'password',
    scenario: 'mfa_required',
    trustBehavior: 'expired'
  },

  // E3: Compliance User - eSign required for updated terms
  'complianceuser': {
    password: 'password',
    scenario: 'esign_required',
    esignBehavior: 'compliance'
  },

  // F1: SMS-only MFA User (v3.0.0)
  'otponlyuser': {
    password: 'password',
    scenario: 'mfa_required',
    mfaBehavior: 'normal',
    availableMethods: ['sms']
  },

  // F2: Push-only MFA User
  'pushonlyuser': {
    password: 'password',
    scenario: 'mfa_required',
    mfaBehavior: 'normal',
    availableMethods: ['push']
  }
};

class UserRepository {
  /**
   * Find user scenario by username
   */
  findScenarioByUsername(username: string): UserScenario | null {
    return USER_SCENARIOS[username] || null;
  }

  /**
   * Validate user credentials
   */
  validateCredentials(username: string, password: string): { valid: boolean; scenario: UserScenario | null } {
    const scenario = this.findScenarioByUsername(username);

    if (!scenario) {
      return { valid: false, scenario: null };
    }

    if (scenario.password !== password) {
      return { valid: false, scenario: null };
    }

    return { valid: true, scenario };
  }

  /**
   * Get user by username (converts scenario to User object)
   */
  findByUsername(username: string): User | null {
    const scenario = this.findScenarioByUsername(username);

    if (!scenario) {
      return null;
    }

    return {
      id: `user-${username}`,
      username,
      email: `${username}@example.com`,
      given_name: username.charAt(0).toUpperCase() + username.slice(1),
      family_name: 'User',
      roles: ['user'],
      isLocked: scenario.scenario === 'locked',
      mfaLocked: scenario.scenario === 'mfa_locked',
      scenario
    };
  }

  /**
   * Get user by ID
   */
  findById(userId: string): User | null {
    // Extract username from userId (format: user-{username})
    const username = userId.replace('user-', '');
    return this.findByUsername(username);
  }

  /**
   * Check if account is locked
   */
  isAccountLocked(username: string): boolean {
    const scenario = this.findScenarioByUsername(username);
    return scenario?.scenario === 'locked';
  }

  /**
   * Check if MFA is locked
   */
  isMFALocked(username: string): boolean {
    const scenario = this.findScenarioByUsername(username);
    return scenario?.scenario === 'mfa_locked';
  }

  /**
   * Get available MFA methods for user
   */
  getAvailableMFAMethods(username: string): ('sms' | 'voice' | 'push')[] {
    const scenario = this.findScenarioByUsername(username);
    return scenario?.availableMethods || ['sms', 'push'];
  }

  /**
   * Get all user scenarios (for testing/admin)
   */
  getAllScenarios(): Record<string, UserScenario> {
    return USER_SCENARIOS;
  }
}

// Export singleton instance
export const userRepository = new UserRepository();
