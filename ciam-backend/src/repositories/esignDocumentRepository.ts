/**
 * eSign Document Repository
 * Data access layer for eSign document storage
 * Extracted from auth-simple.ts lines 37-45, 66, 76-105
 */

export interface ESignDocument {
  documentId: string;
  title: string;
  content: string;
  version: string;
  mandatory: boolean;
  createdAt: Date;
}

class ESignDocumentRepository {
  private documents: Map<string, ESignDocument>;

  constructor() {
    this.documents = new Map();
    this.initializeDocuments();
  }

  /**
   * Initialize mock eSign documents
   * Extracted from auth-simple.ts lines 76-105
   */
  private initializeDocuments(): void {
    this.documents.set('terms-v1-2025', {
      documentId: 'terms-v1-2025',
      title: 'Terms of Service - 2025',
      content: `
        <h1>Terms of Service Agreement</h1>
        <p>Last Updated: January 1, 2025</p>

        <h2>1. Acceptance of Terms</h2>
        <p>By accessing and using our services, you accept and agree to be bound by the terms and provision of this agreement.</p>

        <h2>2. Use License</h2>
        <p>Permission is granted to temporarily access our services for personal, non-commercial use only.</p>

        <h2>3. Privacy Policy</h2>
        <p>Your use of our service is also governed by our Privacy Policy.</p>

        <h2>4. Account Security</h2>
        <p>You are responsible for maintaining the security of your account and password.</p>

        <p><strong>By clicking "Accept", you agree to these terms and conditions.</strong></p>
      `,
      version: 'v1.0',
      mandatory: true,
      createdAt: new Date('2025-01-01')
    });

    console.log('📄 [ESIGN DOCUMENT] Initialized documents');
  }

  /**
   * Find document by ID
   */
  findById(documentId: string): ESignDocument | null {
    return this.documents.get(documentId) || null;
  }

  /**
   * Get all documents
   */
  getAll(): ESignDocument[] {
    return Array.from(this.documents.values());
  }

  /**
   * Create document
   */
  create(document: ESignDocument): ESignDocument {
    this.documents.set(document.documentId, document);

    console.log('📄 [ESIGN DOCUMENT] Created:', {
      documentId: document.documentId,
      title: document.title
    });

    return document;
  }

  /**
   * Update document
   */
  update(documentId: string, updates: Partial<ESignDocument>): boolean {
    const document = this.findById(documentId);

    if (!document) {
      return false;
    }

    Object.assign(document, updates);
    this.documents.set(documentId, document);

    console.log('📄 [ESIGN DOCUMENT] Updated:', { documentId, updates });

    return true;
  }

  /**
   * Delete document
   */
  delete(documentId: string): boolean {
    const deleted = this.documents.delete(documentId);

    if (deleted) {
      console.log('🗑️ [ESIGN DOCUMENT] Deleted:', documentId);
    }

    return deleted;
  }

  /**
   * Check if document exists
   */
  exists(documentId: string): boolean {
    return this.documents.has(documentId);
  }

  /**
   * Clear all documents (for testing)
   */
  clear(): void {
    this.documents.clear();
    console.log('🧹 [ESIGN DOCUMENT] Cleared all documents');
  }

  /**
   * Re-initialize documents (after clear)
   */
  reinitialize(): void {
    this.initializeDocuments();
  }
}

// Export singleton instance
export const esignDocumentRepository = new ESignDocumentRepository();
