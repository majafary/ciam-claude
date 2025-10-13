/**
 * Session Service
 *
 * Handles session lifecycle using SessionRepository
 * Refactored to use repository pattern with database persistence
 */

import { v4 as uuidv4 } from 'uuid';
import { Session, SessionInfo } from '../types';
import { repositories } from '../repositories';
import { Session as DBSession } from '../database/types';

/**
 * Type mapping: Session (DB) → Session (Service)
 */
const toSession = (dbSession: DBSession): Session => {
  return {
    sessionId: dbSession.session_id,
    userId: dbSession.cupid,
    deviceId: dbSession.device_id || generateDeviceId(dbSession.user_agent || undefined),
    createdAt: dbSession.created_at,
    lastSeenAt: dbSession.last_seen_at,
    expiresAt: dbSession.expires_at,
    ip: dbSession.ip_address || undefined,
    userAgent: dbSession.user_agent || undefined,
    isActive: dbSession.is_active,
  };
};

/**
 * Create a new session
 */
export const createSession = async (
  userId: string,
  ip?: string,
  userAgent?: string,
  contextId?: string
): Promise<Session> => {
  const sessionId = `sess-${uuidv4()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
  const deviceId = generateDeviceId(userAgent);

  const dbSession = await repositories.session.create({
    session_id: sessionId,
    cupid: userId,
    context_id: contextId || null,
    device_id: deviceId,
    created_at: now,
    last_seen_at: now,
    expires_at: expiresAt,
    ip_address: ip || null,
    user_agent: userAgent || null,
    is_active: true,
  });

  console.log(`Created session ${sessionId} for user ${userId}`);
  return toSession(dbSession);
};

/**
 * Get session by ID
 */
export const getSessionById = async (sessionId: string): Promise<Session | null> => {
  const dbSession = await repositories.session.findById(sessionId);

  if (!dbSession) {
    return null;
  }

  // Check if session is expired
  if (dbSession.expires_at < new Date()) {
    await revokeSession(sessionId);
    return null;
  }

  return toSession(dbSession);
};

/**
 * Verify session validity
 */
export const verifySession = async (sessionId: string): Promise<boolean> => {
  const session = await getSessionById(sessionId);
  return session?.isActive || false;
};

/**
 * Update session's last seen timestamp
 */
export const updateSessionActivity = async (sessionId: string): Promise<void> => {
  await repositories.session.updateLastSeen(sessionId);
};

/**
 * Get all active sessions for a user
 */
export const getUserSessions = async (userId: string): Promise<SessionInfo[]> => {
  const dbSessions = await repositories.session.findActiveByCupid(userId);

  const userSessions: SessionInfo[] = await Promise.all(
    dbSessions.map(async (dbSession) => ({
      sessionId: dbSession.session_id,
      deviceId: dbSession.device_id || 'unknown',
      createdAt: dbSession.created_at.toISOString(),
      lastSeenAt: dbSession.last_seen_at.toISOString(),
      ip: dbSession.ip_address || undefined,
      userAgent: dbSession.user_agent || undefined,
      location: await getLocationFromIP(dbSession.ip_address || undefined),
    }))
  );

  return userSessions.sort((a, b) =>
    new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
  );
};

/**
 * Revoke a specific session
 */
export const revokeSession = async (sessionId: string): Promise<boolean> => {
  const result = await repositories.session.deactivate(sessionId);
  return !!result;
};

/**
 * Revoke all sessions for a user
 */
export const revokeAllUserSessions = async (userId: string): Promise<number> => {
  const count = await repositories.session.deactivateAllForCupid(userId);
  return count;
};

/**
 * Revoke all sessions except the current one
 */
export const revokeOtherUserSessions = async (userId: string, currentSessionId: string): Promise<number> => {
  const allSessions = await repositories.session.findActiveByCupid(userId);

  let revokedCount = 0;
  for (const session of allSessions) {
    if (session.session_id !== currentSessionId) {
      await repositories.session.deactivate(session.session_id);
      revokedCount++;
    }
  }

  return revokedCount;
};

/**
 * Clean up expired sessions
 */
export const cleanupExpiredSessions = async (): Promise<number> => {
  const count = await repositories.session.expireOldSessions();
  console.log(`Cleaned up ${count} expired sessions`);
  return count;
};

/**
 * Extend session expiration
 */
export const extendSession = async (sessionId: string, additionalHours: number = 24): Promise<boolean> => {
  const dbSession = await repositories.session.findById(sessionId);

  if (dbSession && dbSession.is_active) {
    const newExpiresAt = new Date(dbSession.expires_at.getTime() + additionalHours * 60 * 60 * 1000);
    await repositories.session.update(sessionId, {
      expires_at: newExpiresAt,
    });
    return true;
  }

  return false;
};

/**
 * Get session statistics
 */
export const getSessionStats = async (): Promise<{
  totalSessions: number;
  activeSessions: number;
  expiredSessions: number;
  uniqueUsers: number;
}> => {
  const stats = await repositories.session.getStats();
  const uniqueUsers = Object.keys(stats.byCupid).length;

  return {
    totalSessions: stats.total,
    activeSessions: stats.active,
    expiredSessions: stats.expired,
    uniqueUsers,
  };
};

/**
 * Generate device ID from user agent
 */
const generateDeviceId = (userAgent?: string): string => {
  if (!userAgent) {
    return `device-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Simple device identification based on user agent
  let deviceType = 'unknown';

  if (userAgent.includes('iPhone')) {
    deviceType = 'iPhone';
  } else if (userAgent.includes('iPad')) {
    deviceType = 'iPad';
  } else if (userAgent.includes('Android')) {
    deviceType = 'Android';
  } else if (userAgent.includes('Chrome')) {
    deviceType = 'Chrome';
  } else if (userAgent.includes('Safari')) {
    deviceType = 'Safari';
  } else if (userAgent.includes('Firefox')) {
    deviceType = 'Firefox';
  } else if (userAgent.includes('Edge')) {
    deviceType = 'Edge';
  }

  return `${deviceType}-${Math.random().toString(36).substr(2, 6)}`;
};

/**
 * Mock location service
 * TODO: Replace with actual IP geolocation service in production
 */
const getLocationFromIP = async (ip?: string): Promise<string | undefined> => {
  if (!ip || ip === '127.0.0.1' || ip === '::1') {
    return 'Local Development';
  }

  // Mock location data
  const mockLocations = [
    'New York, NY, US',
    'Los Angeles, CA, US',
    'London, UK',
    'Toronto, ON, CA',
    'San Francisco, CA, US'
  ];

  return mockLocations[Math.floor(Math.random() * mockLocations.length)];
};

/**
 * Check if session belongs to user
 */
export const isSessionOwner = async (sessionId: string, userId: string): Promise<boolean> => {
  const session = await getSessionById(sessionId);
  return session?.userId === userId;
};

/**
 * Get session by user ID and device ID (for detecting duplicate logins)
 */
export const getSessionByUserAndDevice = async (
  userId: string,
  deviceId: string
): Promise<Session | null> => {
  const sessions = await repositories.session.findActiveByCupid(userId);

  for (const dbSession of sessions) {
    if (dbSession.device_id === deviceId) {
      return toSession(dbSession);
    }
  }

  return null;
};