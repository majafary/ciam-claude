/**
 * Token Repository
 *
 * Manages all token types (ACCESS, REFRESH, ID)
 *
 * Key Responsibilities:
 * - Store token hashes (never store plaintext in production!)
 * - Track token rotation chain (parent_token_id)
 * - Detect token reuse attacks
 * - Revoke tokens and entire rotation chains
 * - Link tokens to sessions (NO direct user reference)
 * - Support all token types: ACCESS, REFRESH, ID
 * - Status-based lifecycle: ACTIVE, ROTATED, REVOKED, EXPIRED
 */

import { Transaction } from 'kysely';
import { BaseRepository } from './BaseRepository';
import {
  Database,
  Token,
  NewToken,
  TokenUpdate,
  TokenType,
  TokenStatus,
} from '../database/types';

export class TokenRepository extends BaseRepository<
  'tokens',
  Token,
  NewToken,
  TokenUpdate
> {
  constructor() {
    super('tokens');
  }

  protected getPrimaryKeyColumn(): string {
    return 'token_id';
  }

  protected getPrimaryKeyValue(record: Token): string {
    return record.token_id;
  }

  /**
   * Find token by hash (CRITICAL for token validation)
   */
  async findByHash(
    tokenHash: string,
    trx?: Transaction<Database> | any
  ): Promise<Token | undefined> {
    return this.findOneBy('token_value_hash' as any, tokenHash, trx);
  }

  /**
   * Find all tokens for a session
   */
  async findBySessionId(
    sessionId: string,
    trx?: Transaction<Database> | any
  ): Promise<Token[]> {
    return this.findBy('session_id' as any, sessionId, trx);
  }

  /**
   * Find active token by session and type
   */
  async findActiveBySessionAndType(
    sessionId: string,
    tokenType: TokenType,
    trx?: Transaction<Database> | any
  ): Promise<Token | undefined> {
    try {
      this.log('findActiveBySessionAndType', { sessionId, tokenType });

      const now = new Date();
      const result = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('session_id', '=', sessionId)
        .where('token_type', '=', tokenType)
        .where('status', '=', 'ACTIVE')
        .where('expires_at', '>', now)
        .executeTakeFirst();

      this.log('findActiveBySessionAndType:result', { found: !!result });
      return result as Token | undefined;
    } catch (error) {
      this.handleError('findActiveBySessionAndType', error);
    }
  }

  /**
   * Find valid (active, non-expired) tokens for a session
   */
  async findValidBySessionId(
    sessionId: string,
    trx?: Transaction<Database> | any
  ): Promise<Token[]> {
    try {
      this.log('findValidBySessionId', { sessionId });

      const now = new Date();
      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('session_id', '=', sessionId)
        .where('status', '=', 'ACTIVE')
        .where('expires_at', '>', now)
        .execute();

      this.log('findValidBySessionId:result', { count: results.length });
      return results as Token[];
    } catch (error) {
      this.handleError('findValidBySessionId', error);
    }
  }

  /**
   * Find token rotation chain (all descendants)
   */
  async findRotationChain(
    tokenId: string,
    trx?: Transaction<Database> | any
  ): Promise<Token[]> {
    try {
      this.log('findRotationChain', { tokenId });

      const chain: Token[] = [];
      const token = await this.findById(tokenId, trx);

      if (!token) {
        return chain;
      }

      chain.push(token);

      // Find all children recursively
      const children = await this.findBy('parent_token_id' as any, tokenId, trx);
      for (const child of children) {
        const childChain = await this.findRotationChain(child.token_id, trx);
        chain.push(...childChain);
      }

      this.log('findRotationChain:result', { count: chain.length });
      return chain;
    } catch (error) {
      this.handleError('findRotationChain', error);
    }
  }

  /**
   * Revoke a token
   */
  async revoke(
    tokenId: string,
    trx?: Transaction<Database> | any
  ): Promise<Token | undefined> {
    try {
      this.log('revoke', { tokenId });

      const result = await this.update(
        tokenId,
        {
          status: 'REVOKED',
          revoked_at: new Date(),
        } as TokenUpdate,
        trx
      );

      this.log('revoke:result', { revoked: !!result });
      return result;
    } catch (error) {
      this.handleError('revoke', error);
    }
  }

  /**
   * Mark token as rotated (for refresh token rotation)
   */
  async markRotated(
    tokenId: string,
    trx?: Transaction<Database> | any
  ): Promise<Token | undefined> {
    try {
      this.log('markRotated', { tokenId });

      const result = await this.update(
        tokenId,
        {
          status: 'ROTATED',
          revoked_at: new Date(),
        } as TokenUpdate,
        trx
      );

      this.log('markRotated:result', { rotated: !!result });
      return result;
    } catch (error) {
      this.handleError('markRotated', error);
    }
  }

  /**
   * Revoke by hash (for token reuse detection)
   */
  async revokeByHash(
    tokenHash: string,
    trx?: Transaction<Database> | any
  ): Promise<Token | undefined> {
    try {
      this.log('revokeByHash');

      const token = await this.findByHash(tokenHash, trx);
      if (!token) {
        return undefined;
      }

      return this.revoke(token.token_id, trx);
    } catch (error) {
      this.handleError('revokeByHash', error);
    }
  }

  /**
   * Revoke entire rotation chain (CRITICAL for security)
   * Used when token reuse is detected
   */
  async revokeChain(
    tokenId: string,
    trx?: Transaction<Database> | any
  ): Promise<number> {
    try {
      this.log('revokeChain', { tokenId });

      const chain = await this.findRotationChain(tokenId, trx);
      let revokedCount = 0;

      for (const token of chain) {
        if (token.status !== 'REVOKED') {
          await this.revoke(token.token_id, trx);
          revokedCount++;
        }
      }

      this.log('revokeChain:result', { count: revokedCount });
      return revokedCount;
    } catch (error) {
      this.handleError('revokeChain', error);
    }
  }

  /**
   * Revoke all tokens for a session
   */
  async revokeAllForSession(
    sessionId: string,
    trx?: Transaction<Database> | any
  ): Promise<number> {
    try {
      this.log('revokeAllForSession', { sessionId });

      const results = await this.getDb(trx)
        .updateTable(this.tableName)
        .set({
          status: 'REVOKED',
          revoked_at: new Date(),
        } as any)
        .where('session_id', '=', sessionId)
        .where('status', '!=', 'REVOKED')
        .execute();

      const count = results.length;
      this.log('revokeAllForSession:result', { count });
      return count;
    } catch (error) {
      this.handleError('revokeAllForSession', error);
    }
  }

  /**
   * Revoke all tokens for a user (by cupid) - uses JOIN to sessions
   * This is the NORMALIZED approach - NO cupid in tokens table
   */
  async revokeByCupid(
    cupid: string,
    trx?: Transaction<Database> | any
  ): Promise<number> {
    try {
      this.log('revokeByCupid', { cupid });

      const result = await this.getDb(trx)
        .updateTable(this.tableName)
        .set({
          status: 'REVOKED',
          revoked_at: new Date(),
        } as any)
        .where('session_id', 'in', (eb: any) =>
          eb.selectFrom('sessions')
            .select('session_id')
            .where('cupid', '=', cupid)
        )
        .where('status', '!=', 'REVOKED')
        .executeTakeFirst();

      const count = Number(result.numUpdatedRows || 0);
      this.log('revokeByCupid:result', { count });
      return count;
    } catch (error) {
      this.handleError('revokeByCupid', error);
    }
  }

  /**
   * Find expired tokens
   */
  async findExpired(trx?: Transaction<Database> | any): Promise<Token[]> {
    try {
      this.log('findExpired');

      const now = new Date();
      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('expires_at', '<=', now)
        .where('status', '=', 'ACTIVE')
        .execute();

      this.log('findExpired:result', { count: results.length });
      return results as Token[];
    } catch (error) {
      this.handleError('findExpired', error);
    }
  }

  /**
   * Expire old tokens (mark status as EXPIRED)
   */
  async expireOldTokens(trx?: Transaction<Database> | any): Promise<number> {
    try {
      this.log('expireOldTokens');

      const now = new Date();
      const result = await this.getDb(trx)
        .updateTable(this.tableName)
        .set({
          status: 'EXPIRED',
        } as any)
        .where('expires_at', '<=', now)
        .where('status', '=', 'ACTIVE')
        .executeTakeFirst();

      const count = Number(result.numUpdatedRows || 0);
      this.log('expireOldTokens:result', { count });
      return count;
    } catch (error) {
      this.handleError('expireOldTokens', error);
    }
  }

  /**
   * Delete expired and revoked tokens (cleanup operation)
   */
  async deleteExpiredAndRevoked(trx?: Transaction<Database> | any): Promise<number> {
    try {
      this.log('deleteExpiredAndRevoked');

      const results = await this.getDb(trx)
        .deleteFrom(this.tableName)
        .where((eb: any) =>
          eb.or([
            eb('status', '=', 'EXPIRED'),
            eb('status', '=', 'REVOKED'),
          ])
        )
        .execute();

      const count = results.length;
      this.log('deleteExpiredAndRevoked:result', { count });
      return count;
    } catch (error) {
      this.handleError('deleteExpiredAndRevoked', error);
    }
  }

  /**
   * Get token statistics
   */
  async getStats(trx?: Transaction<Database> | any): Promise<{
    total: number;
    active: number;
    rotated: number;
    revoked: number;
    expired: number;
    byType: Record<TokenType, number>;
    withParent: number;
    roots: number;
  }> {
    try {
      this.log('getStats');

      const all = await this.findAll(trx);
      const now = new Date();

      const byType: Record<TokenType, number> = {
        ACCESS: 0,
        REFRESH: 0,
        ID: 0,
      };

      all.forEach((token) => {
        byType[token.token_type]++;
      });

      const stats = {
        total: all.length,
        active: all.filter((t) => t.status === 'ACTIVE' && new Date(t.expires_at) > now).length,
        rotated: all.filter((t) => t.status === 'ROTATED').length,
        revoked: all.filter((t) => t.status === 'REVOKED').length,
        expired: all.filter((t) => t.status === 'EXPIRED').length,
        byType,
        withParent: all.filter((t) => t.parent_token_id !== null).length,
        roots: all.filter((t) => t.parent_token_id === null).length,
      };

      this.log('getStats:result', stats);
      return stats;
    } catch (error) {
      this.handleError('getStats', error);
    }
  }
}
