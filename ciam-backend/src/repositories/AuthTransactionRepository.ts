/**
 * Auth Transaction Repository
 *
 * Manages authentication sub-transactions within auth contexts
 * Handles MFA, eSign, and Device Binding flows
 *
 * CRITICAL BUSINESS LOGIC:
 * - ONE context_id per auth flow (stays same throughout)
 * - EACH action creates NEW transaction_id
 * - Must invalidate pending transactions before creating new ones
 * - Metadata stores transaction-specific data (OTP, push numbers, etc.)
 *
 * Key Responsibilities:
 * - Track MFA challenges (SMS, Voice, Push)
 * - Track eSign acceptance/decline
 * - Track device binding
 * - Manage transaction lifecycle (PENDING → APPROVED/REJECTED/EXPIRED)
 * - Store transaction metadata (OTP codes, push numbers, etc.)
 */

import { Transaction } from 'kysely';
import { BaseRepository } from './BaseRepository';
import {
  Database,
  AuthTransaction,
  NewAuthTransaction,
  AuthTransactionUpdate,
  TransactionPhase,
  TransactionStatus,
} from '../database/types';

export class AuthTransactionRepository extends BaseRepository<
  'auth_transactions',
  AuthTransaction,
  NewAuthTransaction,
  AuthTransactionUpdate
