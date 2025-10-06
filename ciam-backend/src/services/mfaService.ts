import { v4 as uuidv4 } from 'uuid';
import { MFATransaction, MFAChallengeStatus } from '../types';

/**
 * Mock MFA transaction storage for development
 * TODO: Replace with actual database (Redis/PostgreSQL) in production
 */
const mockTransactions: Map<string, MFATransaction> = new Map();

/**
 * Create MFA transaction
 */
export const createMFATransaction = async (
  userId: string,
  method: 'otp' | 'push',
  sessionId?: string,
  mfaOptionId?: number
): Promise<MFATransaction & { displayNumber?: number }> => {
  const transactionId = `tx-${uuidv4()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes

  const transaction: MFATransaction = {
    transactionId,
    userId,
    sessionId,
    method,
    status: 'PENDING',
    challengeId: method === 'otp' ? `ch-${uuidv4()}` : undefined,
    otp: method === 'otp' ? generateOTP() : undefined,
    createdAt: now,
    expiresAt,
    updatedAt: now
  };

  // For push notifications, generate a display number for matching
  const displayNumber = method === 'push' ? Math.floor(10 + Math.random() * 90) : undefined;

  // TODO: Store in database in production
  mockTransactions.set(transactionId, transaction);

  // For push notifications, simulate automatic approval after delay
  if (method === 'push') {
    simulatePushResponse(transactionId);
  }

  return { ...transaction, displayNumber };
};

/**
 * Get MFA transaction by ID
 */
export const getMFATransaction = async (transactionId: string): Promise<MFATransaction | null> => {
  // TODO: Replace with actual database query in production
  const transaction = mockTransactions.get(transactionId);

  if (!transaction) {
    return null;
  }

  // Check if transaction is expired
  if (transaction.expiresAt < new Date() && transaction.status === 'PENDING') {
    transaction.status = 'EXPIRED';
    transaction.updatedAt = new Date();
  }

  return transaction;
};

/**
 * Verify OTP
 */
export const verifyOTP = async (transactionId: string, providedOTP: string): Promise<{
  success: boolean;
  transaction: MFATransaction | null;
  error?: string;
}> => {
  const transaction = await getMFATransaction(transactionId);

  if (!transaction) {
    return {
      success: false,
      transaction: null,
      error: 'Transaction not found'
    };
  }

  if (transaction.status !== 'PENDING') {
    return {
      success: false,
      transaction,
      error: 'Transaction is not pending'
    };
  }

  if (transaction.expiresAt < new Date()) {
    transaction.status = 'EXPIRED';
    transaction.updatedAt = new Date();
    return {
      success: false,
      transaction,
      error: 'Transaction has expired'
    };
  }

  // Check if user's MFA is locked (for mfalockeduser scenario)
  if (transactionId.includes('mfalocked')) {
    return {
      success: false,
      transaction,
      error: 'MFA is locked'
    };
  }

  // Verify OTP - for testing, correct OTP is "1234"
  const isValidOTP = providedOTP === '1234';

  if (isValidOTP) {
    transaction.status = 'APPROVED';
    transaction.updatedAt = new Date();
    return {
      success: true,
      transaction
    };
  } else {
    // Don't mark as rejected immediately, allow multiple attempts
    return {
      success: false,
      transaction,
      error: 'Invalid OTP'
    };
  }
};

/**
 * Verify push notification result
 */
export const verifyPushResult = async (
  transactionId: string,
  result: 'APPROVED' | 'REJECTED'
): Promise<{
  success: boolean;
  transaction: MFATransaction | null;
  error?: string;
}> => {
  const transaction = await getMFATransaction(transactionId);

  if (!transaction) {
    return {
      success: false,
      transaction: null,
      error: 'Transaction not found'
    };
  }

  if (transaction.method !== 'push') {
    return {
      success: false,
      transaction,
      error: 'Transaction is not a push transaction'
    };
  }

  if (transaction.status !== 'PENDING') {
    return {
      success: false,
      transaction,
      error: 'Transaction is not pending'
    };
  }

  if (transaction.expiresAt < new Date()) {
    transaction.status = 'EXPIRED';
    transaction.updatedAt = new Date();
    return {
      success: false,
      transaction,
      error: 'Transaction has expired'
    };
  }

  transaction.status = result;
  transaction.updatedAt = new Date();

  return {
    success: result === 'APPROVED',
    transaction
  };
};

/**
 * Get OTP for testing purposes (mock endpoint)
 */
export const getOTPForTesting = async (transactionId: string): Promise<string | null> => {
  // TODO: Remove this function in production - it's only for testing
  const transaction = await getMFATransaction(transactionId);

  if (!transaction || transaction.method !== 'otp') {
    return null;
  }

  return transaction.otp || null;
};

/**
 * Expire MFA transaction
 */
export const expireMFATransaction = async (transactionId: string): Promise<boolean> => {
  // TODO: Replace with actual database update in production
  const transaction = mockTransactions.get(transactionId);

  if (transaction && transaction.status === 'PENDING') {
    transaction.status = 'EXPIRED';
    transaction.updatedAt = new Date();
    return true;
  }

  return false;
};

/**
 * Clean up expired MFA transactions
 */
export const cleanupExpiredMFATransactions = async (): Promise<number> => {
  // TODO: Replace with actual database cleanup in production
  const now = new Date();
  let cleanedCount = 0;

  for (const [transactionId, transaction] of mockTransactions.entries()) {
    if (transaction.expiresAt < now) {
      if (transaction.status === 'PENDING') {
        transaction.status = 'EXPIRED';
        transaction.updatedAt = now;
      }
      // Could delete very old transactions
      if (now.getTime() - transaction.expiresAt.getTime() > 24 * 60 * 60 * 1000) {
        mockTransactions.delete(transactionId);
        cleanedCount++;
      }
    }
  }

  return cleanedCount;
};

/**
 * Get MFA statistics
 */
export const getMFAStats = async (): Promise<{
  totalTransactions: number;
  pendingTransactions: number;
  approvedTransactions: number;
  rejectedTransactions: number;
  expiredTransactions: number;
  otpTransactions: number;
  pushTransactions: number;
}> => {
  // TODO: Replace with actual database aggregation in production
  const transactions = Array.from(mockTransactions.values());

  return {
    totalTransactions: transactions.length,
    pendingTransactions: transactions.filter(t => t.status === 'PENDING').length,
    approvedTransactions: transactions.filter(t => t.status === 'APPROVED').length,
    rejectedTransactions: transactions.filter(t => t.status === 'REJECTED').length,
    expiredTransactions: transactions.filter(t => t.status === 'EXPIRED').length,
    otpTransactions: transactions.filter(t => t.method === 'otp').length,
    pushTransactions: transactions.filter(t => t.method === 'push').length
  };
};

/**
 * Generate 6-digit OTP
 */
const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Simulate push notification response for demo purposes
 */
const simulatePushResponse = (transactionId: string): void => {
  // Simulate push approval after 3-5 seconds
  const delay = 3000 + Math.random() * 2000; // 3-5 seconds

  setTimeout(async () => {
    const transaction = mockTransactions.get(transactionId);
    if (transaction && transaction.status === 'PENDING') {
      // 90% approval rate for demo
      const approved = Math.random() > 0.1;
      transaction.status = approved ? 'APPROVED' : 'REJECTED';
      transaction.updatedAt = new Date();
    }
  }, delay);
};

/**
 * Approve push notification with number matching
 */
export const approvePushWithNumber = async (
  transactionId: string,
  selectedNumber: number
): Promise<{
  success: boolean;
  transaction: MFATransaction | null;
  error?: string;
}> => {
  const transaction = await getMFATransaction(transactionId);

  if (!transaction) {
    return {
      success: false,
      transaction: null,
      error: 'Transaction not found'
    };
  }

  if (transaction.method !== 'push') {
    return {
      success: false,
      transaction,
      error: 'Transaction is not a push transaction'
    };
  }

  if (transaction.status !== 'PENDING') {
    return {
      success: false,
      transaction,
      error: 'Transaction is not pending'
    };
  }

  if (transaction.expiresAt < new Date()) {
    transaction.status = 'EXPIRED';
    transaction.updatedAt = new Date();
    return {
      success: false,
      transaction,
      error: 'Transaction has expired'
    };
  }

  // In a real implementation, you would validate the selected number matches the display number
  // For now, we'll accept any valid number
  transaction.status = 'APPROVED';
  transaction.updatedAt = new Date();

  return {
    success: true,
    transaction
  };
};

/**
 * Check if transaction belongs to user
 */
export const isTransactionOwner = async (transactionId: string, userId: string): Promise<boolean> => {
  const transaction = await getMFATransaction(transactionId);
  return transaction?.userId === userId;
};

/**
 * Get user's active MFA transactions
 */
export const getUserMFATransactions = async (userId: string): Promise<MFATransaction[]> => {
  // TODO: Replace with actual database query in production
  const userTransactions: MFATransaction[] = [];

  for (const transaction of mockTransactions.values()) {
    if (transaction.userId === userId && transaction.status === 'PENDING') {
      userTransactions.push(transaction);
    }
  }

  return userTransactions;
};

/**
 * Cancel all pending MFA transactions for a user
 */
export const cancelUserMFATransactions = async (userId: string): Promise<number> => {
  // TODO: Replace with actual database update in production
  let cancelledCount = 0;

  for (const transaction of mockTransactions.values()) {
    if (transaction.userId === userId && transaction.status === 'PENDING') {
      transaction.status = 'EXPIRED';
      transaction.updatedAt = new Date();
      cancelledCount++;
    }
  }

  return cancelledCount;
};