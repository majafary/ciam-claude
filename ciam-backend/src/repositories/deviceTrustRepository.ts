/**
 * Device Trust Repository
 * Data access layer for device trust management
 * Extracted from auth-simple.ts lines 27-35, 65, 122-180
 */

export interface DeviceTrust {
  deviceFingerprint: string;
  username: string;
  trustedAt: number;
  lastUsed: number;
  expiresAt: number; // Trust expiry timestamp
  trustDurationDays: number; // Default 30 days
}

class DeviceTrustRepository {
  private trusts: Map<string, DeviceTrust>;

  constructor() {
    this.trusts = new Map();
  }

  /**
   * Convert DRS action token to device fingerprint
   * Simulates Transmit Security DRS
   * Extracted from auth-simple.ts lines 122-129
   */
  convertActionTokenToFingerprint(actionToken: string): string {
    const hash = actionToken.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    return `device_${Math.abs(hash)}_${Date.now().toString(36)}`;
  }

  /**
   * Trust a device with expiry
   * Default: 3650 days (10 years) = effectively non-expiring for practical purposes
   * Extracted from auth-simple.ts lines 160-180
   */
  trust(
    deviceFingerprint: string,
    username: string,
    trustDurationDays: number = 3650
  ): DeviceTrust {
    const now = Date.now();
    const expiresAt = now + (trustDurationDays * 24 * 60 * 60 * 1000); // Convert days to ms

    const trust: DeviceTrust = {
      deviceFingerprint,
      username,
      trustedAt: now,
      lastUsed: now,
      expiresAt,
      trustDurationDays
    };

    this.trusts.set(deviceFingerprint, trust);

    console.log('🔐 [DEVICE TRUST] Trusted:', {
      deviceFingerprint,
      username,
      expiresAt: new Date(expiresAt),
      trustDurationDays
    });

    return trust;
  }

  /**
   * Check if device is trusted and not expired
   * Extracted from auth-simple.ts lines 132-146
   */
  isTrusted(deviceFingerprint: string, username: string): boolean {
    const trust = this.trusts.get(deviceFingerprint);

    if (!trust || trust.username !== username) {
      return false;
    }

    // Check if trust has expired
    const now = Date.now();
    if (now > trust.expiresAt) {
      console.log('🔒 [DEVICE TRUST] Expired:', {
        deviceFingerprint,
        username,
        expiredAt: new Date(trust.expiresAt)
      });
      return false;
    }

    return true;
  }

  /**
   * Check if device trust is expired (for specific error message)
   * Extracted from auth-simple.ts lines 148-157
   */
  isExpired(deviceFingerprint: string, username: string): boolean {
    const trust = this.trusts.get(deviceFingerprint);

    if (!trust || trust.username !== username) {
      return false;
    }

    const now = Date.now();
    return now > trust.expiresAt;
  }

  /**
   * Update last used timestamp
   */
  updateLastUsed(deviceFingerprint: string): boolean {
    const trust = this.trusts.get(deviceFingerprint);

    if (!trust) {
      return false;
    }

    trust.lastUsed = Date.now();
    this.trusts.set(deviceFingerprint, trust);

    console.log('🔄 [DEVICE TRUST] Updated last used:', {
      deviceFingerprint,
      lastUsed: new Date(trust.lastUsed)
    });

    return true;
  }

  /**
   * Find trust by device fingerprint
   */
  findByFingerprint(deviceFingerprint: string): DeviceTrust | null {
    return this.trusts.get(deviceFingerprint) || null;
  }

  /**
   * Find all trusts for a user
   */
  findByUsername(username: string): DeviceTrust[] {
    const userTrusts: DeviceTrust[] = [];

    for (const trust of this.trusts.values()) {
      if (trust.username === username) {
        userTrusts.push(trust);
      }
    }

    return userTrusts;
  }

  /**
   * Revoke device trust
   */
  revoke(deviceFingerprint: string): boolean {
    const deleted = this.trusts.delete(deviceFingerprint);

    if (deleted) {
      console.log('🗑️ [DEVICE TRUST] Revoked:', deviceFingerprint);
    }

    return deleted;
  }

  /**
   * Revoke all trusts for a user
   */
  revokeAllForUser(username: string): number {
    let revoked = 0;

    for (const [fingerprint, trust] of this.trusts.entries()) {
      if (trust.username === username) {
        this.trusts.delete(fingerprint);
        revoked++;
      }
    }

    if (revoked > 0) {
      console.log(`🗑️ [DEVICE TRUST] Revoked ${revoked} devices for user:`, username);
    }

    return revoked;
  }

  /**
   * Check if device exists
   */
  exists(deviceFingerprint: string): boolean {
    return this.trusts.has(deviceFingerprint);
  }

  /**
   * Get all trusts (for debugging)
   */
  getAll(): DeviceTrust[] {
    return Array.from(this.trusts.values());
  }

  /**
   * Clear all trusts (for testing)
   */
  clear(): void {
    this.trusts.clear();
    console.log('🧹 [DEVICE TRUST] Cleared all trusts');
  }

  /**
   * Clean up expired trusts
   */
  cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [fingerprint, trust] of this.trusts.entries()) {
      if (now > trust.expiresAt) {
        this.trusts.delete(fingerprint);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 [DEVICE TRUST] Cleaned up ${cleaned} expired trusts`);
    }

    return cleaned;
  }
}

// Export singleton instance
export const deviceTrustRepository = new DeviceTrustRepository();

// Set up periodic cleanup (every hour)
setInterval(() => {
  deviceTrustRepository.cleanupExpired();
}, 60 * 60 * 1000);
