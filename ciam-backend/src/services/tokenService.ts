/**
 * Token Service
 *
 * Handles all token types (ACCESS, REFRESH, ID) using TokenRepository
 * Supports transaction-aware operations for atomic session + tokens creation
 *
 * KEY DESIGN: cupid is used ONLY for JWT payload generation, NOT for database operations
 * Database operations use session_id only (normalized design)
 */

import { v4 as uuidv4 } from 'uuid';
import { generateAccessToken, generateRefreshToken as generateRefreshJWT, generateIdToken } from '../utils/jwt';
import { repositories } from '../repositories';
import { Token, TokenType } from '../database/types';
import * as crypto from 'crypto';

/**
 * Hash a token for secure storage
 */
const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Create all three tokens (ACCESS, REFRESH, ID) atomically for a session
 *
 * @param sessionId - Session ID (database reference)
 * @param cupid - User identifier (ONLY for JWT payload, NOT stored in tokens table)
 * @param roles - User roles for access token
 * @param trx - Transaction object for atomic operations
 */
export const createSessionTokens = async (
  sessionId: string,
  cupid: string,
  roles: string[],
  userProfile?: {
    preferred_username?: string;
    email?: string;
    email_verified?: boolean;
    given_name?: string;
    family_name?: string;
  },
  trx?: any
): Promise<{
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresIn: number;
}> => {
  const now = new Date();

  // Generate ACCESS token (15 min)
  const accessToken = generateAccessToken(cupid, sessionId, roles);
  const accessTokenHash = hashToken(accessToken);
  const accessExpiresAt = new Date(now.getTime() + 15 * 60 * 1000);

  await repositories.token.create({
    token_id: uuidv4(),
    session_id: sessionId,  // ✅ Uses session_id only
    parent_token_id: null,
    token_type: 'ACCESS',
    token_value: accessToken,
    token_value_hash: accessTokenHash,
    status: 'ACTIVE',
    created_at: now,
    expires_at: accessExpiresAt,
    revoked_at: null,
  }, trx);

  // Generate REFRESH token (14 days)
  const refreshToken = generateRefreshJWT();
  const refreshTokenHash = hashToken(refreshToken);
  const refreshExpiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  await repositories.token.create({
    token_id: uuidv4(),
    session_id: sessionId,  // ✅ Uses session_id only
    parent_token_id: null,
    token_type: 'REFRESH',
    token_value: refreshToken,
    token_value_hash: refreshTokenHash,
    status: 'ACTIVE',
    created_at: now,
    expires_at: refreshExpiresAt,
    revoked_at: null,
  }, trx);

  // Generate ID token (15 min)
  const idToken = generateIdToken(cupid, sessionId, userProfile || {});
  const idTokenHash = hashToken(idToken);
  const idExpiresAt = new Date(now.getTime() + 15 * 60 * 1000);

  await repositories.token.create({
    token_id: uuidv4(),
    session_id: sessionId,  // ✅ Uses session_id only
    parent_token_id: null,
    token_type: 'ID',
    token_value: idToken,
    token_value_hash: idTokenHash,
    status: 'ACTIVE',
    created_at: now,
    expires_at: idExpiresAt,
    revoked_at: null,
  }, trx);

  console.log(`Created 3 tokens (ACCESS, REFRESH, ID) for session ${sessionId}`);

  return {
    accessToken,
    refreshToken,
    idToken,
    expiresIn: 900, // 15 minutes
  };
};

/**
 * Validate refresh token - NO cupid parameter
 */
export const validateRefreshToken = async (
  token: string,
  trx?: any
): Promise<{
  valid: boolean;
  tokenRecord?: Token;
  sessionId?: string;
  error?: string;
}> => {
  const tokenHash = hashToken(token);
  const tokenRecord = await repositories.token.findByHash(tokenHash, trx);

  if (!tokenRecord) {
    return { valid: false, error: 'Token not found' };
  }

  if (tokenRecord.token_type !== 'REFRESH') {
    return { valid: false, error: 'Not a refresh token' };
  }

  if (tokenRecord.status === 'REVOKED') {
    return { valid: false, tokenRecord, error: 'Token revoked' };
  }

  if (tokenRecord.status === 'ROTATED') {
    return { valid: false, tokenRecord, error: 'Token already rotated' };
  }

  if (tokenRecord.expires_at < new Date()) {
    await repositories.token.revoke(tokenRecord.token_id, trx);
    return { valid: false, tokenRecord, error: 'Token expired' };
  }

  return {
    valid: true,
    tokenRecord,
    sessionId: tokenRecord.session_id,
  };
};

