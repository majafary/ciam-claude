import { User, UserScenario, MockUserScenario } from '../types';

/**
 * Mock user database for development
 * TODO: Replace with actual LDAP/database implementation in production
 * NOTE: username is used for lookup only, not stored. LDAP returns cupid/guid.
 */
const mockUsers: Record<string, User> = {
  'user-123': {
    cupid: 'user-123', // User identifier (from LDAP)
    guid: 'customer-abc', // Customer identifier
    email: 'testuser@example.com',
    given_name: 'Test',
    family_name: 'User',
    roles: ['customer'],
    isLocked: false,
    mfaLocked: false,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01')
  },
  'user-locked': {
    cupid: 'user-locked', // User identifier (from LDAP)
    guid: 'customer-def', // Customer identifier
    email: 'locked@example.com',
    given_name: 'Locked',
    family_name: 'User',
    roles: ['customer'],
    isLocked: true,
    mfaLocked: false,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01')
  },
  'user-mfa-locked': {
    cupid: 'user-mfa-locked', // User identifier (from LDAP)
    guid: 'customer-ghi', // Customer identifier
    email: 'mfalocked@example.com',
    given_name: 'MFA Locked',
    family_name: 'User',
    roles: ['customer'],
    isLocked: false,
    mfaLocked: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01')
  }
};

/**
 * Mock username-to-user mapping (simulates LDAP lookup)
 * In production, this would be an LDAP query that returns cupid/guid
 */
const usernameToUserMap: Record<string, string> = {
  'testuser': 'user-123',
  'userlockeduser': 'user-locked',
  'mfalockeduser': 'user-mfa-locked'
};

/**
 * Mock password validation
 * TODO: Replace with secure LDAP authentication in production
 * NOTE: Username is input only, LDAP returns cupid/guid for storage
 */
export const validateCredentials = async (username: string, password: string): Promise<MockUserScenario> => {
  // All test users use 'password' as the password
  if (password !== 'password') {
    return { type: 'INVALID_CREDENTIALS' };
  }

  // Lookup user by username (simulates LDAP query)
  const userId = usernameToUserMap[username];
  if (!userId) {
    return { type: 'INVALID_CREDENTIALS' };
  }

  const user = mockUsers[userId];
  if (!user) {
    return { type: 'INVALID_CREDENTIALS' };
  }

  // Return appropriate scenario based on user state
  if (user.isLocked) {
    return { type: 'ACCOUNT_LOCKED', user };
  }

  if (user.mfaLocked) {
    return { type: 'MFA_LOCKED', user };
  }

  return { type: 'SUCCESS', user };
};

/**
 * Get user by ID
 */
export const getUserById = async (userId: string): Promise<User | null> => {
  // TODO: Replace with actual database query in production
  return mockUsers[userId] || null;
};

/**
 * Get user by username (LDAP lookup)
 * NOTE: Username lookup returns cupid/guid, username itself is not stored
 */
export const getUserByUsername = async (username: string): Promise<User | null> => {
  // TODO: Replace with actual LDAP query in production
  const userId = usernameToUserMap[username];
  if (!userId) {
    return null;
  }
  return mockUsers[userId] || null;
};

/**
 * Update user's last seen timestamp
 */
export const updateUserLastSeen = async (userId: string): Promise<void> => {
  // TODO: Replace with actual database update in production
  const user = mockUsers[userId];
  if (user) {
    user.updatedAt = new Date();
  }
};

/**
 * Check if user account is locked
 */
export const isUserLocked = async (userId: string): Promise<boolean> => {
  const user = await getUserById(userId);
  return user?.isLocked || false;
};

/**
 * Check if user MFA is locked
 */
export const isUserMFALocked = async (userId: string): Promise<boolean> => {
  const user = await getUserById(userId);
  return user?.mfaLocked || false;
};

/**
 * Lock user account
 */
export const lockUserAccount = async (userId: string): Promise<void> => {
  // TODO: Replace with actual database update in production
  const user = mockUsers[userId];
  if (user) {
    user.isLocked = true;
    user.updatedAt = new Date();
  }
};

/**
 * Lock user MFA
 */
export const lockUserMFA = async (userId: string): Promise<void> => {
  // TODO: Replace with actual database update in production
  const user = mockUsers[userId];
  if (user) {
    user.mfaLocked = true;
    user.updatedAt = new Date();
  }
};

/**
 * Unlock user account (admin operation)
 */
export const unlockUserAccount = async (userId: string): Promise<void> => {
  // TODO: Replace with actual database update in production
  const user = mockUsers[userId];
  if (user) {
    user.isLocked = false;
    user.updatedAt = new Date();
  }
};

/**
 * Unlock user MFA (time-based or admin operation)
 */
export const unlockUserMFA = async (userId: string): Promise<void> => {
  // TODO: Replace with actual database update in production
  const user = mockUsers[userId];
  if (user) {
    user.mfaLocked = false;
    user.updatedAt = new Date();
  }
};

/**
 * Get user roles for authorization
 */
export const getUserRoles = async (userId: string): Promise<string[]> => {
  const user = await getUserById(userId);
  return user?.roles || [];
};

/**
 * Update user profile information
 */
export const updateUserProfile = async (
  userId: string,
  updates: Partial<Pick<User, 'given_name' | 'family_name' | 'email'>>
): Promise<User | null> => {
  // TODO: Replace with actual database update in production
  const user = mockUsers[userId];
  if (user) {
    Object.assign(user, updates, { updatedAt: new Date() });
    return user;
  }
  return null;
};

/**
 * Get user statistics (for admin/monitoring)
 */
export const getUserStats = async (): Promise<{
  totalUsers: number;
  activeUsers: number;
  lockedUsers: number;
  mfaLockedUsers: number;
}> => {
  // TODO: Replace with actual database aggregation in production
  const users = Object.values(mockUsers);

  return {
    totalUsers: users.length,
    activeUsers: users.filter(u => !u.isLocked && !u.mfaLocked).length,
    lockedUsers: users.filter(u => u.isLocked).length,
    mfaLockedUsers: users.filter(u => u.mfaLocked).length
  };
};