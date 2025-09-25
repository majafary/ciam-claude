import { v4 as uuidv4 } from 'uuid';
import { Session, SessionInfo } from '../types';

/**
 * Mock session storage for development
 * TODO: Replace with actual database (Redis/PostgreSQL) in production
 */
const mockSessions: Map<string, Session> = new Map();

/**
 * Create a new session
 */
export const createSession = async (
  userId: string,
  ip?: string,
  userAgent?: string
): Promise<Session> => {
  const sessionId = `sess-${uuidv4()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

  const session: Session = {
    sessionId,
    userId,
    deviceId: generateDeviceId(userAgent),
    createdAt: now,
    lastSeenAt: now,
    expiresAt,
    ip,
    userAgent,
    isActive: true
  };

  // TODO: Store in database in production
  mockSessions.set(sessionId, session);

  return session;
};

/**
 * Get session by ID
 */
export const getSessionById = async (sessionId: string): Promise<Session | null> => {
  // TODO: Replace with actual database query in production
  const session = mockSessions.get(sessionId);

  if (!session) {
    return null;
  }

  // Check if session is expired
  if (session.expiresAt < new Date()) {
    await revokeSession(sessionId);
    return null;
  }

  return session;
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
  // TODO: Replace with actual database update in production
  const session = mockSessions.get(sessionId);
  if (session && session.isActive) {
    session.lastSeenAt = new Date();
  }
};

/**
 * Get all active sessions for a user
 */
export const getUserSessions = async (userId: string): Promise<SessionInfo[]> => {
  // TODO: Replace with actual database query in production
  const userSessions: SessionInfo[] = [];

  for (const session of mockSessions.values()) {
    if (session.userId === userId && session.isActive && session.expiresAt > new Date()) {
      userSessions.push({
        sessionId: session.sessionId,
        deviceId: session.deviceId,
        createdAt: session.createdAt.toISOString(),
        lastSeenAt: session.lastSeenAt.toISOString(),
        ip: session.ip,
        userAgent: session.userAgent,
        location: await getLocationFromIP(session.ip) // Mock location
      });
    }
  }

  return userSessions.sort((a, b) =>
    new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
  );
};

/**
 * Revoke a specific session
 */
export const revokeSession = async (sessionId: string): Promise<boolean> => {
  // TODO: Replace with actual database update in production
  const session = mockSessions.get(sessionId);

  if (session) {
    session.isActive = false;
    return true;
  }

  return false;
};

/**
 * Revoke all sessions for a user
 */
export const revokeAllUserSessions = async (userId: string): Promise<number> => {
  // TODO: Replace with actual database update in production
  let revokedCount = 0;

  for (const session of mockSessions.values()) {
    if (session.userId === userId && session.isActive) {
      session.isActive = false;
      revokedCount++;
    }
  }

  return revokedCount;
};

/**
 * Revoke all sessions except the current one
 */
export const revokeOtherUserSessions = async (userId: string, currentSessionId: string): Promise<number> => {
  // TODO: Replace with actual database update in production
  let revokedCount = 0;

  for (const session of mockSessions.values()) {
    if (session.userId === userId && session.sessionId !== currentSessionId && session.isActive) {
      session.isActive = false;
      revokedCount++;
    }
  }

  return revokedCount;
};

/**
 * Clean up expired sessions
 */
export const cleanupExpiredSessions = async (): Promise<number> => {
  // TODO: Replace with actual database cleanup in production
  const now = new Date();
  let cleanedCount = 0;

  for (const [sessionId, session] of mockSessions.entries()) {
    if (session.expiresAt < now) {
      mockSessions.delete(sessionId);
      cleanedCount++;
    }
  }

  return cleanedCount;
};

/**
 * Extend session expiration
 */
export const extendSession = async (sessionId: string, additionalHours: number = 24): Promise<boolean> => {
  // TODO: Replace with actual database update in production
  const session = mockSessions.get(sessionId);

  if (session && session.isActive) {
    session.expiresAt = new Date(session.expiresAt.getTime() + additionalHours * 60 * 60 * 1000);
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
  // TODO: Replace with actual database aggregation in production
  const now = new Date();
  const sessions = Array.from(mockSessions.values());
  const uniqueUsers = new Set(sessions.map(s => s.userId)).size;

  return {
    totalSessions: sessions.length,
    activeSessions: sessions.filter(s => s.isActive && s.expiresAt > now).length,
    expiredSessions: sessions.filter(s => s.expiresAt <= now).length,
    uniqueUsers
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
  // TODO: Replace with actual database query in production
  for (const session of mockSessions.values()) {
    if (session.userId === userId && session.deviceId === deviceId && session.isActive) {
      return session;
    }
  }

  return null;
};