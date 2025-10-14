import { Request, Response } from 'express';
import { getMFATransaction } from '../services/mfaService';
import { trustDevice, isDeviceTrusted as checkDeviceTrusted } from '../services/deviceService';
import { getUserById } from '../services/userService';
import { handleInternalError, sendErrorResponse, createApiError } from '../utils/errors';
import { logAuthEvent } from '../utils/logger';

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
    const deviceFingerprint = transaction_id; // Using transaction_id as device identifier

    // Get user to obtain guid
    const user = await getUserById(userId);
    if (!user) {
      handleInternalError(res, new Error('User not found'));
      return;
    }

    // Check if device is already trusted
    const alreadyTrusted = await checkDeviceTrusted(userId, deviceFingerprint);

    // Trust the device (will update last_used_at if already exists)
    const device = await trustDevice(userId, user.guid, deviceFingerprint, undefined, 30);

    if (!alreadyTrusted) {
      logAuthEvent('device_bound', userId, {
        transactionId: transaction_id,
        deviceId: device.deviceId,
        ip: req.ip
      });
    } else {
      logAuthEvent('device_already_trusted', userId, {
        transactionId: transaction_id,
        deviceId: device.deviceId,
        ip: req.ip
      });
    }

    res.json({
      success: true,
      transaction_id,
      trusted_at: device.trustedAt.toISOString(),
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
  return checkDeviceTrusted(userId, deviceFingerprint);
};
