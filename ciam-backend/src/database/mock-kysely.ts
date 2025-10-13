/**
 * Mock Kysely Adapter
 *
 * In-memory database implementation that mimics Kysely's API
 * Used when USE_MOCK_DB feature flag is enabled
 *
 * Features:
 * - In-memory storage with Map-based tables
 * - Query builder API matching Kysely
 * - Support for basic CRUD operations
 * - Transaction simulation (no actual rollback)
 * - Auto-incrementing IDs for SERIAL columns
 * - Type-safe operations
 *
 * IMPORTANT: This is a simplified mock for development/testing
 * It does NOT implement full SQL semantics or ACID guarantees
 */

import {
  Database,
  TableName,
  AuthContext,
  AuthTransaction,
  Session,
  Token,
  TrustedDevice,
  DrsEvaluation,
  AuditLog,
} from './types';

// ============================================================================
// MOCK DATABASE STORAGE
// ============================================================================

/**
 * In-memory storage for all database tables
 * Each table is a Map with primary key as the key
 */
export class MockDatabase {
  // String-keyed tables
  auth_contexts: Map<string, AuthContext> = new Map();
  auth_transactions: Map<string, AuthTransaction> = new Map();
  sessions: Map<string, Session> = new Map();

  // Auto-increment ID tables
  tokens: Map<number, Token> = new Map();
  trusted_devices: Map<number, TrustedDevice> = new Map();
  drs_evaluations: Map<number, DrsEvaluation> = new Map();
  audit_logs: Map<number, AuditLog> = new Map();

  // Auto-increment counters
  private tokenIdCounter = 1;
  private trustedDeviceIdCounter = 1;
  private drsEvaluationIdCounter = 1;
  private auditLogIdCounter = 1;

  getNextTokenId(): number {
    return this.tokenIdCounter++;
  }

  getNextTrustedDeviceId(): number {
    return this.trustedDeviceIdCounter++;
  }

  getNextDrsEvaluationId(): number {
    return this.drsEvaluationIdCounter++;
  }

  getNextAuditLogId(): number {
    return this.auditLogIdCounter++;
  }

  clearAll(): void {
    this.auth_contexts.clear();
    this.auth_transactions.clear();
    this.sessions.clear();
    this.tokens.clear();
    this.trusted_devices.clear();
    this.drs_evaluations.clear();
    this.audit_logs.clear();
    this.tokenIdCounter = 1;
    this.trustedDeviceIdCounter = 1;
    this.drsEvaluationIdCounter = 1;
    this.auditLogIdCounter = 1;
  }
}

// ============================================================================
// QUERY BUILDER CLASSES
// ============================================================================

type WhereCondition = {
  column: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'in' | 'is';
  value: any;
};

type OrderByClause = {
  column: string;
  direction: 'asc' | 'desc';
};

/**
 * Mock SELECT query builder
 */
export class MockSelectQueryBuilder<TB extends TableName> {
  private tableName: TB;
  private store: Map<any, any>;
  private whereConditions: WhereCondition[] = [];
  private orderByClauses: OrderByClause[] = [];
  private limitValue?: number;
  private offsetValue?: number;
  private selectColumns: string[] = [];

  constructor(tableName: TB, store: Map<any, any>) {
    this.tableName = tableName;
    this.store = store;
  }

  select(columns: string[]): this {
    this.selectColumns = columns;
    return this;
  }

  selectAll(): this {
    this.selectColumns = [];
    return this;
  }

  where(column: string, operator: any, value?: any): this {
    if (value === undefined) {
      value = operator;
      operator = '=';
    }
    this.whereConditions.push({ column, operator, value });
    return this;
  }

  orderBy(column: string, direction: 'asc' | 'desc' = 'asc'): this {
    this.orderByClauses.push({ column, direction });
    return this;
  }

  limit(count: number): this {
    this.limitValue = count;
    return this;
  }

  offset(count: number): this {
    this.offsetValue = count;
    return this;
  }

