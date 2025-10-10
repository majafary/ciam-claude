/**
 * Refresh Token Repository
 *
 * Manages refresh tokens for token rotation
 *
 * Key Responsibilities:
 * - Store refresh token hashes (never store plaintext!)
 * - Track token rotation chain (parent_token_id)
 * - Detect token reuse attacks
 * - Revoke tokens and entire rotation chains
 * - Link tokens to sessions
 */

import { Transaction } from 'kysely';
import { BaseRepository } from './BaseRepository';
import {
  Database,
  RefreshToken,
  NewRefreshToken,
  RefreshTokenUpdate,
} from '../database/types';

export class RefreshTokenRepository extends BaseRepository<
  'refresh_tokens',
  RefreshToken,
  NewRefreshToken,
  RefreshTokenUpdate
> {
  constructor() {
    super('refresh_tokens');
  }

  protected getPrimaryKeyColumn(): string {
    return 'token_id';
  }

  protected getPrimaryKeyValue(record: RefreshToken): number {
    return record.token_id;
  }

  /**
   * Find token by hash (CRITICAL for token validation)
   */
  async findByHash(
    tokenHash: string,
    trx?: Transaction<Database> | any
  ): Promise<RefreshToken | undefined> {
    return this.findOneBy('token_hash' as any, tokenHash, trx);
  }

  /**
   * Find all tokens for a user
   */
  async findByUserId(
    userId: string,
    trx?: Transaction<Database> | any
  ): Promise<RefreshToken[]> {
    return this.findBy('user_id' as any, userId, trx);
  }

  /**
   * Find all tokens for a session
   */
  async findBySessionId(
    sessionId: string,
    trx?: Transaction<Database> | any
  ): Promise<RefreshToken[]> {
    return this.findBy('session_id' as any, sessionId, trx);
  }

  /**
   * Find valid (non-revoked, non-expired) tokens for a session
   */
  async findValidBySessionId(
    sessionId: string,
    trx?: Transaction<Database> | any
  ): Promise<RefreshToken[]> {
    try {
      this.log('findValidBySessionId', { sessionId });

      const now = new Date();
      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('session_id', '=', sessionId)
        .where('is_revoked', '=', false)
        .where('expires_at', '>', now)
        .execute();

      this.log('findValidBySessionId:result', { count: results.length });
      return results as RefreshToken[];
    } catch (error) {
      this.handleError('findValidBySessionId', error);
    }
  }

  /**
   * Find token rotation chain (all descendants)
   */
  async findRotationChain(
    tokenId: number,
    trx?: Transaction<Database> | any
  ): Promise<RefreshToken[]> {
    try {
      this.log('findRotationChain', { tokenId });

      const chain: RefreshToken[] = [];
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
    tokenId: number,
    trx?: Transaction<Database> | any
  ): Promise<RefreshToken | undefined> {
    try {
      this.log('revoke', { tokenId });

      const result = await this.update(
        tokenId,
        {
          is_revoked: true,
          revoked_at: new Date(),
        } as RefreshTokenUpdate,
        trx
      );

      this.log('revoke:result', { revoked: !!result });
      return result;
    } catch (error) {
      this.handleError('revoke', error);
    }
  }

  /**
   * Revoke by hash (for token reuse detection)
   */
  async revokeByHash(
    tokenHash: string,
    trx?: Transaction<Database> | any
  ): Promise<RefreshToken | undefined> {
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
    tokenId: number,
    trx?: Transaction<Database> | any
  ): Promise<number> {
    try {
      this.log('revokeChain', { tokenId });

      const chain = await this.findRotationChain(tokenId, trx);
      let revokedCount = 0;

      for (const token of chain) {
        if (!token.is_revoked) {
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
          is_revoked: true,
          revoked_at: new Date(),
        } as any)
        .where('session_id', '=', sessionId)
        .where('is_revoked', '=', false)
        .execute();

      const count = results.length;
      this.log('revokeAllForSession:result', { count });
      return count;
    } catch (error) {
      this.handleError('revokeAllForSession', error);
    }
  }

  /**
   * Revoke all tokens for a user
   */
  async revokeAllForUser(
    userId: string,
    trx?: Transaction<Database> | any
  ): Promise<number> {
    try {
      this.log('revokeAllForUser', { userId });

      const results = await this.getDb(trx)
        .updateTable(this.tableName)
        .set({
          is_revoked: true,
          revoked_at: new Date(),
        } as any)
        .where('user_id', '=', userId)
        .where('is_revoked', '=', false)
        .execute();

      const count = results.length;
      this.log('revokeAllForUser:result', { count });
      return count;
    } catch (error) {
      this.handleError('revokeAllForUser', error);
    }
  }

  /**
   * Find expired tokens
   */
  async findExpired(trx?: Transaction<Database> | any): Promise<RefreshToken[]> {
    try {
      this.log('findExpired');

      const now = new Date();
      const results = await this.getDb(trx)
        .selectFrom(this.tableName)
        .selectAll()
        .where('expires_at', '<=', now)
        .execute();

      this.log('findExpired:result', { count: results.length });
      return results as RefreshToken[];
    } catch (error) {
      this.handleError('findExpired', error);
    }
  }

  /**
   * Delete expired and revoked tokens (cleanup operation)
   */
  async deleteExpiredAndRevoked(trx?: Transaction<Database> | any): Promise<number> {
    try {
      this.log('deleteExpiredAndRevoked');

      const now = new Date();
      const results = await this.getDb(trx)
        .deleteFrom(this.tableName)
        .where((eb: any) =>
          eb.or([
            eb('expires_at', '<=', now),
            eb('is_revoked', '=', true),
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
    valid: number;
    revoked: number;
    expired: number;
    withParent: number;
    roots: number;
  }> {
    try {
      this.log('getStats');

      const all = await this.findAll(trx);
      const now = new Date();

      const stats = {
        total: all.length,
        valid: all.filter((t) => !t.is_revoked && new Date(t.expires_at) > now).length,
        revoked: all.filter((t) => t.is_revoked).length,
        expired: all.filter((t) => new Date(t.expires_at) <= now).length,
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
