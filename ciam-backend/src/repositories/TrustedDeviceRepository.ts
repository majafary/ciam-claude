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
  DeviceStatus,
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

  protected getPrimaryKeyValue(record: TrustedDevice): string {
    return record.device_id;
  }

  /**
   * Find device by fingerprint hash for a user (by cupid)
   */
  async findByFingerprintHash(
    cupid: string,
    fingerprintHash: string,
    trx?: Transaction<Database> | any
  ): Promise<TrustedDevice | undefined> {
    try {
      this.log('findByFingerprintHash', { cupid });

      const result = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('cupid', '=', cupid)
        .where('device_fingerprint_hash', '=', fingerprintHash)
        .executeTakeFirst();

      this.log('findByFingerprintHash:result', { found: !!result });
      return result as TrustedDevice | undefined;
    } catch (error) {
      this.handleError('findByFingerprintHash', error);
    }
  }

  /**
   * Find all trusted devices for a user (by cupid)
   */
  async findByCupid(
    cupid: string,
    trx?: Transaction<Database> | any
  ): Promise<TrustedDevice[]> {
    return this.findBy('cupid' as any, cupid, trx);
  }

  /**
   * Find all trusted devices for a customer (by guid)
   */
  async findByGuid(
    guid: string,
    trx?: Transaction<Database> | any
  ): Promise<TrustedDevice[]> {
    return this.findBy('guid' as any, guid, trx);
  }

  /**
   * Find devices by cupid and guid (combined lookup)
   */
  async findByCupidAndGuid(
    cupid: string,
    guid: string,
    trx?: Transaction<Database> | any
  ): Promise<TrustedDevice[]> {
    try {
      this.log('findByCupidAndGuid', { cupid, guid });

      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('cupid', '=', cupid)
        .where('guid', '=', guid)
        .execute();

      this.log('findByCupidAndGuid:result', { count: results.length });
      return results as TrustedDevice[];
    } catch (error) {
      this.handleError('findByCupidAndGuid', error);
    }
  }

  /**
   * Find active (non-expired) trusted devices for a user (by cupid)
   */
  async findActiveByCupid(
    cupid: string,
    trx?: Transaction<Database> | any
  ): Promise<TrustedDevice[]> {
    try {
      this.log('findActiveByCupid', { cupid });

      const now = new Date();
      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('cupid', '=', cupid)
        .where('status', '=', 'ACTIVE')
        .where('expires_at', '>', now)
        .execute();

      this.log('findActiveByCupid:result', { count: results.length });
      return results as TrustedDevice[];
    } catch (error) {
      this.handleError('findActiveByCupid', error);
    }
  }

  /**
   * Check if device is trusted (active and not expired)
   */
  async isTrusted(
    cupid: string,
    fingerprintHash: string,
    trx?: Transaction<Database> | any
  ): Promise<boolean> {
    try {
      this.log('isTrusted', { cupid });

      const device = await this.findByFingerprintHash(cupid, fingerprintHash, trx);
      if (!device) {
        return false;
      }

      const now = new Date();
      const trusted = device.status === 'ACTIVE' && new Date(device.expires_at) > now;

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
    deviceId: string,
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
   * Revoke a trusted device
   */
  async revoke(
    deviceId: string,
    trx?: Transaction<Database> | any
  ): Promise<TrustedDevice | undefined> {
    try {
      this.log('revoke', { deviceId });

      const result = await this.update(
        deviceId,
        {
          status: 'REVOKED',
          revoked_at: new Date(),
        } as TrustedDeviceUpdate,
        trx
      );

      this.log('revoke:result', { updated: !!result });
      return result;
    } catch (error) {
      this.handleError('revoke', error);
    }
  }

  /**
   * Expire a trusted device
   */
  async expire(
    deviceId: string,
    trx?: Transaction<Database> | any
  ): Promise<TrustedDevice | undefined> {
    try {
      this.log('expire', { deviceId });

      const result = await this.update(
        deviceId,
        {
          status: 'EXPIRED',
        } as TrustedDeviceUpdate,
        trx
      );

      this.log('expire:result', { updated: !!result });
      return result;
    } catch (error) {
      this.handleError('expire', error);
    }
  }

  /**
   * Revoke all devices for a user (security operation)
   */
  async revokeAllForCupid(
    cupid: string,
    trx?: Transaction<Database> | any
  ): Promise<number> {
    try {
      this.log('revokeAllForCupid', { cupid });

      const results = await this.getDb(trx)
        .updateTable(this.tableName)
        .set({
          status: 'REVOKED',
          revoked_at: new Date(),
        } as any)
        .where('cupid', '=', cupid)
        .where('status', '=', 'ACTIVE')
        .execute();

      const count = results.length;
      this.log('revokeAllForCupid:result', { count });
      return count;
    } catch (error) {
      this.handleError('revokeAllForCupid', error);
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
   * Delete expired and revoked devices (cleanup operation)
   */
  async deleteExpiredAndRevoked(trx?: Transaction<Database> | any): Promise<number> {
    try {
      this.log('deleteExpiredAndRevoked');

      const results = await this.getDb(trx)
        .deleteFrom(this.tableName)
        .where((eb: any) =>
          eb.or([
            eb('status', '=', 'EXPIRED'),
            eb('status', '=', 'REVOKED'),
          ])
        )
        .execute();

      const count = results.length;
      this.log('deleteExpiredAndRevoked:result', { count });
      return count;
    } catch (error) {
      this.handleError('deleteExpiredAndRevoked', error);
    }
  }

  /**
   * Get device statistics
   */
  async getStats(trx?: Transaction<Database> | any): Promise<{
    total: number;
    active: number;
    expired: number;
    revoked: number;
    byStatus: Record<DeviceStatus, number>;
    byCupid: Record<string, number>;
    byGuid: Record<string, number>;
  }> {
    try {
      this.log('getStats');

      const all = await this.findAll(trx);

      const byCupid: Record<string, number> = {};
      const byGuid: Record<string, number> = {};

      all.forEach((device) => {
        byCupid[device.cupid] = (byCupid[device.cupid] || 0) + 1;
        byGuid[device.guid] = (byGuid[device.guid] || 0) + 1;
      });

      const stats = {
        total: all.length,
        active: all.filter((d) => d.status === 'ACTIVE').length,
        expired: all.filter((d) => d.status === 'EXPIRED').length,
        revoked: all.filter((d) => d.status === 'REVOKED').length,
        byStatus: {
          ACTIVE: all.filter((d) => d.status === 'ACTIVE').length,
          EXPIRED: all.filter((d) => d.status === 'EXPIRED').length,
          REVOKED: all.filter((d) => d.status === 'REVOKED').length,
        },
        byCupid,
        byGuid,
      };

      this.log('getStats:result', stats);
      return stats;
    } catch (error) {
      this.handleError('getStats', error);
    }
  }
}
