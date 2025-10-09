import { v4 as uuidv4 } from 'uuid';
import { MFATransaction, MFAChallengeStatus } from '../types';

/**
 * Mock MFA transaction storage for development
 * TODO: Replace with actual database (Redis/PostgreSQL) in production
 */
const mockTransactions: Map<string, MFATransaction> = new Map();

/**
 * Invalidate all pending transactions for a given context
 * Critical for v3: When user starts new MFA attempt, previous attempts must be invalidated
 */
export const invalidatePendingTransactions = async (contextId: string): Promise<number> => {
  let invalidatedCount = 0;

  for (const [txId, tx] of mockTransactions.entries()) {
    if (tx.contextId === contextId && tx.status === 'PENDING') {
      tx.status = 'EXPIRED';
      tx.updatedAt = new Date();
      invalidatedCount++;
      console.log(`Invalidated transaction ${txId} for context ${contextId}`);
    }
  }

  return invalidatedCount;
};

/**
 * Create MFA transaction (v3 with context_id support)
 */
export const createMFATransaction = async (
  contextId: string,
  userId: string,
  method: 'sms' | 'voice' | 'push',
  sessionId?: string,
  mfaOptionId?: number
): Promise<MFATransaction & { displayNumber?: number }> => {
  // V3 CRITICAL: Invalidate all pending transactions for this context before creating new one
  await invalidatePendingTransactions(contextId);

  const transactionId = `mfa-${method}-${userId}-${Date.now()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 2 * 60 * 1000); // 2 minutes (v3 spec)

  const isOTPMethod = method === 'sms' || method === 'voice';

  const transaction: MFATransaction = {
    transactionId,
    contextId, // V3: Link to context
    userId,
    sessionId,
    method,
    status: 'PENDING',
    challengeId: isOTPMethod ? `ch-${uuidv4()}` : undefined,
    otp: isOTPMethod ? '1234' : undefined, // Mock OTP for testing
    createdAt: now,
    expiresAt,
    updatedAt: now
  };

  // For push notifications, generate a display number for matching
  const displayNumber = method === 'push' ? Math.floor(1 + Math.random() * 9) : undefined;
  if (displayNumber) {
    transaction.displayNumber = displayNumber;
  }

  // TODO: Store in database in production
  mockTransactions.set(transactionId, transaction);

  console.log(`Created ${method} transaction ${transactionId} for context ${contextId}`);

  // For push notifications, simulate automatic approval/rejection based on user type
  if (method === 'push') {
    simulatePushResponse(transactionId, userId);
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
 * Verify push notification result (deprecated in v3 - replaced by POST /mfa/transaction/:id)
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

  // V3: Check if transaction was invalidated
  if (transaction.status === 'EXPIRED') {
    return {
      success: false,
      transaction,
      error: 'Transaction was invalidated (new attempt started)'
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

  if (!transaction) {
    return null;
  }

  const isOTPMethod = transaction.method === 'sms' || transaction.method === 'voice';
  if (!isOTPMethod) {
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
    otpTransactions: transactions.filter(t => t.method === 'sms' || t.method === 'voice').length,
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
 * Simulate push notification response for demo purposes (v3 with user-based behavior)
 */
const simulatePushResponse = (transactionId: string, userId: string): void => {
  // Determine behavior based on test user
  let delay: number;
  let shouldApprove: boolean;

  if (userId.includes('pushfail')) {
    // pushfail: auto-reject after 7s (wrong number selected)
    delay = 7000;
    shouldApprove = false;
  } else if (userId.includes('pushexpired')) {
    // pushexpired: never resolves (stays PENDING)
    return; // Don't set timeout - leave pending forever
  } else {
    // mfauser: auto-approve after 5s (correct number selected)
    delay = 5000;
    shouldApprove = true;
  }

  setTimeout(async () => {
    const transaction = mockTransactions.get(transactionId);
    if (transaction && transaction.status === 'PENDING') {
      if (shouldApprove) {
        transaction.status = 'APPROVED';
        transaction.selectedNumber = transaction.displayNumber; // Correct match
      } else {
        transaction.status = 'REJECTED';
        // Wrong number selected
        transaction.selectedNumber = transaction.displayNumber ?
          (transaction.displayNumber === 9 ? 1 : transaction.displayNumber + 1) :
          3;
      }
      transaction.updatedAt = new Date();
      console.log(`Push ${shouldApprove ? 'approved' : 'rejected'} for transaction ${transactionId}`);
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