> {
  constructor() {
    super('auth_transactions');
  }

  protected getPrimaryKeyColumn(): string {
    return 'transaction_id';
  }

  protected getPrimaryKeyValue(record: AuthTransaction): string {
    return record.transaction_id;
  }

  /**
   * Find transaction by ID (alias for findById for clarity)
   */
  async findByTransactionId(
    transactionId: string,
    trx?: Transaction<Database> | any
  ): Promise<AuthTransaction | undefined> {
    return this.findById(transactionId, trx);
  }

  /**
   * Find all transactions for a context
   */
  async findByContextId(
    contextId: string,
    trx?: Transaction<Database> | any
  ): Promise<AuthTransaction[]> {
    return this.findBy('context_id' as any, contextId, trx);
  }

  /**
   * Find transactions by phase (MFA, ESIGN, DEVICE_BIND)
   */
  async findByPhase(
    phase: TransactionPhase,
    trx?: Transaction<Database> | any
  ): Promise<AuthTransaction[]> {
    return this.findBy('phase' as any, phase, trx);
  }

  /**
   * Find transactions by status (PENDING, APPROVED, REJECTED, EXPIRED)
   */
  async findByStatus(
    status: TransactionStatus,
    trx?: Transaction<Database> | any
  ): Promise<AuthTransaction[]> {
    return this.findBy('transaction_status' as any, status, trx);
  }

  /**
   * Find pending transactions for a context
   * CRITICAL: Used to check for existing pending transactions before creating new ones
   */
  async findPendingByContext(
    contextId: string,
    trx?: Transaction<Database> | any
  ): Promise<AuthTransaction[]> {
    try {
      this.log('findPendingByContext', { contextId });

      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('context_id', '=', contextId)
        .where('transaction_status', '=', 'PENDING')
        .execute();

      this.log('findPendingByContext:result', { count: results.length });
      return results as AuthTransaction[];
    } catch (error) {
      this.handleError('findPendingByContext', error);
    }
  }

  /**
   * CRITICAL: Expire all pending transactions for a context
   *
   * This is the key invalidation logic from the original implementation
   * MUST be called before creating a new MFA transaction
   *
   * @param contextId - Context ID
   * @param trx - Optional transaction
   * @returns Number of expired transactions
   */
  async expirePendingByContext(
    contextId: string,
    trx?: Transaction<Database> | any
  ): Promise<number> {
    try {
      this.log('expirePendingByContext', { contextId });

      const results = await this.getDb(trx)
        .updateTable(this.tableName)
        .set({
          transaction_status: 'EXPIRED',
          updated_at: new Date(),
        } as any)
        .where('context_id', '=', contextId)
        .where('transaction_status', '=', 'PENDING')
        .execute();

      const count = results.length;
      this.log('expirePendingByContext:result', { count });
      return count;
    } catch (error) {
      this.handleError('expirePendingByContext', error);
    }
  }

  /**
   * Update transaction status
   */
  async updateStatus(
    transactionId: string,
    status: TransactionStatus,
    trx?: Transaction<Database> | any
  ): Promise<AuthTransaction | undefined> {
    try {
      this.log('updateStatus', { transactionId, status });

      const result = await this.update(
        transactionId,
        {
          transaction_status: status,
          updated_at: new Date(),
        } as AuthTransactionUpdate,
        trx
      );

      this.log('updateStatus:result', { updated: !!result });
      return result;
    } catch (error) {
      this.handleError('updateStatus', error);
    }
  }

  /**
   * Update transaction metadata
   * Used to store OTP codes, push numbers, eSign document IDs, etc.
   */
  async updateMetadata(
    transactionId: string,
    metadata: Record<string, unknown>,
    trx?: Transaction<Database> | any
  ): Promise<AuthTransaction | undefined> {
    try {
      this.log('updateMetadata', { transactionId });

      const result = await this.update(
        transactionId,
        {
          metadata: metadata as any,
          updated_at: new Date(),
        } as AuthTransactionUpdate,
        trx
      );

      this.log('updateMetadata:result', { updated: !!result });
      return result;
    } catch (error) {
      this.handleError('updateMetadata', error);
    }
  }

  /**
   * Merge metadata with existing metadata
   */
  async mergeMetadata(
    transactionId: string,
    newMetadata: Record<string, unknown>,
    trx?: Transaction<Database> | any
  ): Promise<AuthTransaction | undefined> {
    try {
      this.log('mergeMetadata', { transactionId });

      const existing = await this.findById(transactionId, trx);
      if (!existing) {
        throw new Error(`Transaction ${transactionId} not found`);
      }

      const merged = {
        ...(existing.metadata || {}),
        ...newMetadata,
      };

      const result = await this.updateMetadata(transactionId, merged, trx);

      this.log('mergeMetadata:result', { updated: !!result });
      return result;
    } catch (error) {
      this.handleError('mergeMetadata', error);
    }
  }

  /**
   * Get metadata value
   */
  async getMetadataValue(
    transactionId: string,
    key: string,
    trx?: Transaction<Database> | any
  ): Promise<unknown> {
    try {
      this.log('getMetadataValue', { transactionId, key });

      const transaction = await this.findById(transactionId, trx);
      if (!transaction) {
        return undefined;
      }

      const value = transaction.metadata ? (transaction.metadata as any)[key] : undefined;
      this.log('getMetadataValue:result', { found: value !== undefined });
      return value;
    } catch (error) {
      this.handleError('getMetadataValue', error);
    }
  }

  /**
   * Approve a transaction (MFA approval, eSign acceptance)
   */
  async approve(
    transactionId: string,
    trx?: Transaction<Database> | any
  ): Promise<AuthTransaction | undefined> {
    return this.updateStatus(transactionId, 'APPROVED', trx);
  }

  /**
   * Reject a transaction (Push rejection, eSign decline)
   */
  async reject(
    transactionId: string,
    trx?: Transaction<Database> | any
  ): Promise<AuthTransaction | undefined> {
    return this.updateStatus(transactionId, 'REJECTED', trx);
  }

  /**
   * Complete a transaction (final successful state)
   */
  async complete(
    transactionId: string,
    trx?: Transaction<Database> | any
  ): Promise<AuthTransaction | undefined> {
    return this.updateStatus(transactionId, 'COMPLETED', trx);
  }

  /**
   * Expire a transaction
   */
  async expire(
    transactionId: string,
    trx?: Transaction<Database> | any
  ): Promise<AuthTransaction | undefined> {
    return this.updateStatus(transactionId, 'EXPIRED', trx);
  }

  /**
   * Find expired transactions (cleanup helper)
   */
  async findExpired(trx?: Transaction<Database> | any): Promise<AuthTransaction[]> {
    try {
      this.log('findExpired');

      const now = new Date();
      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('expires_at', '<=', now)
        .where('transaction_status', '=', 'PENDING')
        .execute();

      this.log('findExpired:result', { count: results.length });
      return results as AuthTransaction[];
    } catch (error) {
      this.handleError('findExpired', error);
    }
  }

  /**
   * Expire old pending transactions (cleanup operation)
   */
  async expireOldPending(trx?: Transaction<Database> | any): Promise<number> {
    try {
      this.log('expireOldPending');

      const now = new Date();
      const results = await this.getDb(trx)
        .updateTable(this.tableName)
        .set({
          transaction_status: 'EXPIRED',
          updated_at: new Date(),
        } as any)
        .where('expires_at', '<=', now)
        .where('transaction_status', '=', 'PENDING')
        .execute();

      const count = results.length;
      this.log('expireOldPending:result', { count });
      return count;
    } catch (error) {
      this.handleError('expireOldPending', error);
    }
  }

  /**
   * Find MFA transactions for a context
   */
  async findMFAByContext(
    contextId: string,
    trx?: Transaction<Database> | any
  ): Promise<AuthTransaction[]> {
    try {
      this.log('findMFAByContext', { contextId });

      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('context_id', '=', contextId)
        .where('phase', '=', 'MFA')
        .execute();

      this.log('findMFAByContext:result', { count: results.length });
      return results as AuthTransaction[];
    } catch (error) {
      this.handleError('findMFAByContext', error);
    }
  }

  /**
   * Find eSign transactions for a context
   */
  async findESignByContext(
    contextId: string,
    trx?: Transaction<Database> | any
  ): Promise<AuthTransaction[]> {
    try {
      this.log('findESignByContext', { contextId });

      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('context_id', '=', contextId)
        .where('phase', '=', 'ESIGN')
        .execute();

      this.log('findESignByContext:result', { count: results.length });
      return results as AuthTransaction[];
    } catch (error) {
      this.handleError('findESignByContext', error);
    }
  }

  /**
   * Find device bind transactions for a context
   */
  async findDeviceBindByContext(
    contextId: string,
    trx?: Transaction<Database> | any
  ): Promise<AuthTransaction[]> {
    try {
      this.log('findDeviceBindByContext', { contextId });

      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('context_id', '=', contextId)
        .where('phase', '=', 'DEVICE_BIND')
        .execute();

      this.log('findDeviceBindByContext:result', { count: results.length });
      return results as AuthTransaction[];
    } catch (error) {
      this.handleError('findDeviceBindByContext', error);
    }
  }

  /**
   * Get transaction statistics
   */
  async getStats(trx?: Transaction<Database> | any): Promise<{
    total: number;
    byPhase: Record<TransactionPhase, number>;
    byStatus: Record<TransactionStatus, number>;
    pending: number;
    expired: number;
  }> {
    try {
      this.log('getStats');

      const all = await this.findAll(trx);

      const stats = {
        total: all.length,
        byPhase: {
          MFA: all.filter((t) => t.phase === 'MFA').length,
          ESIGN: all.filter((t) => t.phase === 'ESIGN').length,
          DEVICE_BIND: all.filter((t) => t.phase === 'DEVICE_BIND').length,
        },
        byStatus: {
          PENDING: all.filter((t) => t.transaction_status === 'PENDING').length,
          APPROVED: all.filter((t) => t.transaction_status === 'APPROVED').length,
          REJECTED: all.filter((t) => t.transaction_status === 'REJECTED').length,
          EXPIRED: all.filter((t) => t.transaction_status === 'EXPIRED').length,
          COMPLETED: all.filter((t) => t.transaction_status === 'COMPLETED').length,
          CONSUMED: all.filter((t) => t.transaction_status === 'CONSUMED').length,
        },
        pending: all.filter((t) => t.transaction_status === 'PENDING').length,
        expired: all.filter((t) => t.transaction_status === 'EXPIRED').length,
      };

      this.log('getStats:result', stats);
      return stats;
    } catch (error) {
      this.handleError('getStats', error);
    }
  }

  /**
   * Mark transaction as consumed (token used, cannot be reused)
   */
  async consume(
    transactionId: string,
    trx?: Transaction<Database> | any
  ): Promise<AuthTransaction | undefined> {
    return this.updateStatus(transactionId, 'CONSUMED', trx);
  }

  /**
   * Get next sequence number for a context
   */
  async getNextSequenceNumber(
    contextId: string,
    trx?: Transaction<Database> | any
  ): Promise<number> {
    try {
      this.log('getNextSequenceNumber', { contextId });

      const transactions = await this.findByContextId(contextId, trx);
      const maxSequence = transactions.reduce((max, t) => Math.max(max, t.sequence_number), 0);
      const nextSequence = maxSequence + 1;

      this.log('getNextSequenceNumber:result', { nextSequence });
      return nextSequence;
    } catch (error) {
      this.handleError('getNextSequenceNumber', error);
    }
  }

  /**
   * Find transactions by parent transaction ID (retry chains)
   */
  async findByParentId(
    parentTransactionId: string,
    trx?: Transaction<Database> | any
  ): Promise<AuthTransaction[]> {
    try {
      this.log('findByParentId', { parentTransactionId });

      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('parent_transaction_id', '=', parentTransactionId)
        .execute();

      this.log('findByParentId:result', { count: results.length });
      return results as AuthTransaction[];
    } catch (error) {
      this.handleError('findByParentId', error);
    }
  }

  /**
   * Get transaction chain (parent and all children)
   */
  async getTransactionChain(
    transactionId: string,
    trx?: Transaction<Database> | any
  ): Promise<AuthTransaction[]> {
    try {
      this.log('getTransactionChain', { transactionId });

      const chain: AuthTransaction[] = [];
      let current = await this.findById(transactionId, trx);

      if (!current) {
        return chain;
      }

      // Walk up to root parent
      while (current && current.parent_transaction_id) {
        chain.unshift(current);
        current = await this.findById(current.parent_transaction_id, trx);
      }

      if (current) {
        chain.unshift(current);
      }

      // Walk down to all children
      const rootId = chain[0]?.transaction_id || transactionId;
      const allChildren = await this.findAllChildren(rootId, trx);
      chain.push(...allChildren.filter(t => !chain.find(c => c.transaction_id === t.transaction_id)));

      this.log('getTransactionChain:result', { count: chain.length });
      return chain;
    } catch (error) {
      this.handleError('getTransactionChain', error);
    }
  }

  /**
   * Recursively find all children of a transaction
   */
  private async findAllChildren(
    transactionId: string,
    trx?: Transaction<Database> | any
  ): Promise<AuthTransaction[]> {
    const directChildren = await this.findByParentId(transactionId, trx);
    const allChildren: AuthTransaction[] = [...directChildren];

    for (const child of directChildren) {
      const grandchildren = await this.findAllChildren(child.transaction_id, trx);
      allChildren.push(...grandchildren);
    }

    return allChildren;
  }
}