  private matchesConditions(record: any): boolean {
    return this.whereConditions.every((cond) => {
      const recordValue = record[cond.column];

      switch (cond.operator) {
        case '=':
          return recordValue === cond.value;
        case '!=':
          return recordValue !== cond.value;
        case '>':
          return recordValue > cond.value;
        case '<':
          return recordValue < cond.value;
        case '>=':
          return recordValue >= cond.value;
        case '<=':
          return recordValue <= cond.value;
        case 'in':
          return Array.isArray(cond.value) && cond.value.includes(recordValue);
        case 'is':
          return cond.value === null ? recordValue === null : recordValue === cond.value;
        default:
          return false;
      }
    });
  }

  private applyOrdering(records: any[]): any[] {
    if (this.orderByClauses.length === 0) return records;

    return [...records].sort((a, b) => {
      for (const clause of this.orderByClauses) {
        const aVal = a[clause.column];
        const bVal = b[clause.column];

        if (aVal < bVal) return clause.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return clause.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  async execute(): Promise<any[]> {
    let results = Array.from(this.store.values()).filter((record) =>
      this.matchesConditions(record)
    );

    results = this.applyOrdering(results);

    if (this.offsetValue !== undefined) {
      results = results.slice(this.offsetValue);
    }

    if (this.limitValue !== undefined) {
      results = results.slice(0, this.limitValue);
    }

    return results;
  }

  async executeTakeFirst(): Promise<any | undefined> {
    const results = await this.execute();
    return results[0];
  }

  async executeTakeFirstOrThrow(): Promise<any> {
    const result = await this.executeTakeFirst();
    if (!result) {
      throw new Error(`No result found in ${this.tableName}`);
    }
    return result;
  }
}

/**
 * Mock INSERT query builder
 */
export class MockInsertQueryBuilder<TB extends TableName> {
  private tableName: TB;
  private store: Map<any, any>;
  private db: MockDatabase;
  private valuesToInsert: any[] = [];
  private returningColumns: string[] = [];

  constructor(tableName: TB, store: Map<any, any>, db: MockDatabase) {
    this.tableName = tableName;
    this.store = store;
    this.db = db;
  }

  values(values: any | any[]): this {
    this.valuesToInsert = Array.isArray(values) ? values : [values];
    return this;
  }

  returning(columns: string[]): this {
    this.returningColumns = columns;
    return this;
  }

  returningAll(): this {
    this.returningColumns = [];
    return this;
  }

  private generateId(record: any): any {
    // Handle auto-increment ID generation for SERIAL columns
    if (this.tableName === 'tokens' && !record.token_id) {
      return this.db.getNextTokenId();
    }
    if (this.tableName === 'trusted_devices' && !record.device_id) {
      return this.db.getNextTrustedDeviceId();
    }
    if (this.tableName === 'drs_evaluations' && !record.evaluation_id) {
      return this.db.getNextDrsEvaluationId();
    }
    if (this.tableName === 'audit_logs' && !record.log_id) {
      return this.db.getNextAuditLogId();
    }
    return undefined;
  }

  private getPrimaryKey(record: any): any {
    // Return the primary key value for the record
    const idMap: Record<string, string> = {
      auth_contexts: 'context_id',
      auth_transactions: 'transaction_id',
      sessions: 'session_id',
      tokens: 'token_id',
      trusted_devices: 'device_id',
      drs_evaluations: 'evaluation_id',
      audit_logs: 'log_id',
    };

    const primaryKeyColumn = idMap[this.tableName];
    return record[primaryKeyColumn];
  }

  async execute(): Promise<any[]> {
    const insertedRecords: any[] = [];

    for (const values of this.valuesToInsert) {
      const record = { ...values };

      // Generate auto-increment ID if needed
      const generatedId = this.generateId(record);
      if (generatedId !== undefined) {
        const idMap: Record<string, string> = {
          tokens: 'token_id',
          trusted_devices: 'device_id',
          drs_evaluations: 'evaluation_id',
          audit_logs: 'log_id',
        };
        const idColumn = idMap[this.tableName];
        if (idColumn) {
          record[idColumn] = generatedId;
        }
      }

      // Convert string dates to Date objects
      for (const key in record) {
        if (
          key.endsWith('_at') &&
          record[key] &&
          typeof record[key] === 'string'
        ) {
          record[key] = new Date(record[key]);
        }
      }

      // Convert JSONB strings to objects
      if (record.metadata && typeof record.metadata === 'string') {
        record.metadata = JSON.parse(record.metadata);
      }
      if (record.risk_factors && typeof record.risk_factors === 'string') {
        record.risk_factors = JSON.parse(record.risk_factors);
      }
      if (record.details && typeof record.details === 'string') {
        record.details = JSON.parse(record.details);
      }

      const primaryKey = this.getPrimaryKey(record);
      this.store.set(primaryKey, record);
      insertedRecords.push(record);
    }

    return insertedRecords;
  }

  async executeTakeFirst(): Promise<any | undefined> {
    const results = await this.execute();
    return results[0];
  }

  async executeTakeFirstOrThrow(): Promise<any> {
    const result = await this.executeTakeFirst();
    if (!result) {
      throw new Error(`Insert failed in ${this.tableName}`);
    }
    return result;
  }
}

/**
 * Mock UPDATE query builder
 */
export class MockUpdateQueryBuilder<TB extends TableName> {
  private tableName: TB;
  private store: Map<any, any>;
  private whereConditions: WhereCondition[] = [];
  private updateValues: any = {};
  private returningColumns: string[] = [];

  constructor(tableName: TB, store: Map<any, any>) {
    this.tableName = tableName;
    this.store = store;
  }

  set(values: any): this {
    this.updateValues = values;
    return this;
  }

  where(column: string, operator: any, value?: any): this {
    if (value === undefined) {
      value = operator;
      operator = '=';
    }
    this.whereConditions.push({ column, operator, value });
    return this;
  }

  returning(columns: string[]): this {
    this.returningColumns = columns;
    return this;
  }

  returningAll(): this {
    this.returningColumns = [];
    return this;
  }

  private matchesConditions(record: any): boolean {
    return this.whereConditions.every((cond) => {
      const recordValue = record[cond.column];

      switch (cond.operator) {
        case '=':
          return recordValue === cond.value;
        case '!=':
          return recordValue !== cond.value;
        case '>':
          return recordValue > cond.value;
        case '<':
          return recordValue < cond.value;
        case '>=':
          return recordValue >= cond.value;
        case '<=':
          return recordValue <= cond.value;
        case 'in':
          return Array.isArray(cond.value) && cond.value.includes(recordValue);
        case 'is':
          return cond.value === null ? recordValue === null : recordValue === cond.value;
        default:
          return false;
      }
    });
  }

  async execute(): Promise<any[]> {
    const updatedRecords: any[] = [];

    // Convert entries to array first for compatibility
    const entries = Array.from(this.store.entries());
    for (const [key, record] of entries) {
      if (this.matchesConditions(record)) {
        const updatedRecord = { ...record, ...this.updateValues };

        // Convert string dates to Date objects
        for (const k in updatedRecord) {
          if (
            k.endsWith('_at') &&
            updatedRecord[k] &&
            typeof updatedRecord[k] === 'string'
          ) {
            updatedRecord[k] = new Date(updatedRecord[k]);
          }
        }

        // Convert JSONB strings to objects
        if (updatedRecord.metadata && typeof updatedRecord.metadata === 'string') {
          updatedRecord.metadata = JSON.parse(updatedRecord.metadata);
        }
        if (updatedRecord.risk_factors && typeof updatedRecord.risk_factors === 'string') {
          updatedRecord.risk_factors = JSON.parse(updatedRecord.risk_factors);
        }
        if (updatedRecord.details && typeof updatedRecord.details === 'string') {
          updatedRecord.details = JSON.parse(updatedRecord.details);
        }

        this.store.set(key, updatedRecord);
        updatedRecords.push(updatedRecord);
      }
    }

    return updatedRecords;
  }

  async executeTakeFirst(): Promise<any | undefined> {
    const results = await this.execute();
    return results[0];
  }
}

/**
 * Mock DELETE query builder
 */
export class MockDeleteQueryBuilder<TB extends TableName> {
  private tableName: TB;
  private store: Map<any, any>;
  private whereConditions: WhereCondition[] = [];
  private returningColumns: string[] = [];

  constructor(tableName: TB, store: Map<any, any>) {
    this.tableName = tableName;
    this.store = store;
  }

  where(column: string, operator: any, value?: any): this {
    if (value === undefined) {
      value = operator;
      operator = '=';
    }
    this.whereConditions.push({ column, operator, value });
    return this;
  }

  returning(columns: string[]): this {
    this.returningColumns = columns;
    return this;
  }

  returningAll(): this {
    this.returningColumns = [];
    return this;
  }

  private matchesConditions(record: any): boolean {
    return this.whereConditions.every((cond) => {
      const recordValue = record[cond.column];

      switch (cond.operator) {
        case '=':
          return recordValue === cond.value;
        case '!=':
          return recordValue !== cond.value;
        case '>':
          return recordValue > cond.value;
        case '<':
          return recordValue < cond.value;
        case '>=':
          return recordValue >= cond.value;
        case '<=':
          return recordValue <= cond.value;
        case 'in':
          return Array.isArray(cond.value) && cond.value.includes(recordValue);
        case 'is':
          return cond.value === null ? recordValue === null : recordValue === cond.value;
        default:
          return false;
      }
    });
  }

  async execute(): Promise<any[]> {
    const deletedRecords: any[] = [];

    // Convert entries to array first for compatibility
    const entries = Array.from(this.store.entries());
    for (const [key, record] of entries) {
      if (this.matchesConditions(record)) {
        deletedRecords.push(record);
        this.store.delete(key);
      }
    }

    return deletedRecords;
  }

  async executeTakeFirst(): Promise<any | undefined> {
    const results = await this.execute();
    return results[0];
  }
}

// ============================================================================
// MOCK KYSELY INSTANCE
// ============================================================================

/**
 * Mock Kysely database instance
 * Provides the same API as real Kysely but uses in-memory storage
 */
export class MockKysely {
  private db: MockDatabase;

  constructor() {
    this.db = new MockDatabase();
  }

  /**
   * Start a SELECT query
   */
  selectFrom<TB extends TableName>(table: TB): MockSelectQueryBuilder<TB> {
    const store = this.db[table] as Map<any, any>;
    return new MockSelectQueryBuilder(table, store);
  }

  /**
   * Start an INSERT query
   */
  insertInto<TB extends TableName>(table: TB): MockInsertQueryBuilder<TB> {
    const store = this.db[table] as Map<any, any>;
    return new MockInsertQueryBuilder(table, store, this.db);
  }

  /**
   * Start an UPDATE query
   */
  updateTable<TB extends TableName>(table: TB): MockUpdateQueryBuilder<TB> {
    const store = this.db[table] as Map<any, any>;
    return new MockUpdateQueryBuilder(table, store);
  }

  /**
   * Start a DELETE query
   */
  deleteFrom<TB extends TableName>(table: TB): MockDeleteQueryBuilder<TB> {
    const store = this.db[table] as Map<any, any>;
    return new MockDeleteQueryBuilder(table, store);
  }

  /**
   * Execute a transaction
   * Note: This is a simplified mock - no actual rollback support
   */
  async transaction<T>(callback: (trx: MockKysely) => Promise<T>): Promise<T> {
    // In mock mode, we don't implement real transaction semantics
    // Just execute the callback with the same instance
    return callback(this);
  }

  /**
   * Destroy the connection pool (no-op for mock)
   */
  async destroy(): Promise<void> {
    // No-op for mock database
  }

  /**
   * Clear all data from mock database (for testing)
   */
  clearAll(): void {
    this.db.clearAll();
  }

  /**
   * Get direct access to the underlying mock database (for testing)
   */
  getMockDatabase(): MockDatabase {
    return this.db;
  }
}
