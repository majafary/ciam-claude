/**
 * Session Repository
 *
 * Manages user sessions
 * Sessions track active user authentication state
 *
 * Key Responsibilities:
 * - Create and track user sessions
 * - Multi-device support (one user, multiple sessions)
 * - Session lifecycle management (active, expired)
 * - Activity tracking (last_seen_at)
 * - Link sessions to auth contexts
 */

import { Transaction } from 'kysely';
import { BaseRepository } from './BaseRepository';
import {
  Database,
  Session,
  NewSession,
  SessionUpdate,
} from '../database/types';

export class SessionRepository extends BaseRepository<
  'sessions',
  Session,
  NewSession,
  SessionUpdate
> {
  constructor() {
    super('sessions');
  }

  protected getPrimaryKeyColumn(): string {
    return 'session_id';
  }

  protected getPrimaryKeyValue(record: Session): string {
    return record.session_id;
  }

  /**
   * Find session by ID (alias for findById for clarity)
   */
  async findBySessionId(
    sessionId: string,
    trx?: Transaction<Database> | any
  ): Promise<Session | undefined> {
    return this.findById(sessionId, trx);
  }

  /**
   * Find all sessions for a user
   */
  async findByUserId(
    userId: string,
    trx?: Transaction<Database> | any
  ): Promise<Session[]> {
    return this.findBy('user_id' as any, userId, trx);
  }

  /**
   * Find sessions by context ID
   */
  async findByContextId(
    contextId: string,
    trx?: Transaction<Database> | any
  ): Promise<Session[]> {
    return this.findBy('context_id' as any, contextId, trx);
  }

  /**
   * Find sessions by device ID
   */
  async findByDeviceId(
    deviceId: string,
    trx?: Transaction<Database> | any
  ): Promise<Session[]> {
    return this.findBy('device_id' as any, deviceId, trx);
  }

  /**
   * Find active sessions for a user
   */
  async findActiveByUserId(
    userId: string,
    trx?: Transaction<Database> | any
  ): Promise<Session[]> {
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
      return results as Session[];
    } catch (error) {
      this.handleError('findActiveByUserId', error);
    }
  }

  /**
   * Find all active sessions
   */
  async findAllActive(trx?: Transaction<Database> | any): Promise<Session[]> {
    try {
      this.log('findAllActive');

      const now = new Date();
      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('is_active', '=', true)
        .where('expires_at', '>', now)
        .execute();

      this.log('findAllActive:result', { count: results.length });
      return results as Session[];
    } catch (error) {
      this.handleError('findAllActive', error);
    }
  }

  /**
   * Find expired sessions
   */
  async findExpired(trx?: Transaction<Database> | any): Promise<Session[]> {
    try {
      this.log('findExpired');

      const now = new Date();
      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('expires_at', '<=', now)
        .execute();

      this.log('findExpired:result', { count: results.length });
      return results as Session[];
    } catch (error) {
      this.handleError('findExpired', error);
    }
  }

  /**
   * Update last seen timestamp
   */
  async updateLastSeen(
    sessionId: string,
    trx?: Transaction<Database> | any
  ): Promise<Session | undefined> {
    try {
      this.log('updateLastSeen', { sessionId });

      const result = await this.update(
        sessionId,
        {
          last_seen_at: new Date(),
        } as SessionUpdate,
        trx
      );

      this.log('updateLastSeen:result', { updated: !!result });
      return result;
    } catch (error) {
      this.handleError('updateLastSeen', error);
    }
  }

  /**
   * Deactivate a session
   */
  async deactivate(
    sessionId: string,
    trx?: Transaction<Database> | any
  ): Promise<Session | undefined> {
    try {
      this.log('deactivate', { sessionId });

      const result = await this.update(
        sessionId,
        {
          is_active: false,
        } as SessionUpdate,
        trx
      );

      this.log('deactivate:result', { updated: !!result });
      return result;
    } catch (error) {
      this.handleError('deactivate', error);
    }
  }

  /**
   * Deactivate all sessions for a user
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
   * Expire old sessions (cleanup operation)
   */
  async expireOldSessions(trx?: Transaction<Database> | any): Promise<number> {
    try {
      this.log('expireOldSessions');

      const now = new Date();
      const results = await this.getDb(trx)
        .updateTable(this.tableName)
        .set({
          is_active: false,
        } as any)
        .where('expires_at', '<=', now)
        .where('is_active', '=', true)
        .execute();

      const count = results.length;
      this.log('expireOldSessions:result', { count });
      return count;
    } catch (error) {
      this.handleError('expireOldSessions', error);
    }
  }

  /**
   * Delete expired sessions (cleanup operation)
   */
  async deleteExpired(trx?: Transaction<Database> | any): Promise<number> {
    try {
      this.log('deleteExpired');

      const now = new Date();
      const results = await this.getDb(trx)
        .deleteFrom(this.tableName)
        .where('expires_at', '<=', now)
        .where('is_active', '=', false)
        .execute();

      const count = results.length;
      this.log('deleteExpired:result', { count });
      return count;
    } catch (error) {
      this.handleError('deleteExpired', error);
    }
  }

  /**
   * Get session statistics
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
      all.forEach((session) => {
        byUser[session.user_id] = (byUser[session.user_id] || 0) + 1;
      });

      const stats = {
        total: all.length,
        active: all.filter((s) => s.is_active && new Date(s.expires_at) > now).length,
        expired: all.filter((s) => new Date(s.expires_at) <= now).length,
        inactive: all.filter((s) => !s.is_active).length,
        byUser,
      };

      this.log('getStats:result', stats);
      return stats;
    } catch (error) {
      this.handleError('getStats', error);
    }
  }
}
