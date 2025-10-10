/**
 * Token Service
 *
 * Handles refresh token lifecycle using RefreshTokenRepository
 * Refactored to use repository pattern with database persistence
 */

import { v4 as uuidv4 } from 'uuid';
import { RefreshToken } from '../types';
import { generateRefreshToken } from '../utils/jwt';
import { repositories } from '../repositories';
import { RefreshToken as DBRefreshToken } from '../database/types';
import * as crypto from 'crypto';

/**
 * Hash a token for secure storage
 */
const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Type mapping: RefreshToken (DB) → RefreshToken (Service)
 */
const toRefreshToken = (dbToken: DBRefreshToken, rawToken?: string): RefreshToken => {
  return {
    tokenId: dbToken.token_id.toString(),
    userId: dbToken.user_id,
    sessionId: dbToken.session_id,
    token: rawToken || dbToken.token_hash, // Use raw token if available, otherwise hash
    expiresAt: dbToken.expires_at,
    createdAt: dbToken.created_at,
    isRevoked: dbToken.is_revoked,
  };
};

/**
 * Create and store refresh token
 */
export const createRefreshToken = async (
  userId: string,
  sessionId: string,
  parentTokenId?: number
): Promise<RefreshToken> => {
  const token = generateRefreshToken();
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days

  const dbToken = await repositories.refreshToken.create({
    user_id: userId,
    session_id: sessionId,
    token_hash: tokenHash,
    parent_token_id: parentTokenId || null,
    created_at: now,
    expires_at: expiresAt,
    is_revoked: false,
    revoked_at: null,
  });

  console.log(`Created refresh token ${dbToken.token_id} for user ${userId}`);

  // Return with raw token (not stored in DB)
  return toRefreshToken(dbToken, token);
};

/**
 * Validate refresh token
 */
export const validateRefreshToken = async (token: string): Promise<{
  valid: boolean;
  refreshToken?: RefreshToken;
  error?: string;
}> => {
  const tokenHash = hashToken(token);
  const dbToken = await repositories.refreshToken.findByHash(tokenHash);

  if (!dbToken) {
    return {
      valid: false,
      error: 'Refresh token not found'
    };
  }

  const refreshToken = toRefreshToken(dbToken, token);

  if (dbToken.is_revoked) {
    return {
      valid: false,
      refreshToken,
      error: 'Refresh token has been revoked'
    };
  }

  if (dbToken.expires_at < new Date()) {
    // Automatically revoke expired token
    await repositories.refreshToken.revoke(dbToken.token_id);
    refreshToken.isRevoked = true;
    return {
      valid: false,
      refreshToken,
      error: 'Refresh token has expired'
    };
  }

  return {
    valid: true,
    refreshToken
  };
};

/**
 * Rotate refresh token (issue new one and revoke old one)
 */
export const rotateRefreshToken = async (
  oldToken: string,
  userId: string,
  sessionId: string
): Promise<{
  success: boolean;
  newRefreshToken?: RefreshToken;
  error?: string;
}> => {
  const validation = await validateRefreshToken(oldToken);

  if (!validation.valid) {
    // If token reuse is detected, revoke all user sessions for security
    if (validation.refreshToken && validation.error === 'Refresh token has been revoked') {
      await revokeAllUserRefreshTokens(userId);
      return {
        success: false,
        error: 'Token reuse detected - all sessions revoked for security'
      };
    }

    return {
      success: false,
      error: validation.error
    };
  }

  // Get parent token ID for rotation chain
  const tokenHash = hashToken(oldToken);
  const oldDbToken = await repositories.refreshToken.findByHash(tokenHash);
  const parentTokenId = oldDbToken?.token_id;

  // Revoke old token
  await revokeRefreshToken(oldToken);

  // Create new token with parent reference
  const newRefreshToken = await createRefreshToken(userId, sessionId, parentTokenId);

  return {
    success: true,
    newRefreshToken
  };
};

/**
 * Revoke refresh token
 */
export const revokeRefreshToken = async (token: string): Promise<boolean> => {
  const tokenHash = hashToken(token);
  const dbToken = await repositories.refreshToken.findByHash(tokenHash);

  if (dbToken) {
    await repositories.refreshToken.revoke(dbToken.token_id);
    return true;
  }

  return false;
};

/**
 * Revoke all refresh tokens for a user
 */
export const revokeAllUserRefreshTokens = async (userId: string): Promise<number> => {
  const tokens = await repositories.refreshToken.findByUserId(userId);
  let revokedCount = 0;

  for (const token of tokens) {
    if (!token.is_revoked) {
      await repositories.refreshToken.revoke(token.token_id);
      revokedCount++;
    }
  }

  return revokedCount;
};

