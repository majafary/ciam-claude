/**
 * Kysely Database Instance (Real & Mock)
 *
 * Singleton pattern for database access with feature flag support
 * - USE_MOCK_DB=true: Returns mock in-memory database
 * - USE_MOCK_DB=false: Returns real PostgreSQL connection with pooling
 *
 * Usage:
 *   import { db } from './database/kysely';
 *   const users = await db.selectFrom('sessions').selectAll().execute();
 */

import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { Database } from './types';
import { MockKysely } from './mock-kysely';
import { USE_MOCK_DB, getDatabaseConfig, validateDatabaseConfig } from '../config/database';

// ============================================================================
// SINGLETON INSTANCES
// ============================================================================

let realKyselyInstance: Kysely<Database> | null = null;
let mockKyselyInstance: MockKysely | null = null;

// ============================================================================
// REAL KYSELY FACTORY
// ============================================================================

/**
 * Create real Kysely instance with PostgreSQL connection pool
 * Uses singleton pattern to ensure single connection pool
 */
function createRealKysely(): Kysely<Database> {
  if (realKyselyInstance) {
    return realKyselyInstance;
  }

  const config = getDatabaseConfig();
  validateDatabaseConfig(config);

  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl,
    min: config.poolMin,
    max: config.poolMax,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    idleTimeoutMillis: config.idleTimeoutMillis,
    statement_timeout: config.statementTimeoutMillis,
  });

  // Handle pool errors
  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err);
  });

  const dialect = new PostgresDialect({
    pool,
  });

  realKyselyInstance = new Kysely<Database>({
    dialect,
    log(event) {
      if (event.level === 'query') {
        console.log('[Kysely Query]:', event.query.sql);
        console.log('[Kysely Params]:', event.query.parameters);
      }
      if (event.level === 'error') {
        console.error('[Kysely Error]:', event.error);
      }
    },
  });

  console.log('✅ Real Kysely instance created with connection pool');
  console.log(`   - Host: ${config.host}:${config.port}`);
  console.log(`   - Database: ${config.database}`);
  console.log(`   - Pool: ${config.poolMin}-${config.poolMax} connections`);

  return realKyselyInstance;
}

// ============================================================================
// MOCK KYSELY FACTORY
// ============================================================================

/**
 * Create mock Kysely instance with in-memory storage
 * Uses singleton pattern to maintain data across requests
 */
function createMockKysely(): MockKysely {
  if (mockKyselyInstance) {
    return mockKyselyInstance;
  }

  mockKyselyInstance = new MockKysely();
  console.log('✅ Mock Kysely instance created (in-memory database)');

  return mockKyselyInstance;
}

// ============================================================================
// EXPORTED DATABASE INSTANCE
// ============================================================================

/**
 * Database instance - automatically selects mock or real based on feature flag
 *
 * Feature Flag Control:
 * - USE_MOCK_DB=true (default): In-memory mock database
 * - USE_MOCK_DB=false: Real PostgreSQL database
 */
export const db = USE_MOCK_DB ? createMockKysely() : createRealKysely();

/**
 * Type guard to check if using mock database
 */
export function isMockDatabase(): boolean {
  return USE_MOCK_DB;
}

/**
 * Get the underlying Kysely instance (for advanced usage)
 * Returns either MockKysely or Kysely<Database>
 */
export function getKyselyInstance(): Kysely<Database> | MockKysely {
  return db;
}

/**
 * Destroy the database connection pool
 * Call this on application shutdown
 */
export async function destroyDatabase(): Promise<void> {
  if (USE_MOCK_DB) {
    if (mockKyselyInstance) {
      mockKyselyInstance.clearAll();
      mockKyselyInstance = null;
      console.log('✅ Mock database cleared');
    }
  } else {
    if (realKyselyInstance) {
      await realKyselyInstance.destroy();
      realKyselyInstance = null;
      console.log('✅ Real database connection pool destroyed');
    }
  }
}

/**
 * Clear all data from mock database (for testing only)
 * Throws error if called on real database
 */
export function clearMockDatabase(): void {
  if (!USE_MOCK_DB) {
    throw new Error('clearMockDatabase() can only be called in mock mode');
  }

  if (mockKyselyInstance) {
    mockKyselyInstance.clearAll();
    console.log('✅ Mock database data cleared');
  }
}

/**
 * Get direct access to mock database instance (for testing only)
 * Throws error if called on real database
 */
export function getMockDatabaseInstance(): MockKysely {
  if (!USE_MOCK_DB) {
    throw new Error('getMockDatabaseInstance() can only be called in mock mode');
  }

  if (!mockKyselyInstance) {
    throw new Error('Mock database instance not initialized');
  }

  return mockKyselyInstance;
}

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

/**
 * Handle graceful shutdown on process termination
 */
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing database connections...');
  await destroyDatabase();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing database connections...');
  await destroyDatabase();
  process.exit(0);
});
