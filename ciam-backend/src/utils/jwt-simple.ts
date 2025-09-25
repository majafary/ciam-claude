import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';

// Simple JWT utility with correct types
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-for-testing-only';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '15m';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-key';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

export interface User {
  id: string;
  username: string;
  email?: string;
  roles: string[];
}

export const generateAccessToken = (user: User): string => {
  const payload = {
    sub: user.id,
    username: user.username,
    email: user.email,
    roles: user.roles,
    type: 'access'
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRY
  } as jwt.SignOptions);
};

export const generateRefreshToken = (user: User): string => {
  const payload = {
    sub: user.id,
    type: 'refresh'
  };

  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRY
  } as jwt.SignOptions);
};

export interface TokenVerifyResult {
  valid: boolean;
  payload: any;
  error?: string;
}

export const verifyToken = (token: string, type: 'access' | 'refresh' = 'access'): TokenVerifyResult => {
  try {
    const secret = type === 'access' ? JWT_SECRET : JWT_REFRESH_SECRET;
    const decoded = jwt.verify(token, secret) as any;

    if (decoded.type !== type) {
      return {
        valid: false,
        payload: null,
        error: `Expected ${type} token but got ${decoded.type}`
      };
    }

    return {
      valid: true,
      payload: decoded
    };
  } catch (error) {
    return {
      valid: false,
      payload: null,
      error: error instanceof Error ? error.message : 'Token verification failed'
    };
  }
};

export const generateJWKS = () => {
  // Simplified JWKS for development
  return {
    keys: [{
      kty: 'RSA',
      use: 'sig',
      kid: 'dev-key-id',
      n: 'mock-modulus-value',
      e: 'AQAB'
    }]
  };
};