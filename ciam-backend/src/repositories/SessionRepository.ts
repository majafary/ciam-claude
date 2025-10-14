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
  SessionStatus,
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
   * Find all sessions for a user (by cupid)
   */
  async findByCupid(
    cupid: string,
    trx?: Transaction<Database> | any
  ): Promise<Session[]> {
    return this.findBy('cupid' as any, cupid, trx);
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
   * Find active sessions for a user (by cupid)
   */
  async findActiveByCupid(
    cupid: string,
    trx?: Transaction<Database> | any
  ): Promise<Session[]> {
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
      return results as Session[];
    } catch (error) {
      this.handleError('findActiveByCupid', error);
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
        .where('status', '=', 'ACTIVE')
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
   * Expire a session (time-based expiration)
   */
  async expire(
    sessionId: string,
    trx?: Transaction<Database> | any
  ): Promise<Session | undefined> {
    try {
      this.log('expire', { sessionId });

      const result = await this.update(
        sessionId,
        {
          status: 'EXPIRED',
        } as SessionUpdate,
        trx
      );

      this.log('expire:result', { updated: !!result });
      return result;
    } catch (error) {
      this.handleError('expire', error);
    }
  }

  /**
   * Revoke a session (admin or security operation)
   */
  async revoke(
    sessionId: string,
    revokedBy: string,
    reason: string,
    trx?: Transaction<Database> | any
  ): Promise<Session | undefined> {
    try {
      this.log('revoke', { sessionId, revokedBy });

      const result = await this.update(
        sessionId,
        {
          status: 'REVOKED',
          revoked_at: new Date(),
          revoked_by: revokedBy,
          revocation_reason: reason,
        } as SessionUpdate,
        trx
      );

      this.log('revoke:result', { updated: !!result });
      return result;
    } catch (error) {
      this.handleError('revoke', error);
    }
  }

  /**
   * Logout a session (user-initiated)
   */
  async logout(
    sessionId: string,
    trx?: Transaction<Database> | any
  ): Promise<Session | undefined> {
    try {
      this.log('logout', { sessionId });

      const result = await this.update(
        sessionId,
        {
          status: 'LOGGED_OUT',
        } as SessionUpdate,
        trx
      );

      this.log('logout:result', { updated: !!result });
      return result;
    } catch (error) {
      this.handleError('logout', error);
    }
  }

  /**
   * Revoke all sessions for a user (security operation)
   */
  async revokeAllForCupid(
    cupid: string,
    revokedBy: string,
    reason: string,
    trx?: Transaction<Database> | any
  ): Promise<number> {
    try {
      this.log('revokeAllForCupid', { cupid, revokedBy });

      const results = await this.getDb(trx)
        .updateTable(this.tableName)
        .set({
          status: 'REVOKED',
          revoked_at: new Date(),
          revoked_by: revokedBy,
          revocation_reason: reason,
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
   * Expire old sessions (cleanup operation)
   */
  async expireOldSessions(trx?: Transaction<Database> | any): Promise<number> {
    try {
      this.log('expireOldSessions');

      const now = new Date();
      const results = await this.getDb(trx)
        .updateTable(this.tableName)
        .set({
          status: 'EXPIRED',
        } as any)
        .where('expires_at', '<=', now)
        .where('status', '=', 'ACTIVE')
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
        .where('status', '=', 'EXPIRED')
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
    revoked: number;
    loggedOut: number;
    byStatus: Record<SessionStatus, number>;
    byCupid: Record<string, number>;
  }> {
    try {
      this.log('getStats');

      const all = await this.findAll(trx);

      const byCupid: Record<string, number> = {};
      all.forEach((session) => {
        byCupid[session.cupid] = (byCupid[session.cupid] || 0) + 1;
      });

      const stats = {
        total: all.length,
        active: all.filter((s) => s.status === 'ACTIVE').length,
        expired: all.filter((s) => s.status === 'EXPIRED').length,
        revoked: all.filter((s) => s.status === 'REVOKED').length,
        loggedOut: all.filter((s) => s.status === 'LOGGED_OUT').length,
        byStatus: {
          ACTIVE: all.filter((s) => s.status === 'ACTIVE').length,
          EXPIRED: all.filter((s) => s.status === 'EXPIRED').length,
          REVOKED: all.filter((s) => s.status === 'REVOKED').length,
          LOGGED_OUT: all.filter((s) => s.status === 'LOGGED_OUT').length,
        },
        byCupid,
      };

      this.log('getStats:result', stats);
      return stats;
    } catch (error) {
      this.handleError('getStats', error);
    }
  }
}
