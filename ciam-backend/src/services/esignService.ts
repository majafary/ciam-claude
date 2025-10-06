import { ESignDocument } from '../types';

/**
 * Mock eSign document storage
 * TODO: Replace with actual database in production
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
  // Mock logic - in production this would check database
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
  acceptanceIp?: string,
  acceptanceTimestamp?: string
): Promise<{ success: boolean; acceptedAt: Date }> => {
  // TODO: Store in database in production
  const acceptedAt = new Date();

  // Mock storage
  console.log(`User ${userId} accepted document ${documentId} at ${acceptedAt.toISOString()}`);

  return {
    success: true,
    acceptedAt
  };
};
