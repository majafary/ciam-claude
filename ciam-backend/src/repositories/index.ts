/**
 * Repository Factory & Exports
 *
 * Centralized access point for all repositories
 * Provides singleton instances to avoid creating multiple instances
 *
 * Usage:
 *   import { repositories } from './repositories';
 *   const user = await repositories.authContext.findByContextId(contextId);
 */

import { AuthContextRepository } from './AuthContextRepository';
import { AuthTransactionRepository } from './AuthTransactionRepository';
import { SessionRepository } from './SessionRepository';
import { TokenRepository } from './TokenRepository';
import { TrustedDeviceRepository } from './TrustedDeviceRepository';
import { DrsEvaluationRepository } from './DrsEvaluationRepository';
import { AuditLogRepository} from './AuditLogRepository';

/**
 * Repository Factory
 *
 * Singleton pattern for repository instances
 * Ensures consistent database access across the application
 */
export class RepositoryFactory {
  private static instance: RepositoryFactory;

  // Repository instances
  public readonly authContext: AuthContextRepository;
  public readonly authTransaction: AuthTransactionRepository;
  public readonly session: SessionRepository;
  public readonly token: TokenRepository;
  public readonly trustedDevice: TrustedDeviceRepository;
  public readonly drsEvaluation: DrsEvaluationRepository;
  public readonly auditLog: AuditLogRepository;

  private constructor() {
    // Initialize all repository instances
    this.authContext = new AuthContextRepository();
    this.authTransaction = new AuthTransactionRepository();
    this.session = new SessionRepository();
    this.token = new TokenRepository();
    this.trustedDevice = new TrustedDeviceRepository();
    this.drsEvaluation = new DrsEvaluationRepository();
    this.auditLog = new AuditLogRepository();

    console.log('✅ Repository Factory initialized');
  }

  /**
   * Get singleton instance of RepositoryFactory
   */
  public static getInstance(): RepositoryFactory {
    if (!RepositoryFactory.instance) {
      RepositoryFactory.instance = new RepositoryFactory();
    }
    return RepositoryFactory.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  public static reset(): void {
    RepositoryFactory.instance = null as any;
  }
}

/**
 * Singleton repository instances
 * Import this in your services to access repositories
 *
 * Example:
 *   import { repositories } from './repositories';
 *   const context = await repositories.authContext.create({ ... });
 */
export const repositories = RepositoryFactory.getInstance();

/**
 * Individual repository exports (for direct import if needed)
 */
export {
  AuthContextRepository,
  AuthTransactionRepository,
  SessionRepository,
  TokenRepository,
  TrustedDeviceRepository,
  DrsEvaluationRepository,
  AuditLogRepository,
};

/**
 * Base repository export
 */
export { BaseRepository } from './BaseRepository';
