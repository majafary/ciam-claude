/**
 * Login Time Repository
 * Data access layer for tracking user login timestamps
 * Extracted from auth-simple.ts lines 69, 194-202
 */

export interface LoginTimes {
  lastLogin: Date | null;
  currentLogin: Date;
}

class LoginTimeRepository {
  private loginTimes: Map<string, LoginTimes>; // key: username

  constructor() {
    this.loginTimes = new Map();
  }

  /**
   * Update login timestamps
   * Extracted from auth-simple.ts lines 194-202
   */
  update(username: string): LoginTimes {
    const now = new Date();
    const existing = this.loginTimes.get(username);

    const loginTimes: LoginTimes = {
      lastLogin: existing?.currentLogin || null,
      currentLogin: now
    };

    this.loginTimes.set(username, loginTimes);

    console.log('⏰ [LOGIN TIME] Updated:', {
      username,
      lastLogin: loginTimes.lastLogin,
      currentLogin: loginTimes.currentLogin
    });

    return loginTimes;
  }

  /**
   * Get login times for a user
   */
  findByUsername(username: string): LoginTimes | null {
    return this.loginTimes.get(username) || null;
  }

  /**
   * Get last login time
   */
  getLastLogin(username: string): Date | null {
    const times = this.findByUsername(username);
    return times?.lastLogin || null;
  }

  /**
   * Get current login time
   */
  getCurrentLogin(username: string): Date | null {
    const times = this.findByUsername(username);
    return times?.currentLogin || null;
  }

  /**
   * Check if user has logged in before
   */
  hasLoggedInBefore(username: string): boolean {
    const times = this.findByUsername(username);
    return times?.lastLogin !== null;
  }

  /**
   * Delete login times for a user
   */
  delete(username: string): boolean {
    const deleted = this.loginTimes.delete(username);

    if (deleted) {
      console.log('🗑️ [LOGIN TIME] Deleted:', username);
    }

    return deleted;
  }

  /**
   * Get all login times (for debugging)
   */
  getAll(): Map<string, LoginTimes> {
    return new Map(this.loginTimes);
  }

  /**
   * Clear all login times (for testing)
   */
  clear(): void {
    this.loginTimes.clear();
    console.log('🧹 [LOGIN TIME] Cleared all login times');
  }

  /**
   * Get count of users with login times
   */
  count(): number {
    return this.loginTimes.size;
  }

  /**
   * Get users who logged in after a specific date
   */
  findLoginsAfter(date: Date): Map<string, LoginTimes> {
    const result = new Map<string, LoginTimes>();

    for (const [username, times] of this.loginTimes.entries()) {
      if (times.currentLogin > date) {
        result.set(username, times);
      }
    }

    return result;
  }

  /**
   * Get users who logged in before a specific date
   */
  findLoginsBefore(date: Date): Map<string, LoginTimes> {
    const result = new Map<string, LoginTimes>();

    for (const [username, times] of this.loginTimes.entries()) {
      if (times.currentLogin < date) {
        result.set(username, times);
      }
    }

    return result;
  }
}

// Export singleton instance
export const loginTimeRepository = new LoginTimeRepository();
