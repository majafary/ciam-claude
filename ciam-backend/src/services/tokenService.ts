import { v4 as uuidv4 } from 'uuid';
import { RefreshToken } from '../types';
import { generateRefreshToken } from '../utils/jwt';

/**
 * Mock refresh token storage for development
 * TODO: Replace with actual database (Redis/PostgreSQL) in production
 */
const mockRefreshTokens: Map<string, RefreshToken> = new Map();

/**
 * Create and store refresh token
 */
export const createRefreshToken = async (
  userId: string,
  sessionId: string
): Promise<RefreshToken> => {
  const tokenId = uuidv4();
  const token = generateRefreshToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days

  const refreshToken: RefreshToken = {
    tokenId,
    userId,
    sessionId,
    token,
    expiresAt,
    createdAt: now,
    isRevoked: false
  };

  // TODO: Store in database in production
  mockRefreshTokens.set(token, refreshToken);

  return refreshToken;
};

/**
 * Validate refresh token
 */
export const validateRefreshToken = async (token: string): Promise<{
  valid: boolean;
  refreshToken?: RefreshToken;
  error?: string;
}> => {
  // TODO: Replace with actual database query in production
  const refreshToken = mockRefreshTokens.get(token);

  if (!refreshToken) {
    return {
      valid: false,
      error: 'Refresh token not found'
    };
  }

  if (refreshToken.isRevoked) {
    return {
      valid: false,
      refreshToken,
      error: 'Refresh token has been revoked'
    };
  }

  if (refreshToken.expiresAt < new Date()) {
    // Automatically revoke expired token
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

  // Revoke old token
  await revokeRefreshToken(oldToken);

  // Create new token
  const newRefreshToken = await createRefreshToken(userId, sessionId);

  return {
    success: true,
    newRefreshToken
  };
};

/**
 * Revoke refresh token
 */
export const revokeRefreshToken = async (token: string): Promise<boolean> => {
  // TODO: Replace with actual database update in production
  const refreshToken = mockRefreshTokens.get(token);

  if (refreshToken) {
    refreshToken.isRevoked = true;
    return true;
  }

  return false;
};

/**
 * Revoke all refresh tokens for a user
 */
export const revokeAllUserRefreshTokens = async (userId: string): Promise<number> => {
  // TODO: Replace with actual database update in production
  let revokedCount = 0;

  for (const refreshToken of mockRefreshTokens.values()) {
    if (refreshToken.userId === userId && !refreshToken.isRevoked) {
      refreshToken.isRevoked = true;
      revokedCount++;
    }
  }

  return revokedCount;
};

/**
 * Revoke all refresh tokens for a session
 */
export const revokeSessionRefreshTokens = async (sessionId: string): Promise<number> => {
  // TODO: Replace with actual database update in production
  let revokedCount = 0;

  for (const refreshToken of mockRefreshTokens.values()) {
    if (refreshToken.sessionId === sessionId && !refreshToken.isRevoked) {
      refreshToken.isRevoked = true;
      revokedCount++;
    }
  }

  return revokedCount;
};

/**
 * Get refresh token by session ID
 */
export const getRefreshTokenBySession = async (sessionId: string): Promise<RefreshToken | null> => {
  // TODO: Replace with actual database query in production
  for (const refreshToken of mockRefreshTokens.values()) {
    if (refreshToken.sessionId === sessionId && !refreshToken.isRevoked) {
      return refreshToken;
    }
  }

  return null;
};

/**
 * Get user's active refresh tokens
 */
export const getUserRefreshTokens = async (userId: string): Promise<RefreshToken[]> => {
  // TODO: Replace with actual database query in production
  const userTokens: RefreshToken[] = [];

  for (const refreshToken of mockRefreshTokens.values()) {
    if (refreshToken.userId === userId && !refreshToken.isRevoked && refreshToken.expiresAt > new Date()) {
      userTokens.push(refreshToken);
    }
  }

  return userTokens;
};

/**
 * Clean up expired refresh tokens
 */
export const cleanupExpiredRefreshTokens = async (): Promise<number> => {
  // TODO: Replace with actual database cleanup in production
  const now = new Date();
  let cleanedCount = 0;

  for (const [token, refreshToken] of mockRefreshTokens.entries()) {
    if (refreshToken.expiresAt < now) {
      if (!refreshToken.isRevoked) {
        refreshToken.isRevoked = true;
        cleanedCount++;
      }

      // Delete tokens that expired more than 30 days ago
      if (now.getTime() - refreshToken.expiresAt.getTime() > 30 * 24 * 60 * 60 * 1000) {
        mockRefreshTokens.delete(token);
      }
    }
  }

  return cleanedCount;
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
  // TODO: Replace with actual database aggregation in production
  const now = new Date();
  const tokens = Array.from(mockRefreshTokens.values());
  const uniqueUsers = new Set(tokens.map(t => t.userId)).size;

  return {
    totalTokens: tokens.length,
    activeTokens: tokens.filter(t => !t.isRevoked && t.expiresAt > now).length,
    revokedTokens: tokens.filter(t => t.isRevoked).length,
    expiredTokens: tokens.filter(t => t.expiresAt <= now).length,
    uniqueUsers
  };
};

/**
 * Check if refresh token belongs to user
 */
export const isTokenOwner = async (token: string, userId: string): Promise<boolean> => {
  const refreshToken = mockRefreshTokens.get(token);
  return refreshToken?.userId === userId;
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
  const refreshToken = mockRefreshTokens.get(token);

  if (!refreshToken) {
    return {
      reuseDetected: false,
      riskLevel: 'low'
    };
  }

  // If trying to use a revoked token, it's definitely reuse
  if (refreshToken.isRevoked) {
    return {
      reuseDetected: true,
      userId: refreshToken.userId,
      riskLevel: 'high',
      details: {
        reason: 'revoked_token_reuse',
        originalExpiry: refreshToken.expiresAt,
        revokedAt: new Date() // In real implementation, track revocation time
      }
    };
  }

  // Additional reuse detection logic could be implemented here
  // For example, checking for rapid successive uses from different IPs

  return {
    reuseDetected: false,
    userId: refreshToken.userId,
    riskLevel: 'low'
  };
};