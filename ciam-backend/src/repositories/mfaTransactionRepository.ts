/**
 * MFA Transaction Repository
 * Data access layer for MFA transaction storage
 * Extracted from auth-simple.ts lines 8-15, 63
 */

export interface MFATransaction {
  transaction_id: string;
  username: string;
  createdAt: number;
  method?: 'sms' | 'voice' | 'push';
  deviceFingerprint?: string; // Store device fingerprint from login for device trust check during MFA verify
}

class MFATransactionRepository {
  private transactions: Map<string, MFATransaction>;

  constructor() {
    this.transactions = new Map();
  }

  /**
   * Create a new MFA transaction
   */
  create(
    transaction_id: string,
    username: string,
    method?: 'sms' | 'voice' | 'push',
    deviceFingerprint?: string
  ): MFATransaction {
    const transaction: MFATransaction = {
      transaction_id,
      username,
      createdAt: Date.now(),
      method,
      deviceFingerprint
    };

    this.transactions.set(transaction_id, transaction);

    console.log('📝 [MFA TRANSACTION] Created:', {
      transaction_id,
      username,
      method,
      deviceFingerprint
    });

    return transaction;
  }

  /**
   * Find transaction by ID
   */
  findById(transaction_id: string): MFATransaction | null {
    return this.transactions.get(transaction_id) || null;
  }

  /**
   * Delete transaction (one-time use security)
   */
  delete(transaction_id: string): boolean {
    const deleted = this.transactions.delete(transaction_id);

    if (deleted) {
      console.log('🗑️ [MFA TRANSACTION] Deleted:', transaction_id);
    }

    return deleted;
  }

  /**
   * Invalidate transaction (alias for delete for clarity)
   */
  invalidate(transaction_id: string): boolean {
    return this.delete(transaction_id);
  }

  /**
   * Update transaction method
   */
  updateMethod(transaction_id: string, method: 'sms' | 'voice' | 'push'): boolean {
    const transaction = this.findById(transaction_id);

    if (!transaction) {
      return false;
    }

    transaction.method = method;
    this.transactions.set(transaction_id, transaction);

    console.log('🔄 [MFA TRANSACTION] Updated method:', { transaction_id, method });

    return true;
  }

  /**
   * Check if transaction exists
   */
  exists(transaction_id: string): boolean {
    return this.transactions.has(transaction_id);
  }

  /**
   * Get all transactions (for debugging)
   */
  getAll(): MFATransaction[] {
    return Array.from(this.transactions.values());
  }

  /**
   * Clear all transactions (for testing)
   */
  clear(): void {
    this.transactions.clear();
    console.log('🧹 [MFA TRANSACTION] Cleared all transactions');
  }

  /**
   * Clean up expired transactions (older than 15 minutes)
   */
  cleanupExpired(): number {
    const now = Date.now();
    const expiryTime = 15 * 60 * 1000; // 15 minutes
    let cleaned = 0;

    for (const [transaction_id, transaction] of this.transactions.entries()) {
      if (now - transaction.createdAt > expiryTime) {
        this.transactions.delete(transaction_id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 [MFA TRANSACTION] Cleaned up ${cleaned} expired transactions`);
    }

    return cleaned;
  }
}

// Export singleton instance
export const mfaTransactionRepository = new MFATransactionRepository();

// Set up periodic cleanup (every 5 minutes)
setInterval(() => {
  mfaTransactionRepository.cleanupExpired();
}, 5 * 60 * 1000);
