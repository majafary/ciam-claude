import { User, UserScenario, MockUserScenario } from '../types';

/**
 * Mock user database for development
 * TODO: Replace with actual database implementation in production
 */
const mockUsers: Record<string, User> = {
  'user-123': {
    id: 'user-123',
    username: 'testuser',
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
    id: 'user-locked',
    username: 'userlockeduser',
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
    id: 'user-mfa-locked',
    username: 'mfalockeduser',
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
 * Mock password validation
 * TODO: Replace with secure password hashing (bcrypt) in production
 */
export const validateCredentials = async (username: string, password: string): Promise<MockUserScenario> => {
  // All test users use 'password' as the password
  if (password !== 'password') {
    return { type: 'INVALID_CREDENTIALS' };
  }

  switch (username) {
    case 'testuser':
      return {
        type: 'SUCCESS',
        user: mockUsers['user-123']
      };

    case 'userlockeduser':
      return {
        type: 'ACCOUNT_LOCKED',
        user: mockUsers['user-locked']
      };

    case 'mfalockeduser':
      return {
        type: 'MFA_LOCKED',
        user: mockUsers['user-mfa-locked']
      };

    default:
      return { type: 'INVALID_CREDENTIALS' };
  }
};

/**
 * Get user by ID
 */
export const getUserById = async (userId: string): Promise<User | null> => {
  // TODO: Replace with actual database query in production
  return mockUsers[userId] || null;
};

/**
 * Get user by username
 */
export const getUserByUsername = async (username: string): Promise<User | null> => {
  // TODO: Replace with actual database query in production
  const user = Object.values(mockUsers).find(u => u.username === username);
  return user || null;
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