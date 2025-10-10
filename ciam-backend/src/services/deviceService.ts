/**
 * Device Service
 *
 * Handles trusted device management using TrustedDeviceRepository
 * Enables MFA skip functionality for trusted devices
 */

import * as crypto from 'crypto';
import { repositories } from '../repositories';
import { TrustedDevice as DBTrustedDevice } from '../database/types';

/**
 * Service layer type for trusted device info
 */
export interface TrustedDeviceInfo {
  deviceId: number;
  userId: string;
  deviceFingerprint: string; // Not stored, only hash is stored
  deviceName?: string;
  trustedAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  isActive: boolean;
}

/**
 * Hash device fingerprint for secure storage
 */
const hashDeviceFingerprint = (fingerprint: string): string => {
  return crypto.createHash('sha256').update(fingerprint).digest('hex');
};

/**
 * Type mapping: TrustedDevice (DB) → TrustedDeviceInfo (Service)
 */
const toTrustedDeviceInfo = (dbDevice: DBTrustedDevice, fingerprint?: string): TrustedDeviceInfo => {
  return {
    deviceId: dbDevice.device_id,
    userId: dbDevice.user_id,
    deviceFingerprint: fingerprint || dbDevice.device_fingerprint_hash, // Use raw fingerprint if available
    deviceName: dbDevice.device_name || undefined,
    trustedAt: dbDevice.trusted_at,
    lastUsedAt: dbDevice.last_used_at,
    expiresAt: dbDevice.expires_at,
    isActive: dbDevice.is_active,
  };
};

/**
 * Check if device is trusted for user
 */
export const isDeviceTrusted = async (
  userId: string,
  deviceFingerprint: string
): Promise<boolean> => {
  const fingerprintHash = hashDeviceFingerprint(deviceFingerprint);
  const trusted = await repositories.trustedDevice.isTrusted(userId, fingerprintHash);

  if (trusted) {
    // Update last used timestamp
    const device = await repositories.trustedDevice.findByFingerprintHash(userId, fingerprintHash);
    if (device) {
      await repositories.trustedDevice.updateLastUsed(device.device_id);
    }
  }

  return trusted;
};

/**
 * Trust a device for a user
 */
export const trustDevice = async (
  userId: string,
  deviceFingerprint: string,
  deviceName?: string,
  expirationDays: number = 30
): Promise<TrustedDeviceInfo> => {
  const fingerprintHash = hashDeviceFingerprint(deviceFingerprint);

  // Check if device is already trusted
  const existing = await repositories.trustedDevice.findByFingerprintHash(userId, fingerprintHash);

  if (existing) {
    // Update last used and return existing
    await repositories.trustedDevice.updateLastUsed(existing.device_id);
    console.log(`Device already trusted for user ${userId}, updated last used`);
    return toTrustedDeviceInfo(existing, deviceFingerprint);
  }

  // Create new trusted device
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expirationDays * 24 * 60 * 60 * 1000);

  const dbDevice = await repositories.trustedDevice.create({
    user_id: userId,
    device_fingerprint_hash: fingerprintHash,
    device_name: deviceName || null,
    trusted_at: now,
    last_used_at: now,
    expires_at: expiresAt,
    is_active: true,
  });

  console.log(`Trusted device ${dbDevice.device_id} created for user ${userId}`);
  return toTrustedDeviceInfo(dbDevice, deviceFingerprint);
};

/**
 * Get all trusted devices for a user
 */
export const getUserTrustedDevices = async (userId: string): Promise<TrustedDeviceInfo[]> => {
  const dbDevices = await repositories.trustedDevice.findActiveByUserId(userId);
  return dbDevices.map(d => toTrustedDeviceInfo(d));
};

/**
 * Revoke trust for a specific device
 */
export const revokeTrustedDevice = async (deviceId: number): Promise<boolean> => {
  const result = await repositories.trustedDevice.deactivate(deviceId);
  return !!result;
};

/**
 * Revoke all trusted devices for a user (security operation)
 */
export const revokeAllUserDevices = async (userId: string): Promise<number> => {
  const count = await repositories.trustedDevice.deactivateAllForUser(userId);
  console.log(`Revoked ${count} trusted devices for user ${userId}`);
  return count;
};

/**
 * Clean up expired devices
 */
export const cleanupExpiredDevices = async (): Promise<number> => {
  // Find and deactivate expired devices
  const expiredDevices = await repositories.trustedDevice.findExpired();
  let deactivatedCount = 0;

  for (const device of expiredDevices) {
    if (device.is_active) {
      await repositories.trustedDevice.deactivate(device.device_id);
      deactivatedCount++;
    }
  }

  console.log(`Deactivated ${deactivatedCount} expired devices`);

  // Delete expired and inactive devices
  const deletedCount = await repositories.trustedDevice.deleteExpiredAndInactive();
  console.log(`Deleted ${deletedCount} expired and inactive devices`);

  return deactivatedCount;
};

/**
 * Get device statistics
 */
export const getDeviceStats = async (): Promise<{
  totalDevices: number;
  activeDevices: number;
  expiredDevices: number;
  inactiveDevices: number;
  uniqueUsers: number;
}> => {
  const stats = await repositories.trustedDevice.getStats();
  const uniqueUsers = Object.keys(stats.byUser).length;

  return {
    totalDevices: stats.total,
    activeDevices: stats.active,
    expiredDevices: stats.expired,
    inactiveDevices: stats.inactive,
    uniqueUsers,
  };
};

/**
 * Check if device belongs to user
 */
export const isDeviceOwner = async (
  deviceId: number,
  userId: string
): Promise<boolean> => {
  const device = await repositories.trustedDevice.findById(deviceId);
  return device?.user_id === userId;
};

/**
 * Update device name
 */
export const updateDeviceName = async (
  deviceId: number,
  deviceName: string
): Promise<TrustedDeviceInfo | null> => {
  const updated = await repositories.trustedDevice.update(deviceId, {
    device_name: deviceName,
  });

  if (!updated) {
    return null;
  }

  return toTrustedDeviceInfo(updated);
};

/**
 * Get device by ID
 */
export const getDeviceById = async (
  deviceId: number
): Promise<TrustedDeviceInfo | null> => {
  const device = await repositories.trustedDevice.findById(deviceId);

  if (!device) {
    return null;
  }

  return toTrustedDeviceInfo(device);
};
