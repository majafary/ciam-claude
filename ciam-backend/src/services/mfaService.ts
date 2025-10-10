/**
 * MFA Service
 *
 * Handles MFA challenges (SMS, Voice, Push) using AuthTransactionRepository
 * Refactored to use repository pattern with database persistence
 */

import { v4 as uuidv4 } from 'uuid';
import { MFATransaction, MFAChallengeStatus } from '../types';
import { repositories } from '../repositories';
import { isMockDatabase } from '../database/kysely';

/**
 * Type mapping: AuthTransaction (DB) → MFATransaction (Service)
 */
const toMFATransaction = (dbTransaction: any): MFATransaction => {
  const metadata = dbTransaction.metadata || {};

  return {
    transactionId: dbTransaction.transaction_id,
    contextId: dbTransaction.context_id,
    userId: metadata.user_id || '',
    sessionId: metadata.session_id,
    method: metadata.method || 'sms',
    status: dbTransaction.transaction_status as MFAChallengeStatus,
    challengeId: metadata.challenge_id,
    otp: metadata.otp,
    displayNumber: metadata.display_number,
    selectedNumber: metadata.selected_number,
    createdAt: dbTransaction.created_at,
    expiresAt: dbTransaction.expires_at,
    updatedAt: dbTransaction.updated_at,
  };
};

/**
 * Invalidate all pending transactions for a given context
 * CRITICAL: When user starts new MFA attempt, previous attempts must be invalidated
 */
export const invalidatePendingTransactions = async (contextId: string): Promise<number> => {
  const count = await repositories.authTransaction.expirePendingByContext(contextId);
  console.log(`Invalidated ${count} pending transactions for context ${contextId}`);
  return count;
};

/**
 * Create MFA transaction
 */
export const createMFATransaction = async (
  contextId: string,
  userId: string,
  method: 'sms' | 'voice' | 'push',
  sessionId?: string,
  mfaOptionId?: number
): Promise<MFATransaction & { displayNumber?: number }> => {
  // CRITICAL: Invalidate all pending transactions for this context before creating new one
  await invalidatePendingTransactions(contextId);

  const transactionId = `mfa-${method}-${userId}-${Date.now()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 2 * 60 * 1000); // 2 minutes

  const isOTPMethod = method === 'sms' || method === 'voice';
  const displayNumber = method === 'push' ? Math.floor(1 + Math.random() * 9) : undefined;

  // Prepare metadata
  const metadata = {
    user_id: userId,
    session_id: sessionId,
    method,
    challenge_id: isOTPMethod ? `ch-${uuidv4()}` : undefined,
    otp: isOTPMethod ? '1234' : undefined, // Mock OTP for testing
    display_number: displayNumber,
    mfa_option_id: mfaOptionId,
  };

  // Create transaction in database
  const dbTransaction = await repositories.authTransaction.create({
    transaction_id: transactionId,
    context_id: contextId,
    transaction_type: 'MFA',
    transaction_status: 'PENDING',
    metadata,
    created_at: now,
    updated_at: now,
    expires_at: expiresAt,
  });

  console.log(`Created ${method} transaction ${transactionId} for context ${contextId}`);

  // For push notifications, simulate automatic approval/rejection based on user type
  if (method === 'push' && isMockDatabase()) {
    simulatePushResponse(transactionId, userId);
  }

  const transaction = toMFATransaction(dbTransaction);
  return { ...transaction, displayNumber };
};

/**
 * Get MFA transaction by ID
 */
export const getMFATransaction = async (transactionId: string): Promise<MFATransaction | null> => {
  const dbTransaction = await repositories.authTransaction.findByTransactionId(transactionId);

  if (!dbTransaction) {
    return null;
  }

  // Check if transaction is expired
  if (dbTransaction.expires_at < new Date() && dbTransaction.transaction_status === 'PENDING') {
    await repositories.authTransaction.expire(transactionId);
    dbTransaction.transaction_status = 'EXPIRED';
    dbTransaction.updated_at = new Date();
  }

  return toMFATransaction(dbTransaction);
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
    await repositories.authTransaction.expire(transactionId);
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
    await repositories.authTransaction.approve(transactionId);
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

  // Check if transaction was invalidated
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
    await repositories.authTransaction.expire(transactionId);
    transaction.status = 'EXPIRED';
    transaction.updatedAt = new Date();
    return {
      success: false,
      transaction,
      error: 'Transaction has expired'
    };
  }

  // Update status
  if (result === 'APPROVED') {
    await repositories.authTransaction.approve(transactionId);
  } else {
    await repositories.authTransaction.reject(transactionId);
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
  const dbTransaction = await repositories.authTransaction.findByTransactionId(transactionId);

  if (dbTransaction && dbTransaction.transaction_status === 'PENDING') {
    await repositories.authTransaction.expire(transactionId);
    return true;
  }

  return false;
};

/**
 * Clean up expired MFA transactions
 */
export const cleanupExpiredMFATransactions = async (): Promise<number> => {
  const count = await repositories.authTransaction.expireOldPending();
  console.log(`Cleaned up ${count} expired MFA transactions`);
  return count;
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
  const stats = await repositories.authTransaction.getStats();

  return {
    totalTransactions: stats.byType.MFA,
    pendingTransactions: stats.byStatus.PENDING,
    approvedTransactions: stats.byStatus.APPROVED,
    rejectedTransactions: stats.byStatus.REJECTED,
    expiredTransactions: stats.byStatus.EXPIRED,
    otpTransactions: 0, // Would need to query metadata for this
    pushTransactions: 0, // Would need to query metadata for this
  };
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
    await repositories.authTransaction.expire(transactionId);
    transaction.status = 'EXPIRED';
    transaction.updatedAt = new Date();
    return {
      success: false,
      transaction,
      error: 'Transaction has expired'
    };
  }

  // Store selected number in metadata and approve
  await repositories.authTransaction.mergeMetadata(transactionId, {
    selected_number: selectedNumber,
  });
  await repositories.authTransaction.approve(transactionId);

  transaction.status = 'APPROVED';
  transaction.selectedNumber = selectedNumber;
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
  const dbTransactions = await repositories.authTransaction.findMFAByContext(userId);

  return dbTransactions
    .filter(t => t.transaction_status === 'PENDING')
    .map(toMFATransaction);
};

/**
 * Cancel all pending MFA transactions for a user
 */
export const cancelUserMFATransactions = async (userId: string): Promise<number> => {
  // This would need to be implemented by finding all user's contexts first
  // For now, return 0 as this is not a critical function
  console.warn('cancelUserMFATransactions not fully implemented with repositories');
  return 0;
};

/**
 * Simulate push notification response for demo purposes
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
    const dbTransaction = await repositories.authTransaction.findByTransactionId(transactionId);

    if (dbTransaction && dbTransaction.transaction_status === 'PENDING') {
      const metadata = dbTransaction.metadata as any || {};

      if (shouldApprove) {
        await repositories.authTransaction.approve(transactionId);
        await repositories.authTransaction.mergeMetadata(transactionId, {
          selected_number: metadata.display_number, // Correct match
        });
      } else {
        await repositories.authTransaction.reject(transactionId);
        // Wrong number selected
        const wrongNumber = metadata.display_number === 9 ? 1 : (metadata.display_number || 0) + 1;
        await repositories.authTransaction.mergeMetadata(transactionId, {
          selected_number: wrongNumber,
        });
      }

      console.log(`Push ${shouldApprove ? 'approved' : 'rejected'} for transaction ${transactionId}`);
    }
  }, delay);
};
