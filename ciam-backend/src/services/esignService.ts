/**
 * eSign Service
 *
 * Handles electronic signature documents and acceptance tracking
 * Uses AuthTransactionRepository for eSign transaction workflow
 */

import { ESignDocument } from '../types';
import { repositories } from '../repositories';

/**
 * Mock eSign document storage
 * In production, these would be stored in a documents table
 */
const mockDocuments: Map<string, ESignDocument> = new Map([
  ['terms-v1-2025', {
    documentId: 'terms-v1-2025',
    title: 'Terms and Conditions',
    content: 'By using this service, you agree to our terms and conditions...',
    version: '1.0',
    mandatory: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01')
  }],
  ['privacy-v1-2025', {
    documentId: 'privacy-v1-2025',
    title: 'Privacy Policy',
    content: 'This privacy policy describes how we collect and use your data...',
    version: '1.0',
    mandatory: false,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01')
  }]
]);

/**
 * Get eSign document by ID
 */
export const getESignDocumentById = async (documentId: string): Promise<ESignDocument | null> => {
  const document = mockDocuments.get(documentId);
  return document || null;
};

/**
 * Check if user needs to sign document
 */
export const needsESign = async (userId: string): Promise<{ required: boolean; documentId?: string; isMandatory?: boolean }> => {
  // Check if user has any pending eSign transactions
  const transactions = await repositories.authTransaction.findESignByContext(userId);

  // Find pending eSign transactions
  const pendingESign = transactions.find(
    (t) => t.transaction_status === 'PENDING' && t.transaction_type === 'ESIGN'
  );

  if (pendingESign) {
    const metadata = pendingESign.metadata as any || {};
    return {
      required: true,
      documentId: metadata.document_id || 'terms-v1-2025',
      isMandatory: metadata.is_mandatory !== false,
    };
  }

  // For demo purposes, return eSign requirement for specific test user
  if (userId === 'user-needs-esign') {
    return {
      required: true,
      documentId: 'terms-v1-2025',
      isMandatory: true
    };
  }

  return { required: false };
};

/**
 * Record eSign acceptance
 */
export const recordESignAcceptance = async (
  userId: string,
  documentId: string,
  contextId: string,
  acceptanceIp?: string,
  acceptanceTimestamp?: string
): Promise<{ success: boolean; acceptedAt: Date }> => {
  const acceptedAt = new Date(acceptanceTimestamp || Date.now());

  // Find the pending eSign transaction
  const transactions = await repositories.authTransaction.findESignByContext(contextId);
  const pendingTransaction = transactions.find(
    (t) => t.transaction_status === 'PENDING' && t.transaction_type === 'ESIGN'
  );

  if (pendingTransaction) {
    // Update transaction metadata with acceptance details
    await repositories.authTransaction.mergeMetadata(pendingTransaction.transaction_id, {
      acceptance_ip: acceptanceIp,
      acceptance_timestamp: acceptedAt.toISOString(),
      accepted: true,
    });

    // Mark transaction as completed
    await repositories.authTransaction.complete(pendingTransaction.transaction_id);

    console.log(`User ${userId} accepted document ${documentId} at ${acceptedAt.toISOString()}`);
  } else {
    // Create new eSign transaction record for acceptance
    const transactionId = `esign-${documentId}-${userId}-${Date.now()}`;
    await repositories.authTransaction.create({
      transaction_id: transactionId,
      context_id: contextId,
      transaction_type: 'ESIGN',
      transaction_status: 'COMPLETED',
      metadata: {
        user_id: userId,
        document_id: documentId,
        acceptance_ip: acceptanceIp,
        acceptance_timestamp: acceptedAt.toISOString(),
        accepted: true,
      },
      created_at: acceptedAt,
      updated_at: acceptedAt,
      expires_at: new Date(acceptedAt.getTime() + 365 * 24 * 60 * 60 * 1000), // 1 year
    });

    console.log(`Created eSign record: User ${userId} accepted document ${documentId}`);
  }

  return {
    success: true,
    acceptedAt
  };
};
