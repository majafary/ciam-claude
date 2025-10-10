/**
 * Database Configuration
 *
 * Provides configuration for PostgreSQL database connection with support for:
 * - Feature flag (USE_MOCK_DB) to switch between mock and real database
 * - Connection pooling for high-volume traffic
 * - Environment-based configuration
 * - Type-safe configuration interface
 */

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
  poolMin: number;
  poolMax: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  statementTimeoutMillis: number;
}

/**
 * Feature flag to control database mode
 * - true: Use in-memory mock database (default for development/testing)
 * - false: Use real PostgreSQL database (production)
 */
export const USE_MOCK_DB = process.env.USE_MOCK_DB !== 'false';

/**
 * Get database configuration from environment variables
 *
 * Environment Variables:
 * - DB_HOST: PostgreSQL host (default: localhost)
 * - DB_PORT: PostgreSQL port (default: 5432)
 * - DB_NAME: Database name (default: ciam_db)
 * - DB_USER: Database user (default: ciam_user)
 * - DB_PASSWORD: Database password (default: ciam_password)
 * - DB_SSL: Enable SSL (default: false)
 * - DB_POOL_MIN: Minimum pool connections (default: 10)
 * - DB_POOL_MAX: Maximum pool connections (default: 50)
 * - DB_CONNECTION_TIMEOUT: Connection timeout in ms (default: 10000)
 * - DB_IDLE_TIMEOUT: Idle timeout in ms (default: 30000)
 * - DB_STATEMENT_TIMEOUT: Statement timeout in ms (default: 30000)
 */
export function getDatabaseConfig(): DatabaseConfig {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'ciam_db',
    user: process.env.DB_USER || 'ciam_user',
    password: process.env.DB_PASSWORD || 'ciam_password',
    ssl: process.env.DB_SSL === 'true'
      ? { rejectUnauthorized: false }
      : false,
    poolMin: parseInt(process.env.DB_POOL_MIN || '10', 10),
    poolMax: parseInt(process.env.DB_POOL_MAX || '50', 10),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000', 10),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
    statementTimeoutMillis: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000', 10),
  };
}

/**
 * Validate database configuration
 * Throws error if configuration is invalid
 */
export function validateDatabaseConfig(config: DatabaseConfig): void {
  if (!config.host) {
    throw new Error('Database host is required');
  }
  if (!config.database) {
    throw new Error('Database name is required');
  }
  if (!config.user) {
    throw new Error('Database user is required');
  }
  if (!config.password) {
    throw new Error('Database password is required');
  }
  if (config.poolMin < 1) {
    throw new Error('Pool minimum must be at least 1');
  }
  if (config.poolMax < config.poolMin) {
    throw new Error('Pool maximum must be greater than or equal to pool minimum');
  }
}
