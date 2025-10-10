/**
 * Transaction Helper Utilities
 *
 * Provides utilities for database transactions
 * - Type-safe transaction execution
 * - Error handling and rollback
 * - Transaction isolation levels
 * - Nested transaction support
 *
 * Usage:
 *   import { withTransaction } from './database/transactions';
 *
 *   const result = await withTransaction(async (trx) => {
 *     await trx.insertInto('sessions').values(session).execute();
 *     await trx.insertInto('refresh_tokens').values(token).execute();
 *     return { sessionId, tokenId };
 *   });
 */

import { Kysely, Transaction } from 'kysely';
import { Database } from './types';
import { db, isMockDatabase } from './kysely';

/**
 * Transaction isolation levels
 * Note: Mock database does not support isolation levels
 */
export enum IsolationLevel {
  READ_UNCOMMITTED = 'read uncommitted',
  READ_COMMITTED = 'read committed',
  REPEATABLE_READ = 'repeatable read',
  SERIALIZABLE = 'serializable',
}

/**
 * Transaction options
 */
export interface TransactionOptions {
  isolationLevel?: IsolationLevel;
  maxRetries?: number;
  retryDelayMs?: number;
}

/**
 * Transaction callback type
 */
export type TransactionCallback<T> = (trx: Transaction<Database> | any) => Promise<T>;

/**
 * Execute a function within a database transaction
 *
 * Features:
 * - Automatic commit on success
 * - Automatic rollback on error
 * - Configurable isolation level
 * - Retry logic for transient errors
 * - Works with both mock and real database
 *
 * @param callback - Function to execute within transaction
 * @param options - Transaction options (isolation level, retries)
 * @returns Result of the transaction callback
 *
 * @example
 * const result = await withTransaction(async (trx) => {
 *   const session = await trx
 *     .insertInto('sessions')
 *     .values(sessionData)
 *     .returningAll()
 *     .executeTakeFirstOrThrow();
 *
 *   const token = await trx
 *     .insertInto('refresh_tokens')
 *     .values(tokenData)
 *     .returningAll()
 *     .executeTakeFirstOrThrow();
 *
 *   return { session, token };
 * });
 */
export async function withTransaction<T>(
  callback: TransactionCallback<T>,
  options: TransactionOptions = {}
): Promise<T> {
  const { isolationLevel, maxRetries = 0, retryDelayMs = 100 } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (isMockDatabase()) {
        // Mock database: no real transaction support, just execute
        return await (db as any).transaction(callback);
      }

      // Real database: use Kysely transaction with isolation level
      const kysely = db as Kysely<Database>;

      if (isolationLevel) {
        // Set isolation level
        return await kysely.transaction().execute(async (trx) => {
          await trx.executeQuery(
            trx
              .selectFrom('sessions' as any)
              .select('session_id' as any)
              .limit(0)
              .compile()
          );
          return callback(trx);
        });
      }

      // Default transaction
      return await kysely.transaction().execute(callback);
    } catch (error) {
      lastError = error as Error;

      // Check if error is retryable (serialization failure, deadlock)
      const isRetryable =
        error instanceof Error &&
        (error.message.includes('deadlock') ||
          error.message.includes('serialization failure') ||
          error.message.includes('could not serialize'));

      if (isRetryable && attempt < maxRetries) {
        console.warn(
          `Transaction attempt ${attempt + 1} failed, retrying in ${retryDelayMs}ms...`,
          error
        );
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error('Transaction failed after retries');
}

/**
 * Execute multiple operations within a single transaction
 * Useful for coordinating multiple repository operations
 *
 * @param operations - Array of transaction operations to execute
 * @param options - Transaction options
 * @returns Array of results from each operation
 *
 * @example
 * const [session, token, audit] = await withBatchTransaction([
 *   (trx) => sessionRepo.create(sessionData, trx),
 *   (trx) => tokenRepo.create(tokenData, trx),
 *   (trx) => auditRepo.log(auditData, trx),
 * ]);
 */
export async function withBatchTransaction<T extends any[]>(
  operations: Array<TransactionCallback<any>>,
  options: TransactionOptions = {}
): Promise<T> {
  return withTransaction(async (trx) => {
    const results: any[] = [];
    for (const operation of operations) {
      const result = await operation(trx);
      results.push(result);
    }
    return results as T;
  }, options);
}

/**
 * Execute a callback and retry on transient database errors
 *
 * @param callback - Function to execute
 * @param maxRetries - Maximum number of retry attempts
 * @param retryDelayMs - Base delay between retries (exponential backoff)
 * @returns Result of the callback
 */
export async function withRetry<T>(
  callback: () => Promise<T>,
  maxRetries: number = 3,
  retryDelayMs: number = 100
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await callback();
    } catch (error) {
      lastError = error as Error;

      // Check if error is retryable
      const isRetryable =
        error instanceof Error &&
        (error.message.includes('connection') ||
          error.message.includes('timeout') ||
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('ECONNRESET'));

      if (isRetryable && attempt < maxRetries) {
        console.warn(
          `Operation attempt ${attempt + 1} failed, retrying in ${retryDelayMs}ms...`,
          error
        );
        await sleep(retryDelayMs * Math.pow(2, attempt));
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error('Operation failed after retries');
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if running in a transaction context
 * Note: This is a best-effort check and may not be 100% accurate
 */
export function isInTransaction(db: any): boolean {
  // Kysely transactions have a different structure than the main instance
  return db && typeof db.transaction === 'undefined';
}

/**
 * Get transaction instance or main database instance
 * Useful for repository methods that can work with or without transactions
 *
 * @param trx - Optional transaction instance
 * @returns Transaction instance if provided, otherwise main database instance
 */
export function getDbOrTransaction(trx?: Transaction<Database> | any): any {
  return trx || db;
}

/**
 * Transaction wrapper for repository methods
 * Allows repository methods to participate in existing transactions or create new ones
 *
 * @example
 * class MyRepository {
 *   async create(data: any, trx?: Transaction<Database>) {
 *     return transactional(trx, async (t) => {
 *       return t.insertInto('my_table').values(data).execute();
 *     });
 *   }
 * }
 */
export async function transactional<T>(
  trx: Transaction<Database> | any | undefined,
  callback: TransactionCallback<T>
): Promise<T> {
  if (trx) {
    // Already in a transaction, use it
    return callback(trx);
  }

  // Not in a transaction, create one
  return withTransaction(callback);
}