/**
 * Rotate refresh token and generate new ACCESS/ID tokens
 *
 * @param oldToken - Current refresh token
 * @param sessionId - Session ID (from token validation)
 * @param cupid - User identifier (ONLY for JWT payload generation)
 * @param roles - User roles for new access token
 * @param trx - Transaction object
 */
export const rotateRefreshToken = async (
  oldToken: string,
  sessionId: string,
  cupid: string,
  roles: string[],
  userProfile?: {
    preferred_username?: string;
    email?: string;
    email_verified?: boolean;
    given_name?: string;
    family_name?: string;
  },
  trx?: any
): Promise<{
  success: boolean;
  newRefreshToken?: string;
  newAccessToken?: string;
  newIdToken?: string;
  error?: string;
}> => {
  const validation = await validateRefreshToken(oldToken, trx);

  if (!validation.valid) {
    // Token reuse detection - revoke all tokens for session
    if (validation.tokenRecord && validation.error === 'Token already rotated') {
      await repositories.token.revokeAllForSession(sessionId, trx);
      return {
        success: false,
        error: 'Token reuse detected - all session tokens revoked',
      };
    }

    return { success: false, error: validation.error };
  }

  // Mark old token as rotated
  await repositories.token.markRotated(validation.tokenRecord!.token_id, trx);

  const now = new Date();

  // Create new refresh token with parent reference
  const newRefreshJWT = generateRefreshJWT();
  const refreshTokenHash = hashToken(newRefreshJWT);
  const refreshExpiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  await repositories.token.create({
    token_id: uuidv4(),
    session_id: sessionId,  // ✅ Uses session_id only
    parent_token_id: validation.tokenRecord!.token_id,
    token_type: 'REFRESH',
    token_value: newRefreshJWT,
    token_value_hash: refreshTokenHash,
    status: 'ACTIVE',
    created_at: now,
    expires_at: refreshExpiresAt,
    revoked_at: null,
  }, trx);

  // Generate new access token
  const newAccessToken = generateAccessToken(cupid, sessionId, roles);
  const accessTokenHash = hashToken(newAccessToken);
  const accessExpiresAt = new Date(now.getTime() + 15 * 60 * 1000);

  await repositories.token.create({
    token_id: uuidv4(),
    session_id: sessionId,
    parent_token_id: null,
    token_type: 'ACCESS',
    token_value: newAccessToken,
    token_value_hash: accessTokenHash,
    status: 'ACTIVE',
    created_at: now,
    expires_at: accessExpiresAt,
    revoked_at: null,
  }, trx);

  // Generate new ID token
  const newIdToken = generateIdToken(cupid, sessionId, userProfile || {});
  const idTokenHash = hashToken(newIdToken);
  const idExpiresAt = new Date(now.getTime() + 15 * 60 * 1000);

  await repositories.token.create({
    token_id: uuidv4(),
    session_id: sessionId,
    parent_token_id: null,
    token_type: 'ID',
    token_value: newIdToken,
    token_value_hash: idTokenHash,
    status: 'ACTIVE',
    created_at: now,
    expires_at: idExpiresAt,
    revoked_at: null,
  }, trx);

  console.log(`Rotated refresh token and generated new ACCESS/ID tokens for session ${sessionId}`);

  return {
    success: true,
    newRefreshToken: newRefreshJWT,
    newAccessToken,
    newIdToken,
  };
};

/**
 * Revoke all tokens for a session - NO cupid
 */
export const revokeSessionTokens = async (
  sessionId: string,
  trx?: any
): Promise<number> => {
  return await repositories.token.revokeAllForSession(sessionId, trx);
};

/**
 * Revoke all tokens for a user (by cupid) - uses JOIN to sessions
 */
export const revokeByCupid = async (
  cupid: string,
  trx?: any
): Promise<number> => {
  return await repositories.token.revokeByCupid(cupid, trx);
};

/**
 * Clean up expired tokens
 */
export const cleanupExpiredTokens = async (trx?: any): Promise<number> => {
  const expiredCount = await repositories.token.expireOldTokens(trx);
  const deletedCount = await repositories.token.deleteExpiredAndRevoked(trx);
  console.log(`Expired ${expiredCount} tokens, deleted ${deletedCount} old tokens`);
  return expiredCount;
};

/**
 * Get token statistics
 */
export const getTokenStats = async (trx?: any) => {
  return await repositories.token.getStats(trx);
};

/**
 * Get active token by session and type
 */
export const getActiveTokenBySessionAndType = async (
  sessionId: string,
  tokenType: TokenType,
  trx?: any
): Promise<Token | undefined> => {
  return await repositories.token.findActiveBySessionAndType(sessionId, tokenType, trx);
};