/**
 * Revoke all refresh tokens for a session
 */
export const revokeSessionRefreshTokens = async (sessionId: string): Promise<number> => {
  const count = await repositories.refreshToken.revokeAllForSession(sessionId);
  return count;
};

/**
 * Get refresh token by session ID
 */
export const getRefreshTokenBySession = async (sessionId: string): Promise<RefreshToken | null> => {
  const tokens = await repositories.refreshToken.findBySessionId(sessionId);

  for (const dbToken of tokens) {
    if (!dbToken.is_revoked && dbToken.expires_at > new Date()) {
      return toRefreshToken(dbToken);
    }
  }

  return null;
};

/**
 * Get user's active refresh tokens
 */
export const getUserRefreshTokens = async (userId: string): Promise<RefreshToken[]> => {
  const dbTokens = await repositories.refreshToken.findByUserId(userId);
  const now = new Date();

  return dbTokens
    .filter((t) => !t.is_revoked && t.expires_at > now)
    .map((t) => toRefreshToken(t));
};

/**
 * Clean up expired refresh tokens
 */
export const cleanupExpiredRefreshTokens = async (): Promise<number> => {
  // Find and revoke expired tokens
  const expiredTokens = await repositories.refreshToken.findExpired();
  let count = 0;

  for (const token of expiredTokens) {
    if (!token.is_revoked) {
      await repositories.refreshToken.revoke(token.token_id);
      count++;
    }
  }

  console.log(`Revoked ${count} expired refresh tokens`);

  // Delete expired and revoked tokens
  const deletedCount = await repositories.refreshToken.deleteExpiredAndRevoked();
  console.log(`Deleted ${deletedCount} expired and revoked refresh tokens`);

  return count;
};

/**
 * Get refresh token statistics
 */
export const getRefreshTokenStats = async (): Promise<{
  totalTokens: number;
  activeTokens: number;
  revokedTokens: number;
  expiredTokens: number;
  uniqueUsers: number;
}> => {
  const stats = await repositories.refreshToken.getStats();

  // Calculate unique users from all tokens
  const allTokens = await repositories.refreshToken.findAll();
  const uniqueUsers = new Set(allTokens.map(t => t.user_id)).size;

  return {
    totalTokens: stats.total,
    activeTokens: stats.valid,
    revokedTokens: stats.revoked,
    expiredTokens: stats.expired,
    uniqueUsers,
  };
};

/**
 * Check if refresh token belongs to user
 */
export const isTokenOwner = async (token: string, userId: string): Promise<boolean> => {
  const tokenHash = hashToken(token);
  const dbToken = await repositories.refreshToken.findByHash(tokenHash);
  return dbToken?.user_id === userId;
};

/**
 * Get refresh token info (for introspection)
 */
export const getRefreshTokenInfo = async (token: string): Promise<{
  active: boolean;
  userId?: string;
  sessionId?: string;
  expiresAt?: Date;
  createdAt?: Date;
}> => {
  const validation = await validateRefreshToken(token);

  if (!validation.valid || !validation.refreshToken) {
    return { active: false };
  }

  return {
    active: true,
    userId: validation.refreshToken.userId,
    sessionId: validation.refreshToken.sessionId,
    expiresAt: validation.refreshToken.expiresAt,
    createdAt: validation.refreshToken.createdAt
  };
};

/**
 * Detect token reuse pattern (security feature)
 */
export const detectTokenReuse = async (token: string): Promise<{
  reuseDetected: boolean;
  userId?: string;
  riskLevel: 'low' | 'medium' | 'high';
  details?: Record<string, unknown>;
}> => {
  const tokenHash = hashToken(token);
  const dbToken = await repositories.refreshToken.findByHash(tokenHash);

  if (!dbToken) {
    return {
      reuseDetected: false,
      riskLevel: 'low'
    };
  }

  // If trying to use a revoked token, it's definitely reuse
  if (dbToken.is_revoked) {
    return {
      reuseDetected: true,
      userId: dbToken.user_id,
      riskLevel: 'high',
      details: {
        reason: 'revoked_token_reuse',
        originalExpiry: dbToken.expires_at,
        revokedAt: dbToken.revoked_at || new Date(),
      }
    };
  }

  // Additional reuse detection logic could be implemented here
  // For example, checking for rapid successive uses from different IPs

  return {
    reuseDetected: false,
    userId: dbToken.user_id,
    riskLevel: 'low'
  };
};