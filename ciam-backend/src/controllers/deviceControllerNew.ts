/**
 * Device Controller (New - Service-based)
 * HTTP layer for device binding operations
 * Business logic delegated to deviceService
 */

import { Request, Response } from 'express';
import { deviceService } from '../services/deviceService';

/**
 * Bind device (trust device) - v3.0.0
 * POST /auth/device/bind
 */
export const bindDevice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { transaction_id, context_id, bind_device, drs_action_token } = req.body;

    console.log('🔍 [DEVICE BIND] Controller request:', {
      transaction_id,
      context_id,
      bind_device
    });

    // Validate required fields
    if (!transaction_id || bind_device === undefined) {
      res.status(400).json({
        error_code: 'MISSING_REQUIRED_FIELDS',
        context_id: context_id || ''
      });
      return;
    }

    if (!context_id) {
      res.status(400).json({
        error_code: 'MISSING_CONTEXT_ID',
        context_id: ''
      });
      return;
    }

    // Delegate to service
    const result = await deviceService.bindDevice({
      transaction_id,
      context_id,
      bind_device,
      drs_action_token
    });

    if (!result.success) {
      const statusCode = result.error_code === 'TRANSACTION_NOT_FOUND' ? 404 : 400;

      res.status(statusCode).json({
        error_code: result.error_code,
        context_id: result.context_id
      });
      return;
    }

    // Set refresh token cookie if present
    if (result.refresh_token) {
      res.cookie('refresh_token', result.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: 'strict'
      });
    }

    // Return SUCCESS response
    res.status(201).json({
      response_type_code: 'SUCCESS',
      access_token: result.access_token,
      id_token: result.id_token,
      token_type: result.token_type,
      expires_in: result.expires_in,
      context_id: result.context_id,
      device_bound: result.device_bound
    });
  } catch (error) {
    console.error('Device bind error:', error);
    res.status(500).json({
      error_code: 'INTERNAL_ERROR',
      message: 'An internal error occurred'
    });
  }
};

/**
 * Check if device is trusted
 * GET /auth/device/trust/:deviceFingerprint
 */
export const checkDeviceTrust = async (req: Request, res: Response): Promise<void> => {
  try {
    const { deviceFingerprint } = req.params;
    const { username } = req.query;

    if (!deviceFingerprint || !username) {
      res.status(400).json({
        error: 'deviceFingerprint and username are required'
      });
      return;
    }

    const isTrusted = await deviceService.isDeviceTrusted(
      username as string,
      deviceFingerprint
    );

    res.json({
      trusted: isTrusted,
      deviceFingerprint,
      username
    });
  } catch (error) {
    console.error('Check device trust error:', error);
    res.status(500).json({
      error_code: 'INTERNAL_ERROR',
      message: 'An internal error occurred'
    });
  }
};

/**
 * Get user's trusted devices
 * GET /auth/device/list/:username
 */
export const getUserDevices = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username } = req.params;

    if (!username) {
      res.status(400).json({
        error: 'username is required'
      });
      return;
    }

    const devices = await deviceService.getUserDevices(username);

    res.json({
      username,
      devices: devices.map(d => ({
        deviceFingerprint: d.deviceFingerprint,
        trustedAt: d.trustedAt,
        lastUsed: d.lastUsed,
        expiresAt: d.expiresAt,
        trustDurationDays: d.trustDurationDays
      }))
    });
  } catch (error) {
    console.error('Get user devices error:', error);
    res.status(500).json({
      error_code: 'INTERNAL_ERROR',
      message: 'An internal error occurred'
    });
  }
};

/**
 * Revoke device trust
 * DELETE /auth/device/:deviceFingerprint
 */
export const revokeDevice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { deviceFingerprint } = req.params;

    if (!deviceFingerprint) {
      res.status(400).json({
        error: 'deviceFingerprint is required'
      });
      return;
    }

    const revoked = await deviceService.revokeDevice(deviceFingerprint);

    res.json({
      success: revoked,
      message: revoked ? 'Device trust revoked' : 'Device not found'
    });
  } catch (error) {
    console.error('Revoke device error:', error);
    res.status(500).json({
      error_code: 'INTERNAL_ERROR',
      message: 'An internal error occurred'
    });
  }
};
