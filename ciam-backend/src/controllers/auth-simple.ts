import { Request, Response } from 'express';
import { generateAccessToken, generateRefreshToken, verifyToken, generateJWKS } from '../utils/jwt-simple';

// Simple auth controller for quick Docker build
export const authController = {
  login: async (req: Request, res: Response) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        responseTypeCode: 'MISSING_CREDENTIALS',
        message: 'Username and password are required',
        timestamp: new Date().toISOString(),
        sessionId: ''
      });
    }

    // Mock user validation
    if (username === 'testuser' && password === 'password') {
      const user = {
        id: 'testuser',
        username: 'testuser',
        email: 'testuser@example.com',
        roles: ['user']
      };

      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      // Set refresh token as HTTP-only cookie
      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: 'strict'
      });

      return res.json({
        responseTypeCode: 'SUCCESS',
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 900,
        sessionId: 'session-' + Date.now(),
        user
      });
    }

    if (username === 'lockeduser') {
      return res.status(423).json({
        responseTypeCode: 'ACCOUNT_LOCKED',
        message: 'Account is temporarily locked',
        timestamp: new Date().toISOString(),
        sessionId: ''
      });
    }

    if ((username === 'mfauser' || username === 'pushuser' || username === 'pushjuser' || username === 'pushfailuser') && password === 'password') {
      return res.status(428).json({
        responseTypeCode: 'MFA_REQUIRED',
        message: 'Multi-factor authentication required',
        mfa_required: true,
        available_methods: ['otp', 'push'],
        sessionId: 'session-mfa-' + Date.now()
      });
    }

    if (username === 'mfalockeduser') {
      return res.status(423).json({
        responseTypeCode: 'MFA_LOCKED',
        message: 'Your MFA has been locked due to too many failed attempts. Please call our call center at 1-800-SUPPORT to reset your MFA setup.',
        timestamp: new Date().toISOString(),
        sessionId: ''
      });
    }


    return res.status(401).json({
      responseTypeCode: 'INVALID_CREDENTIALS',
      message: 'Invalid username or password',
      timestamp: new Date().toISOString(),
      sessionId: ''
    });
  },

  logout: async (req: Request, res: Response) => {
    res.clearCookie('refresh_token');
    res.json({
      success: true,
      message: 'Logout successful'
    });
  },

  refresh: async (req: Request, res: Response) => {
    const refreshToken = req.cookies?.refresh_token;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: 'MISSING_REFRESH_TOKEN',
        message: 'Refresh token is required'
      });
    }

    const result = verifyToken(refreshToken, 'refresh');

    if (!result.valid) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid or expired refresh token'
      });
    }

    const user = {
      id: result.payload.sub,
      username: result.payload.sub,
      email: `${result.payload.sub}@example.com`,
      roles: ['user']
    };

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    res.cookie('refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'strict'
    });

    res.json({
      success: true,
      access_token: newAccessToken,
      token_type: 'Bearer',
      expires_in: 900
    });
  },

  introspect: async (req: Request, res: Response) => {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_TOKEN',
        message: 'Token is required'
      });
    }

    const result = verifyToken(token, 'access');

    if (result.valid) {
      res.json({
        active: true,
        sub: result.payload.sub,
        username: result.payload.username,
        email: result.payload.email,
        roles: result.payload.roles,
        exp: result.payload.exp,
        iat: result.payload.iat
      });
    } else {
      res.json({
        active: false
      });
    }
  },

  initiateMfaChallenge: async (req: Request, res: Response) => {
    const { method, username, sessionId } = req.body;

    if (!method || !['otp', 'push'].includes(method)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_MFA_METHOD',
        message: 'Valid MFA method (otp or push) is required'
      });
    }

    const transactionId = `mfa-${method}-${Date.now()}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    if (method === 'otp') {
      return res.json({
        success: true,
        transactionId,
        challengeStatus: 'PENDING',
        expiresAt,
        message: 'OTP sent to your device'
      });
    }

    if (method === 'push') {
      return res.json({
        success: true,
        transactionId,
        challengeStatus: 'PENDING',
        expiresAt,
        message: 'Push notification sent to your device'
      });
    }
  },

  checkMfaStatus: async (req: Request, res: Response) => {
    const { transactionId } = req.params;

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_TRANSACTION_ID',
        message: 'Transaction ID is required'
      });
    }

    // Simulate push notification responses based on user type
    if (transactionId.includes('push')) {
      const createdTime = parseInt(transactionId.split('-').pop() || '0');
      const timeElapsed = Date.now() - createdTime;

      // pushfailuser - always rejected after 3 seconds
      if (transactionId.includes('pushfailuser') && timeElapsed > 3000) {
        return res.json({
          transactionId,
          challengeStatus: 'REJECTED',
          updatedAt: new Date().toISOString(),
          expiresAt: new Date(createdTime + 5 * 60 * 1000).toISOString(),
          message: 'Push notification rejected'
        });
      }

      // pushuser and pushjuser - auto-approve after 3 seconds
      if ((transactionId.includes('pushuser') || transactionId.includes('pushjuser')) && timeElapsed > 3000) {
        return res.json({
          transactionId,
          challengeStatus: 'APPROVED',
          updatedAt: new Date().toISOString(),
          expiresAt: new Date(createdTime + 5 * 60 * 1000).toISOString(),
          message: 'Push notification approved'
        });
      }
    }

    return res.json({
      transactionId,
      challengeStatus: 'PENDING',
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      message: 'Challenge pending'
    });
  },

  verifyMfa: async (req: Request, res: Response) => {
    const { transactionId, method, code, pushResult } = req.body;

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_TRANSACTION_ID',
        message: 'Transaction ID is required'
      });
    }

    if (method === 'otp') {
      if (code === '1234') {
        const user = {
          id: 'mfauser',
          username: 'mfauser',
          email: 'mfauser@example.com',
          roles: ['user']
        };

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        // Set refresh token as HTTP-only cookie
        res.cookie('refresh_token', refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          sameSite: 'strict'
        });

        return res.json({
          success: true,
          id_token: accessToken,
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 900,
          sessionId: 'session-' + Date.now(),
          transactionId,
          message: 'MFA verification successful'
        });
      } else {
        return res.status(400).json({
          success: false,
          error: 'INVALID_MFA_CODE',
          message: 'Invalid or expired MFA code'
        });
      }
    }

    if (method === 'push' || pushResult) {
      // Check for different push scenarios based on transaction ID or explicit result
      if (pushResult === 'APPROVED' || transactionId.includes('pushuser') || transactionId.includes('pushjuser')) {
        // Determine user based on transaction ID
        let username = 'pushuser';
        if (transactionId.includes('pushjuser')) {
          username = 'pushjuser';
        }

        const user = {
          id: username,
          username: username,
          email: `${username}@example.com`,
          roles: ['user']
        };

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        // Set refresh token as HTTP-only cookie
        res.cookie('refresh_token', refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          sameSite: 'strict'
        });

        return res.json({
          success: true,
          id_token: accessToken,
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 900,
          sessionId: 'session-' + Date.now(),
          transactionId,
          message: 'Push notification verified successfully'
        });
      } else if (transactionId.includes('pushfailuser')) {
        return res.status(400).json({
          success: false,
          error: 'PUSH_REJECTED',
          message: 'Push notification was rejected by device'
        });
      } else {
        return res.status(400).json({
          success: false,
          error: 'PUSH_REJECTED',
          message: 'Push notification was rejected'
        });
      }
    }

    return res.status(400).json({
      success: false,
      error: 'UNSUPPORTED_MFA_METHOD',
      message: 'MFA method not supported'
    });
  },

  jwks: async (req: Request, res: Response) => {
    res.set({
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': 'application/json'
    });

    res.json(generateJWKS());
  },

  userinfo: async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'MISSING_TOKEN',
        message: 'Access token is required'
      });
    }

    const token = authHeader.substring(7);

    const result = verifyToken(token);

    if (!result.valid) {
      return res.status(401).json({
        error: 'INVALID_TOKEN',
        message: 'Invalid or expired access token'
      });
    }

    const decoded = result.payload;

    return res.json({
      sub: decoded.sub,
      preferred_username: decoded.username,
      email: decoded.email,
      email_verified: true,
      given_name: decoded.username.charAt(0).toUpperCase() + decoded.username.slice(1),
      family_name: 'User',
      roles: decoded.roles || ['user']
    });
  }
};