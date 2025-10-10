/**
 * Auth Context Repository
 *
 * Manages authentication contexts (auth flows)
 * A context represents one complete authentication flow from login to completion
 *
 * Key Responsibilities:
 * - Track authentication flow state
 * - Store app metadata (app_id, app_version)
 * - Store device information (fingerprint, IP, user agent)
 * - Manage context lifecycle (creation, expiration)
 * - Link to user_id after successful authentication
 */

import { Transaction } from 'kysely';
import { BaseRepository } from './BaseRepository';
import {
  Database,
  AuthContext,
  NewAuthContext,
  AuthContextUpdate,
} from '../database/types';

export class AuthContextRepository extends BaseRepository<
  'auth_contexts',
  AuthContext,
  NewAuthContext,
  AuthContextUpdate
> {
  constructor() {
    super('auth_contexts');
  }

  protected getPrimaryKeyColumn(): string {
    return 'context_id';
  }

  protected getPrimaryKeyValue(record: AuthContext): string {
    return record.context_id;
  }

  /**
   * Find context by ID (alias for findById for clarity)
   */
  async findByContextId(
    contextId: string,
    trx?: Transaction<Database> | any
  ): Promise<AuthContext | undefined> {
    return this.findById(contextId, trx);
  }

  /**
   * Find all contexts for a user
   */
  async findByUserId(
    userId: string,
    trx?: Transaction<Database> | any
  ): Promise<AuthContext[]> {
    return this.findBy('user_id' as any, userId, trx);
  }

  /**
   * Find contexts by device fingerprint
   */
  async findByDeviceFingerprint(
    deviceFingerprint: string,
    trx?: Transaction<Database> | any
  ): Promise<AuthContext[]> {
    return this.findBy('device_fingerprint' as any, deviceFingerprint, trx);
  }

  /**
   * Find contexts by app ID
   */
  async findByAppId(
    appId: string,
    trx?: Transaction<Database> | any
  ): Promise<AuthContext[]> {
    return this.findBy('app_id' as any, appId, trx);
  }

  /**
   * Find active (non-expired) contexts
   */
  async findActiveContexts(trx?: Transaction<Database> | any): Promise<AuthContext[]> {
    try {
      this.log('findActiveContexts');

      const now = new Date();
      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('expires_at', '>', now)
        .execute();

      this.log('findActiveContexts:result', { count: results.length });
      return results as AuthContext[];
    } catch (error) {
      this.handleError('findActiveContexts', error);
    }
  }

  /**
   * Find expired contexts
   */
  async findExpiredContexts(trx?: Transaction<Database> | any): Promise<AuthContext[]> {
    try {
      this.log('findExpiredContexts');

      const now = new Date();
      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('expires_at', '<=', now)
        .execute();

      this.log('findExpiredContexts:result', { count: results.length });
      return results as AuthContext[];
    } catch (error) {
      this.handleError('findExpiredContexts', error);
    }
  }

  /**
   * Update user ID for a context (after successful authentication)
   */
  async assignUserId(
    contextId: string,
    userId: string,
    trx?: Transaction<Database> | any
  ): Promise<AuthContext | undefined> {
    try {
      this.log('assignUserId', { contextId, userId });

      const result = await this.update(
        contextId,
        {
          user_id: userId,
          updated_at: new Date(),
        } as AuthContextUpdate,
        trx
      );

      this.log('assignUserId:result', { updated: !!result });
      return result;
    } catch (error) {
      this.handleError('assignUserId', error);
    }
  }

  /**
   * Update device fingerprint for a context
   */
  async updateDeviceFingerprint(
    contextId: string,
    deviceFingerprint: string,
    trx?: Transaction<Database> | any
  ): Promise<AuthContext | undefined> {
    try {
      this.log('updateDeviceFingerprint', { contextId });

      const result = await this.update(
        contextId,
        {
          device_fingerprint: deviceFingerprint,
          updated_at: new Date(),
        } as AuthContextUpdate,
        trx
      );

      this.log('updateDeviceFingerprint:result', { updated: !!result });
      return result;
    } catch (error) {
      this.handleError('updateDeviceFingerprint', error);
    }
  }

  /**
   * Touch context (update updated_at timestamp)
   */
  async touch(
    contextId: string,
    trx?: Transaction<Database> | any
  ): Promise<AuthContext | undefined> {
    try {
      this.log('touch', { contextId });

      const result = await this.update(
        contextId,
        {
          updated_at: new Date(),
        } as AuthContextUpdate,
        trx
      );

      this.log('touch:result', { updated: !!result });
      return result;
    } catch (error) {
      this.handleError('touch', error);
    }
  }

  /**
   * Delete expired contexts (cleanup operation)
   */
  async deleteExpired(trx?: Transaction<Database> | any): Promise<number> {
    try {
      this.log('deleteExpired');

      const now = new Date();
      const results = await this.getDb(trx)
        .deleteFrom(this.tableName)
        .where('expires_at', '<=', now)
        .execute();

      const count = results.length;
      this.log('deleteExpired:result', { count });
      return count;
    } catch (error) {
      this.handleError('deleteExpired', error);
    }
  }

  /**
   * Get context statistics
   */
  async getStats(trx?: Transaction<Database> | any): Promise<{
    total: number;
    active: number;
    expired: number;
    withUser: number;
    withoutUser: number;
  }> {
    try {
      this.log('getStats');

      const all = await this.findAll(trx);
      const now = new Date();

      const stats = {
        total: all.length,
        active: all.filter((c) => new Date(c.expires_at) > now).length,
        expired: all.filter((c) => new Date(c.expires_at) <= now).length,
        withUser: all.filter((c) => c.user_id !== null).length,
        withoutUser: all.filter((c) => c.user_id === null).length,
      };

      this.log('getStats:result', stats);
      return stats;
    } catch (error) {
      this.handleError('getStats', error);
    }
  }
}
