/**
 * Base Repository
 *
 * Abstract base class providing common CRUD operations for all repositories
 * Implements standard patterns for database access with type safety
 *
 * Features:
 * - Generic CRUD operations (Create, Read, Update, Delete)
 * - Transaction support
 * - Error handling
 * - Logging
 * - Type-safe operations
 */

import { Transaction } from 'kysely';
import { Database, TableName, Selectable, Insertable, Updateable } from '../database/types';
import { db } from '../database/kysely';
import { getDbOrTransaction } from '../database/transactions';

/**
 * Base repository providing common database operations
 *
 * @template TN - Table name from Database schema
 * @template Row - Row type (Selectable<Table>)
 * @template NewRow - Insert type (Insertable<Table>)
 * @template RowUpdate - Update type (Updateable<Table>)
 */
export abstract class BaseRepository<
  TN extends TableName,
  Row extends Selectable<Database[TN]>,
  NewRow extends Insertable<Database[TN]>,
  RowUpdate extends Updateable<Database[TN]>
> {
  protected readonly tableName: TN;

  constructor(tableName: TN) {
    this.tableName = tableName;
  }

  /**
   * Get database instance or transaction
   */
  protected getDb(trx?: Transaction<Database> | any): any {
    return getDbOrTransaction(trx);
  }

  /**
   * Log repository operations (can be overridden by subclasses)
   */
  protected log(operation: string, data?: any): void {
    if (process.env.LOG_QUERIES === 'true') {
      console.log(`[${this.tableName}] ${operation}`, data || '');
    }
  }

  /**
   * Handle repository errors (can be overridden by subclasses)
   */
  protected handleError(operation: string, error: unknown): never {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${this.tableName}] ${operation} failed:`, errorMessage);
    throw error;
  }

  /**
   * Create a new record
   *
   * @param data - Data to insert
   * @param trx - Optional transaction
   * @returns Created record
   */
  async create(data: NewRow, trx?: Transaction<Database> | any): Promise<Row> {
    try {
      this.log('create', { data });

      const result = await this.getDb(trx)
        .insertInto(this.tableName)
        .values(data)
        .returningAll()
        .executeTakeFirstOrThrow();

      this.log('create:success', { id: this.getPrimaryKeyValue(result) });
      return result as Row;
    } catch (error) {
      this.handleError('create', error);
    }
  }

  /**
   * Create multiple records in a single operation
   *
   * @param dataArray - Array of data to insert
   * @param trx - Optional transaction
   * @returns Array of created records
   */
  async createMany(data: NewRow[], trx?: Transaction<Database> | any): Promise<Row[]> {
    try {
      this.log('createMany', { count: data.length });

      const results = await this.getDb(trx)
        .insertInto(this.tableName)
        .values(data)
        .returningAll()
        .execute();

      this.log('createMany:success', { count: results.length });
      return results as Row[];
    } catch (error) {
      this.handleError('createMany', error);
    }
  }

  /**
   * Find a record by primary key
   *
   * @param id - Primary key value
   * @param trx - Optional transaction
   * @returns Record or undefined
   */
  async findById(id: any, trx?: Transaction<Database> | any): Promise<Row | undefined> {
    try {
      this.log('findById', { id });

      const primaryKey = this.getPrimaryKeyColumn();
      const result = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where(primaryKey as any, '=', id)
        .executeTakeFirst();

      this.log('findById:result', { found: !!result });
      return result as Row | undefined;
    } catch (error) {
      this.handleError('findById', error);
    }
  }

  /**
   * Find all records matching a condition
   *
   * @param column - Column name
   * @param value - Value to match
   * @param trx - Optional transaction
   * @returns Array of matching records
   */
  async findBy(column: keyof Row, value: any, trx?: Transaction<Database> | any): Promise<Row[]> {
    try {
      this.log('findBy', { column, value });

      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where(column as any, '=', value)
        .execute();

      this.log('findBy:result', { count: results.length });
      return results as Row[];
    } catch (error) {
      this.handleError('findBy', error);
    }
  }

  /**
   * Find first record matching a condition
   *
   * @param column - Column name
   * @param value - Value to match
   * @param trx - Optional transaction
   * @returns First matching record or undefined
   */
  async findOneBy(
    column: keyof Row,
    value: any,
    trx?: Transaction<Database> | any
  ): Promise<Row | undefined> {
    try {
      this.log('findOneBy', { column, value });

      const result = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where(column as any, '=', value)
        .executeTakeFirst();

      this.log('findOneBy:result', { found: !!result });
      return result as Row | undefined;
    } catch (error) {
      this.handleError('findOneBy', error);
    }
  }

  /**
   * Find all records
   *
   * @param trx - Optional transaction
   * @returns Array of all records
   */
  async findAll(trx?: Transaction<Database> | any): Promise<Row[]> {
    try {
      this.log('findAll');

      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .execute();

      this.log('findAll:result', { count: results.length });
      return results as Row[];
    } catch (error) {
      this.handleError('findAll', error);
    }
  }

  /**
   * Update a record by primary key
   *
   * @param id - Primary key value
   * @param updates - Updates to apply
   * @param trx - Optional transaction
   * @returns Updated record or undefined
   */
  async update(
    id: any,
    updates: RowUpdate,
    trx?: Transaction<Database> | any
  ): Promise<Row | undefined> {
    try {
      this.log('update', { id, updates });

      const primaryKey = this.getPrimaryKeyColumn();
      const result = await this.getDb(trx)
        .updateTable(this.tableName)
        .set(updates as any)
        .where(primaryKey as any, '=', id)
        .returningAll()
        .executeTakeFirst();

      this.log('update:result', { updated: !!result });
      return result as Row | undefined;
    } catch (error) {
      this.handleError('update', error);
    }
  }

  /**
   * Update all records matching a condition
   *
   * @param column - Column name
   * @param value - Value to match
   * @param updates - Updates to apply
   * @param trx - Optional transaction
   * @returns Number of updated records
   */
  async updateBy(
    column: keyof Row,
    value: any,
    updates: RowUpdate,
    trx?: Transaction<Database> | any
  ): Promise<number> {
    try {
      this.log('updateBy', { column, value, updates });

      const results = await this.getDb(trx)
        .updateTable(this.tableName)
        .set(updates as any)
        .where(column as any, '=', value)
        .execute();

      const count = results.length;
      this.log('updateBy:result', { count });
      return count;
    } catch (error) {
      this.handleError('updateBy', error);
    }
  }

  /**
   * Delete a record by primary key
   *
   * @param id - Primary key value
   * @param trx - Optional transaction
   * @returns Deleted record or undefined
   */
  async delete(id: any, trx?: Transaction<Database> | any): Promise<Row | undefined> {
    try {
      this.log('delete', { id });

      const primaryKey = this.getPrimaryKeyColumn();
      const result = await this.getDb(trx)
        .deleteFrom(this.tableName)
        .where(primaryKey as any, '=', id)
        .returningAll()
        .executeTakeFirst();

      this.log('delete:result', { deleted: !!result });
      return result as Row | undefined;
    } catch (error) {
      this.handleError('delete', error);
    }
  }

  /**
   * Delete all records matching a condition
   *
   * @param column - Column name
   * @param value - Value to match
   * @param trx - Optional transaction
   * @returns Number of deleted records
   */
  async deleteBy(
    column: keyof Row,
    value: any,
    trx?: Transaction<Database> | any
  ): Promise<number> {
    try {
      this.log('deleteBy', { column, value });

      const results = await this.getDb(trx)
        .deleteFrom(this.tableName)
        .where(column as any, '=', value)
        .execute();

      const count = results.length;
      this.log('deleteBy:result', { count });
      return count;
    } catch (error) {
      this.handleError('deleteBy', error);
    }
  }

  /**
   * Count total records
   *
   * @param trx - Optional transaction
   * @returns Total count
   */
  async count(trx?: Transaction<Database> | any): Promise<number> {
    try {
      this.log('count');

      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .execute();

      const count = results.length;
      this.log('count:result', { count });
      return count;
    } catch (error) {
      this.handleError('count', error);
    }
  }

  /**
   * Count records matching a condition
   *
   * @param column - Column name
   * @param value - Value to match
   * @param trx - Optional transaction
   * @returns Count of matching records
   */
  async countBy(column: keyof Row, value: any, trx?: Transaction<Database> | any): Promise<number> {
    try {
      this.log('countBy', { column, value });

      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where(column as any, '=', value)
        .execute();

      const count = results.length;
      this.log('countBy:result', { count });
      return count;
    } catch (error) {
      this.handleError('countBy', error);
    }
  }

  /**
   * Check if a record exists by primary key
   *
   * @param id - Primary key value
   * @param trx - Optional transaction
   * @returns True if exists
   */
  async exists(id: any, trx?: Transaction<Database> | any): Promise<boolean> {
    try {
      this.log('exists', { id });

      const record = await this.findById(id, trx);
      const exists = !!record;

      this.log('exists:result', { exists });
      return exists;
    } catch (error) {
      this.handleError('exists', error);
    }
  }

  /**
   * Get primary key column name for this table
   * Subclasses should override this if needed
   */
  protected abstract getPrimaryKeyColumn(): string;

  /**
   * Get primary key value from a record
   * Subclasses should override this if needed
   */
  protected abstract getPrimaryKeyValue(record: Row): any;
}
