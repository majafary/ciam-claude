/**
 * Trusted Device Repository
 *
 * Manages trusted device records for MFA skip functionality
 *
 * Key Responsibilities:
 * - Track trusted devices by fingerprint hash
 * - Allow MFA skip for trusted devices
 * - Manage device expiration
 * - Track device usage (last_used_at)
 */

import { Transaction } from 'kysely';
import { BaseRepository } from './BaseRepository';
import {
  Database,
  TrustedDevice,
  NewTrustedDevice,
  TrustedDeviceUpdate,
} from '../database/types';

export class TrustedDeviceRepository extends BaseRepository<
  'trusted_devices',
  TrustedDevice,
  NewTrustedDevice,
  TrustedDeviceUpdate
> {
  constructor() {
    super('trusted_devices');
  }

  protected getPrimaryKeyColumn(): string {
    return 'device_id';
  }

  protected getPrimaryKeyValue(record: TrustedDevice): number {
    return record.device_id;
  }

  /**
   * Find device by fingerprint hash for a user
   */
  async findByFingerprintHash(
    userId: string,
    fingerprintHash: string,
    trx?: Transaction<Database> | any
  ): Promise<TrustedDevice | undefined> {
    try {
      this.log('findByFingerprintHash', { userId });

      const result = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('user_id', '=', userId)
        .where('device_fingerprint_hash', '=', fingerprintHash)
        .executeTakeFirst();

      this.log('findByFingerprintHash:result', { found: !!result });
      return result as TrustedDevice | undefined;
    } catch (error) {
      this.handleError('findByFingerprintHash', error);
    }
  }

  /**
   * Find all trusted devices for a user
   */
  async findByUserId(
    userId: string,
    trx?: Transaction<Database> | any
  ): Promise<TrustedDevice[]> {
    return this.findBy('user_id' as any, userId, trx);
  }

  /**
   * Find active (non-expired) trusted devices for a user
   */
  async findActiveByUserId(
    userId: string,
    trx?: Transaction<Database> | any
  ): Promise<TrustedDevice[]> {
    try {
      this.log('findActiveByUserId', { userId });

      const now = new Date();
      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('user_id', '=', userId)
        .where('is_active', '=', true)
        .where('expires_at', '>', now)
        .execute();

      this.log('findActiveByUserId:result', { count: results.length });
      return results as TrustedDevice[];
    } catch (error) {
      this.handleError('findActiveByUserId', error);
    }
  }

  /**
   * Check if device is trusted (active and not expired)
   */
  async isTrusted(
    userId: string,
    fingerprintHash: string,
    trx?: Transaction<Database> | any
  ): Promise<boolean> {
    try {
      this.log('isTrusted', { userId });

      const device = await this.findByFingerprintHash(userId, fingerprintHash, trx);
      if (!device) {
        return false;
      }

      const now = new Date();
      const trusted = device.is_active && new Date(device.expires_at) > now;

      this.log('isTrusted:result', { trusted });
      return trusted;
    } catch (error) {
      this.handleError('isTrusted', error);
    }
  }

  /**
   * Update last used timestamp
   */
  async updateLastUsed(
    deviceId: number,
    trx?: Transaction<Database> | any
  ): Promise<TrustedDevice | undefined> {
    try {
      this.log('updateLastUsed', { deviceId });

      const result = await this.update(
        deviceId,
        {
          last_used_at: new Date(),
        } as TrustedDeviceUpdate,
        trx
      );

      this.log('updateLastUsed:result', { updated: !!result });
      return result;
    } catch (error) {
      this.handleError('updateLastUsed', error);
    }
  }

  /**
   * Deactivate a trusted device
   */
  async deactivate(
    deviceId: number,
    trx?: Transaction<Database> | any
  ): Promise<TrustedDevice | undefined> {
    try {
      this.log('deactivate', { deviceId });

      const result = await this.update(
        deviceId,
        {
          is_active: false,
        } as TrustedDeviceUpdate,
        trx
      );

      this.log('deactivate:result', { updated: !!result });
      return result;
    } catch (error) {
      this.handleError('deactivate', error);
    }
  }

  /**
   * Deactivate all devices for a user (security operation)
   */
  async deactivateAllForUser(
    userId: string,
    trx?: Transaction<Database> | any
  ): Promise<number> {
    try {
      this.log('deactivateAllForUser', { userId });

      const results = await this.getDb(trx)
        .updateTable(this.tableName)
        .set({
          is_active: false,
        } as any)
        .where('user_id', '=', userId)
        .execute();

      const count = results.length;
      this.log('deactivateAllForUser:result', { count });
      return count;
    } catch (error) {
      this.handleError('deactivateAllForUser', error);
    }
  }

  /**
   * Find expired devices
   */
  async findExpired(trx?: Transaction<Database> | any): Promise<TrustedDevice[]> {
    try {
      this.log('findExpired');

      const now = new Date();
      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('expires_at', '<=', now)
        .execute();

      this.log('findExpired:result', { count: results.length });
      return results as TrustedDevice[];
    } catch (error) {
      this.handleError('findExpired', error);
    }
  }

  /**
   * Delete expired and inactive devices (cleanup operation)
   */
  async deleteExpiredAndInactive(trx?: Transaction<Database> | any): Promise<number> {
    try {
      this.log('deleteExpiredAndInactive');

      const now = new Date();
      const results = await this.getDb(trx)
        .deleteFrom(this.tableName)
        .where((eb: any) =>
          eb.or([
            eb('expires_at', '<=', now),
            eb('is_active', '=', false),
          ])
        )
        .execute();

      const count = results.length;
      this.log('deleteExpiredAndInactive:result', { count });
      return count;
    } catch (error) {
      this.handleError('deleteExpiredAndInactive', error);
    }
  }

  /**
   * Get device statistics
   */
  async getStats(trx?: Transaction<Database> | any): Promise<{
    total: number;
    active: number;
    expired: number;
    inactive: number;
    byUser: Record<string, number>;
  }> {
    try {
      this.log('getStats');

      const all = await this.findAll(trx);
      const now = new Date();

      const byUser: Record<string, number> = {};
      all.forEach((device) => {
        byUser[device.user_id] = (byUser[device.user_id] || 0) + 1;
      });

      const stats = {
        total: all.length,
        active: all.filter((d) => d.is_active && new Date(d.expires_at) > now).length,
        expired: all.filter((d) => new Date(d.expires_at) <= now).length,
        inactive: all.filter((d) => !d.is_active).length,
        byUser,
      };

      this.log('getStats:result', stats);
      return stats;
    } catch (error) {
      this.handleError('getStats', error);
    }
  }
}
