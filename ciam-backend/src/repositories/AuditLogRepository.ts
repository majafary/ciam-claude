/**
 * Audit Log Repository
 *
 * Manages audit trail for security and compliance
 *
 * Key Responsibilities:
 * - Log all authentication events
 * - Track security-relevant actions
 * - Support compliance reporting
 * - Immutable audit trail (insert-only)
 */

import { Transaction } from 'kysely';
import { BaseRepository } from './BaseRepository';
import {
  Database,
  AuditLog,
  NewAuditLog,
  AuditCategory,
  AuditAction,
} from '../database/types';

export class AuditLogRepository extends BaseRepository<
  'audit_logs',
  AuditLog,
  NewAuditLog,
  never // Audit logs are immutable - no updates
> {
  constructor() {
    super('audit_logs');
  }

  protected getPrimaryKeyColumn(): string {
    return 'log_id';
  }

  protected getPrimaryKeyValue(record: AuditLog): number {
    return record.log_id;
  }

  /**
   * Override update methods to prevent modification
   * Audit logs are immutable
   */
  override async update(): Promise<never> {
    throw new Error('Audit logs cannot be updated - they are immutable');
  }

  override async updateBy(): Promise<never> {
    throw new Error('Audit logs cannot be updated - they are immutable');
  }

  /**
   * Find logs by context ID
   */
  async findByContextId(
    contextId: string,
    trx?: Transaction<Database> | any
  ): Promise<AuditLog[]> {
    return this.findBy('context_id' as any, contextId, trx);
  }

  /**
   * Find logs by user ID
   */
  async findByUserId(
    userId: string,
    trx?: Transaction<Database> | any
  ): Promise<AuditLog[]> {
    return this.findBy('user_id' as any, userId, trx);
  }

  /**
   * Find logs by category
   */
  async findByCategory(
    category: AuditCategory,
    trx?: Transaction<Database> | any
  ): Promise<AuditLog[]> {
    return this.findBy('category' as any, category, trx);
  }

  /**
   * Find logs by action
   */
  async findByAction(
    action: AuditAction,
    trx?: Transaction<Database> | any
  ): Promise<AuditLog[]> {
    return this.findBy('action' as any, action, trx);
  }

  /**
   * Find logs in date range
   */
  async findByDateRange(
    startDate: Date,
    endDate: Date,
    trx?: Transaction<Database> | any
  ): Promise<AuditLog[]> {
    try {
      this.log('findByDateRange', { startDate, endDate });

      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('created_at', '>=', startDate)
        .where('created_at', '<=', endDate)
        .execute();

      this.log('findByDateRange:result', { count: results.length });
      return results as AuditLog[];
    } catch (error) {
      this.handleError('findByDateRange', error);
    }
  }

  /**
   * Find security events (suspicious activity, account locks, etc.)
   */
  async findSecurityEvents(trx?: Transaction<Database> | any): Promise<AuditLog[]> {
    try {
      this.log('findSecurityEvents');

      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where((eb: any) =>
          eb.or([
            eb('category', '=', 'SECURITY'),
            eb('action', '=', 'SUSPICIOUS_ACTIVITY'),
            eb('action', '=', 'ACCOUNT_LOCKED'),
          ])
        )
        .execute();

      this.log('findSecurityEvents:result', { count: results.length });
      return results as AuditLog[];
    } catch (error) {
      this.handleError('findSecurityEvents', error);
    }
  }

  /**
   * Find failed login attempts for a user
   */
  async findFailedLoginsByUser(
    userId: string,
    trx?: Transaction<Database> | any
  ): Promise<AuditLog[]> {
    try {
      this.log('findFailedLoginsByUser', { userId });

      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('user_id', '=', userId)
        .where('action', '=', 'LOGIN_FAILURE')
        .execute();

      this.log('findFailedLoginsByUser:result', { count: results.length });
      return results as AuditLog[];
    } catch (error) {
      this.handleError('findFailedLoginsByUser', error);
    }
  }

  /**
   * Find recent failed logins (for rate limiting/security)
   */
  async findRecentFailedLogins(
    minutes: number = 15,
    trx?: Transaction<Database> | any
  ): Promise<AuditLog[]> {
    try {
      this.log('findRecentFailedLogins', { minutes });

      const since = new Date(Date.now() - minutes * 60 * 1000);
      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('action', '=', 'LOGIN_FAILURE')
        .where('created_at', '>=', since)
        .execute();

      this.log('findRecentFailedLogins:result', { count: results.length });
      return results as AuditLog[];
    } catch (error) {
      this.handleError('findRecentFailedLogins', error);
    }
  }

  /**
   * Find logs by IP address (security investigation)
   */
  async findByIpAddress(
    ipAddress: string,
    trx?: Transaction<Database> | any
  ): Promise<AuditLog[]> {
    return this.findBy('ip_address' as any, ipAddress, trx);
  }

  /**
   * Delete old audit logs (compliance retention policy)
   */
  async deleteOlderThan(
    days: number,
    trx?: Transaction<Database> | any
  ): Promise<number> {
    try {
      this.log('deleteOlderThan', { days });

      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const results = await this.getDb(trx)
        .deleteFrom(this.tableName)
        .where('created_at', '<', cutoffDate)
        .execute();

      const count = results.length;
      this.log('deleteOlderThan:result', { count });
      return count;
    } catch (error) {
      this.handleError('deleteOlderThan', error);
    }
  }

  /**
   * Get audit log statistics
   */
  async getStats(trx?: Transaction<Database> | any): Promise<{
    total: number;
    byCategory: Record<AuditCategory, number>;
    byAction: Partial<Record<AuditAction, number>>;
    last24Hours: number;
    securityEvents: number;
    failedLogins: number;
  }> {
    try {
      this.log('getStats');

      const all = await this.findAll(trx);
      const last24HoursDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Count by category
      const byCategory: Record<AuditCategory, number> = {
        AUTH: all.filter((l) => l.category === 'AUTH').length,
        MFA: all.filter((l) => l.category === 'MFA').length,
        SESSION: all.filter((l) => l.category === 'SESSION').length,
        TOKEN: all.filter((l) => l.category === 'TOKEN').length,
        DEVICE: all.filter((l) => l.category === 'DEVICE').length,
        ESIGN: all.filter((l) => l.category === 'ESIGN').length,
        SECURITY: all.filter((l) => l.category === 'SECURITY').length,
        ADMIN: all.filter((l) => l.category === 'ADMIN').length,
      };

      // Count common actions
      const byAction: Partial<Record<AuditAction, number>> = {};
      all.forEach((log) => {
        byAction[log.action] = (byAction[log.action] || 0) + 1;
      });

      const stats = {
        total: all.length,
        byCategory,
        byAction,
        last24Hours: all.filter((l) => new Date(l.created_at) >= last24HoursDate).length,
        securityEvents: all.filter((l) =>
          l.category === 'SECURITY' ||
          l.action === 'SUSPICIOUS_ACTIVITY' ||
          l.action === 'ACCOUNT_LOCKED'
        ).length,
        failedLogins: all.filter((l) => l.action === 'LOGIN_FAILURE').length,
      };

      this.log('getStats:result', stats);
      return stats;
    } catch (error) {
      this.handleError('getStats', error);
    }
  }
}
