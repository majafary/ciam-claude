/**
 * eSign Acceptance Repository
 * Data access layer for eSign acceptance tracking
 * Extracted from auth-simple.ts lines 47-53, 67, 220-233, 236-239
 */

export interface ESignAcceptance {
  documentId: string;
  username: string;
  acceptedAt: Date;
  ip?: string;
}

class ESignAcceptanceRepository {
  private acceptances: Map<string, ESignAcceptance>; // key: username-documentId

  constructor() {
    this.acceptances = new Map();
  }

  /**
   * Record eSign acceptance
   * Extracted from auth-simple.ts lines 220-233
   */
  create(
    username: string,
    documentId: string,
    ip?: string
  ): ESignAcceptance {
    const key = `${username}-${documentId}`;

    const acceptance: ESignAcceptance = {
      documentId,
      username,
      acceptedAt: new Date(),
      ip
    };

    this.acceptances.set(key, acceptance);

    console.log('📝 [ESIGN ACCEPTANCE] Recorded:', {
      username,
      documentId,
      ip
    });

    return acceptance;
  }

  /**
   * Check if user has accepted a document
   * Extracted from auth-simple.ts lines 236-239
   */
  hasAccepted(username: string, documentId: string): boolean {
    const key = `${username}-${documentId}`;
    return this.acceptances.has(key);
  }

  /**
   * Find acceptance by username and document ID
   */
  findByUsernameAndDocument(
    username: string,
    documentId: string
  ): ESignAcceptance | null {
    const key = `${username}-${documentId}`;
    return this.acceptances.get(key) || null;
  }

  /**
   * Find all acceptances for a user
   */
  findByUsername(username: string): ESignAcceptance[] {
    const userAcceptances: ESignAcceptance[] = [];

    for (const [key, acceptance] of this.acceptances.entries()) {
      if (acceptance.username === username) {
        userAcceptances.push(acceptance);
      }
    }

    return userAcceptances;
  }

  /**
   * Find all acceptances for a document
   */
  findByDocument(documentId: string): ESignAcceptance[] {
    const documentAcceptances: ESignAcceptance[] = [];

    for (const [key, acceptance] of this.acceptances.entries()) {
      if (acceptance.documentId === documentId) {
        documentAcceptances.push(acceptance);
      }
    }

    return documentAcceptances;
  }

  /**
   * Delete acceptance
   */
  delete(username: string, documentId: string): boolean {
    const key = `${username}-${documentId}`;
    const deleted = this.acceptances.delete(key);

    if (deleted) {
      console.log('🗑️ [ESIGN ACCEPTANCE] Deleted:', { username, documentId });
    }

    return deleted;
  }

  /**
   * Delete all acceptances for a user
   */
  deleteAllForUser(username: string): number {
    let deleted = 0;

    for (const [key, acceptance] of this.acceptances.entries()) {
      if (acceptance.username === username) {
        this.acceptances.delete(key);
        deleted++;
      }
    }

    if (deleted > 0) {
      console.log(`🗑️ [ESIGN ACCEPTANCE] Deleted ${deleted} acceptances for user:`, username);
    }

    return deleted;
  }

  /**
   * Get all acceptances (for debugging)
   */
  getAll(): ESignAcceptance[] {
    return Array.from(this.acceptances.values());
  }

  /**
   * Clear all acceptances (for testing)
   */
  clear(): void {
    this.acceptances.clear();
    console.log('🧹 [ESIGN ACCEPTANCE] Cleared all acceptances');
  }
}

// Export singleton instance
export const esignAcceptanceRepository = new ESignAcceptanceRepository();
