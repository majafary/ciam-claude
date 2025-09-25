import { Request, Response } from 'express';
import { generateAccessToken, generateRefreshToken, verifyToken, generateJWKS } from '../utils/jwt-simple';

// Simple auth controller for quick Docker build
export const authController = {
  login: async (req: Request, res: Response) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_CREDENTIALS',
        message: 'Username and password are required'
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
        success: false,
        error: 'ACCOUNT_LOCKED',
        message: 'Account is temporarily locked'
      });
    }

    if (username === 'mfalockeduser') {
      return res.status(428).json({
        success: false,
        error: 'MFA_REQUIRED',
        message: 'Multi-factor authentication required',
        mfa_required: true,
        available_methods: ['otp', 'push']
      });
    }

    return res.status(401).json({
      success: false,
      error: 'INVALID_CREDENTIALS',
      message: 'Invalid username or password'
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

  verifyMfa: async (req: Request, res: Response) => {
    const { method, code } = req.body;

    if (!method) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_MFA_METHOD',
        message: 'MFA method is required'
      });
    }

    if (method === 'otp') {
      if (code === '1234') {
        return res.json({
          success: true,
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

    if (method === 'push') {
      return res.json({
        success: true,
        message: 'Push notification sent. Please check your device.',
        pending_verification: true
      });
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