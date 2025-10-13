/**
 * Pending eSign Repository
 * Data access layer for tracking pending eSign requirements
 * Extracted from auth-simple.ts lines 55-61, 68, 205-217
 */

export interface PendingESign {
  username: string;
  documentId: string;
  mandatory: boolean;
  reason: 'first_login' | 'compliance' | 'policy_update';
}

class PendingESignRepository {
  private pending: Map<string, PendingESign>; // key: username

  constructor() {
    this.pending = new Map();
  }

  /**
   * Add pending eSign requirement
   * Extracted from auth-simple.ts lines 205-212
   */
  create(
    username: string,
    documentId: string,
    mandatory: boolean,
    reason: 'first_login' | 'compliance' | 'policy_update'
  ): PendingESign {
    const pendingESign: PendingESign = {
      username,
      documentId,
      mandatory,
      reason
    };

    this.pending.set(username, pendingESign);

    console.log('📝 [PENDING ESIGN] Added:', {
      username,
      documentId,
      mandatory,
      reason
    });

    return pendingESign;
  }

  /**
   * Get pending eSign for a user
   * Extracted from auth-simple.ts lines 215-217
   */
  findByUsername(username: string): PendingESign | null {
    return this.pending.get(username) || null;
  }

  /**
   * Check if user has pending eSign
   */
  hasPending(username: string): boolean {
    return this.pending.has(username);
  }

  /**
   * Complete/remove pending eSign
   */
  delete(username: string): boolean {
    const deleted = this.pending.delete(username);

    if (deleted) {
      console.log('✅ [PENDING ESIGN] Removed:', username);
    }

    return deleted;
  }

  /**
   * Update pending eSign
   */
  update(username: string, updates: Partial<PendingESign>): boolean {
    const pendingESign = this.findByUsername(username);

    if (!pendingESign) {
      return false;
    }

    Object.assign(pendingESign, updates);
    this.pending.set(username, pendingESign);

    console.log('🔄 [PENDING ESIGN] Updated:', { username, updates });

    return true;
  }

  /**
   * Get all pending eSigns (for debugging)
   */
  getAll(): PendingESign[] {
    return Array.from(this.pending.values());
  }

  /**
   * Get count of pending eSigns
   */
  count(): number {
    return this.pending.size;
  }

  /**
   * Find all pending eSigns for a specific document
   */
  findByDocument(documentId: string): PendingESign[] {
    const documentPending: PendingESign[] = [];

    for (const pendingESign of this.pending.values()) {
      if (pendingESign.documentId === documentId) {
        documentPending.push(pendingESign);
      }
    }

    return documentPending;
  }

  /**
   * Clear all pending eSigns (for testing)
   */
  clear(): void {
    this.pending.clear();
    console.log('🧹 [PENDING ESIGN] Cleared all pending');
  }
}

// Export singleton instance
export const pendingESignRepository = new PendingESignRepository();
