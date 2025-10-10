import { Request, Response } from 'express';
import { getMFATransaction } from '../services/mfaService';
import { handleInternalError, sendErrorResponse, createApiError } from '../utils/errors';
import { logAuthEvent } from '../utils/logger';

/**
 * Mock device trust storage for development
 * TODO: Replace with actual database in production
 */
const trustedDevices: Map<string, { userId: string; deviceFingerprint: string; trustedAt: Date }> = new Map();

/**
 * Bind/trust device endpoint
 * POST /auth/device/bind
 */
export const bindDevice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { transaction_id } = req.body;

    if (!transaction_id) {
      sendErrorResponse(res, 400, createApiError(
        'BAD_REQUEST',
        'transaction_id is required'
      ));
      return;
    }

    logAuthEvent('device_bind_attempt', undefined, {
      transactionId: transaction_id,
      ip: req.ip
    });

    // Get MFA transaction to retrieve user and device info
    const transaction = await getMFATransaction(transaction_id);

    if (!transaction) {
      sendErrorResponse(res, 404, createApiError(
        'NOT_FOUND',
        'Transaction not found'
      ));
      return;
    }

    // Check if transaction is completed successfully
    if (transaction.status !== 'APPROVED') {
      sendErrorResponse(res, 400, createApiError(
        'BAD_REQUEST',
        'Transaction must be approved before device can be bound'
      ));
      return;
    }

    const userId = transaction.userId;
    const deviceKey = `${userId}:${transaction_id}`;

    // Check if device is already trusted
    const alreadyTrusted = trustedDevices.has(deviceKey);

    if (!alreadyTrusted) {
      // Trust the device
      trustedDevices.set(deviceKey, {
        userId,
        deviceFingerprint: transaction_id, // Using transaction_id as device identifier
        trustedAt: new Date()
      });

      logAuthEvent('device_bound', userId, {
        transactionId: transaction_id,
        ip: req.ip
      });
    } else {
      logAuthEvent('device_already_trusted', userId, {
        transactionId: transaction_id,
        ip: req.ip
      });
    }

    const trustedAt = trustedDevices.get(deviceKey)?.trustedAt || new Date();

    res.json({
      success: true,
      transaction_id,
      trusted_at: trustedAt.toISOString(),
      already_trusted: alreadyTrusted
    });
  } catch (error) {
    logAuthEvent('device_bind_failure', undefined, {
      transactionId: req.body.transaction_id,
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip
    });

    handleInternalError(res, error instanceof Error ? error : new Error('Device binding failed'));
  }
};

/**
 * Check if device is trusted for user
 */
export const isDeviceTrusted = async (userId: string, deviceFingerprint: string): Promise<boolean> => {
  const deviceKey = `${userId}:${deviceFingerprint}`;
  return trustedDevices.has(deviceKey);
};
