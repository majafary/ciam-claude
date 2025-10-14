/**
 * DRS Evaluation Repository
 *
 * Manages Device Risk Service (DRS) evaluations
 *
 * Key Responsibilities:
 * - Store risk assessments from DRS
 * - Track action tokens (hashed)
 * - Manage risk scores and recommended actions
 * - Link evaluations to auth contexts
 */

import { Transaction } from 'kysely';
import { BaseRepository } from './BaseRepository';
import {
  Database,
  DrsEvaluation,
  NewDrsEvaluation,
  DrsEvaluationUpdate,
  RiskLevel,
  DrsAction,
} from '../database/types';

export class DrsEvaluationRepository extends BaseRepository<
  'drs_evaluations',
  DrsEvaluation,
  NewDrsEvaluation,
  DrsEvaluationUpdate
> {
  constructor() {
    super('drs_evaluations');
  }

  protected getPrimaryKeyColumn(): string {
    return 'evaluation_id';
  }

  protected getPrimaryKeyValue(record: DrsEvaluation): string {
    return record.evaluation_id;
  }

  /**
   * Find evaluation by action token hash
   */
  async findByActionTokenHash(
    actionTokenHash: string,
    trx?: Transaction<Database> | any
  ): Promise<DrsEvaluation | undefined> {
    return this.findOneBy('action_token_hash' as any, actionTokenHash, trx);
  }

  /**
   * Find evaluations by context ID
   */
  async findByContextId(
    contextId: string,
    trx?: Transaction<Database> | any
  ): Promise<DrsEvaluation[]> {
    return this.findBy('context_id' as any, contextId, trx);
  }

  /**
   * Find evaluations by cupid (user identifier)
   */
  async findByCupid(
    cupid: string,
    trx?: Transaction<Database> | any
  ): Promise<DrsEvaluation[]> {
    return this.findBy('cupid' as any, cupid, trx);
  }

  /**
   * Find evaluations by guid (customer identifier)
   */
  async findByGuid(
    guid: string,
    trx?: Transaction<Database> | any
  ): Promise<DrsEvaluation[]> {
    return this.findBy('guid' as any, guid, trx);
  }

  /**
   * Find evaluations by cupid and guid (combined lookup)
   */
  async findByCupidAndGuid(
    cupid: string,
    guid: string,
    trx?: Transaction<Database> | any
  ): Promise<DrsEvaluation[]> {
    try {
      this.log('findByCupidAndGuid', { cupid, guid });

      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('cupid', '=', cupid)
        .where('guid', '=', guid)
        .execute();

      this.log('findByCupidAndGuid:result', { count: results.length });
      return results as DrsEvaluation[];
    } catch (error) {
      this.handleError('findByCupidAndGuid', error);
    }
  }

  /**
   * Find evaluations by risk level
   */
  async findByRiskLevel(
    riskLevel: RiskLevel,
    trx?: Transaction<Database> | any
  ): Promise<DrsEvaluation[]> {
    return this.findBy('risk_level' as any, riskLevel, trx);
  }

  /**
   * Find evaluations by recommended action
   */
  async findByRecommendedAction(
    action: DrsAction,
    trx?: Transaction<Database> | any
  ): Promise<DrsEvaluation[]> {
    return this.findBy('recommended_action' as any, action, trx);
  }

  /**
   * Find high-risk evaluations
   */
  async findHighRisk(trx?: Transaction<Database> | any): Promise<DrsEvaluation[]> {
    try {
      this.log('findHighRisk');

      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where((eb: any) =>
          eb.or([
            eb('risk_level', '=', 'HIGH'),
            eb('risk_level', '=', 'CRITICAL'),
          ])
        )
        .execute();

      this.log('findHighRisk:result', { count: results.length });
      return results as DrsEvaluation[];
    } catch (error) {
      this.handleError('findHighRisk', error);
    }
  }

  /**
   * Find evaluations by risk score range
   */
  async findByRiskScoreRange(
    minScore: number,
    maxScore: number,
    trx?: Transaction<Database> | any
  ): Promise<DrsEvaluation[]> {
    try {
      this.log('findByRiskScoreRange', { minScore, maxScore });

      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('risk_score', '>=', minScore)
        .where('risk_score', '<=', maxScore)
        .execute();

      this.log('findByRiskScoreRange:result', { count: results.length });
      return results as DrsEvaluation[];
    } catch (error) {
      this.handleError('findByRiskScoreRange', error);
    }
  }

  /**
   * Find recent evaluations (last N hours)
   */
  async findRecent(
    hours: number = 24,
    trx?: Transaction<Database> | any
  ): Promise<DrsEvaluation[]> {
    try {
      this.log('findRecent', { hours });

      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('evaluated_at', '>=', since)
        .execute();

      this.log('findRecent:result', { count: results.length });
      return results as DrsEvaluation[];
    } catch (error) {
      this.handleError('findRecent', error);
    }
  }

  /**
   * Find expired evaluations
   */
  async findExpired(trx?: Transaction<Database> | any): Promise<DrsEvaluation[]> {
    try {
      this.log('findExpired');

      const now = new Date();
      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('expires_at', '<=', now)
        .execute();

      this.log('findExpired:result', { count: results.length });
      return results as DrsEvaluation[];
    } catch (error) {
      this.handleError('findExpired', error);
    }
  }

  /**
   * Delete expired evaluations (cleanup operation)
   */
  async deleteExpired(trx?: Transaction<Database> | any): Promise<number> {
    try {
      this.log('deleteExpired');

      const now = new Date();
      const results = await this.getDb(trx)
        .deleteFrom(this.tableName)
        .where('expires_at', '<=', now)
        .execute();

      const count = results.length;
      this.log('deleteExpired:result', { count });
      return count;
    } catch (error) {
      this.handleError('deleteExpired', error);
    }
  }

  /**
   * Get evaluation statistics
   */
  async getStats(trx?: Transaction<Database> | any): Promise<{
    total: number;
    byRiskLevel: Record<RiskLevel, number>;
    byAction: Record<DrsAction, number>;
    averageScore: number;
    highRisk: number;
  }> {
    try {
      this.log('getStats');

      const all = await this.findAll(trx);

      const stats = {
        total: all.length,
        byRiskLevel: {
          LOW: all.filter((e) => e.risk_level === 'LOW').length,
          MEDIUM: all.filter((e) => e.risk_level === 'MEDIUM').length,
          HIGH: all.filter((e) => e.risk_level === 'HIGH').length,
          CRITICAL: all.filter((e) => e.risk_level === 'CRITICAL').length,
        },
        byAction: {
          ALLOW: all.filter((e) => e.recommended_action === 'ALLOW').length,
          CHALLENGE: all.filter((e) => e.recommended_action === 'CHALLENGE').length,
          BLOCK: all.filter((e) => e.recommended_action === 'BLOCK').length,
        },
        averageScore: all.length > 0
          ? all.reduce((sum, e) => sum + e.risk_score, 0) / all.length
          : 0,
        highRisk: all.filter((e) => e.risk_level === 'HIGH' || e.risk_level === 'CRITICAL').length,
      };

      this.log('getStats:result', stats);
      return stats;
    } catch (error) {
      this.handleError('getStats', error);
    }
  }
}
