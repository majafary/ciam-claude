import jwt from 'jsonwebtoken';
import { randomBytes, createPublicKey, createPrivateKey } from 'crypto';
import { JWTPayload, JWKSKey, JWKSResponse } from '../types';

// TODO: Replace with actual RSA key pair generation in production
// For development, we'll use a symmetric key
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '15m';
const JWT_ISSUER = process.env.JWT_ISSUER || 'http://localhost:8080';

// Mock RSA key pair for development (replace with real keys in production)
const MOCK_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC4f6i+K2/lxE7t
...mock_key_content...
-----END PRIVATE KEY-----`;

const MOCK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuH+ovitv5cRO7Q==
...mock_key_content...
QIDAQAB
-----END PUBLIC KEY-----`;

/**
 * Generate JWT access token
 * TODO: Replace with actual user data and secure key management in production
 */
export const generateAccessToken = (
  userId: string,
  sessionId: string,
  roles: string[] = ['customer']
): string => {
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    sub: userId,
    aud: 'ciam-api',
    iss: JWT_ISSUER,
    jti: randomBytes(16).toString('hex'),
    sessionId,
    roles
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRY as string,
    algorithm: 'HS256'
  } as jwt.SignOptions);
};

/**
 * Generate JWT ID token (OIDC compatible)
 * TODO: Replace with actual user profile data in production
 */
export const generateIdToken = (
  userId: string,
  sessionId: string,
  userProfile: {
    preferred_username?: string;
    email?: string;
    email_verified?: boolean;
    given_name?: string;
    family_name?: string;
  }
): string => {
  const payload = {
    sub: userId,
    aud: 'ciam-client',
    iss: JWT_ISSUER,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (15 * 60), // 15 minutes
    sessionId,
    ...userProfile
  };

  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256'
  });
};

/**
 * Generate secure refresh token
 * TODO: Store in database with expiration in production
 */
export const generateRefreshToken = (): string => {
  return randomBytes(32).toString('base64url');
};

/**
 * Verify and decode JWT token
 */
export const verifyAccessToken = (token: string): JWTPayload | null => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER
    }) as JWTPayload;

    return decoded;
  } catch (error) {
    return null;
  }
};

/**
 * Decode JWT without verification (for inspection)
 */
export const decodeToken = (token: string): JWTPayload | null => {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch (error) {
    return null;
  }
};

/**
 * Check if token is expired
 */
export const isTokenExpired = (token: string): boolean => {
  const decoded = decodeToken(token);
  if (!decoded) return true;

  return decoded.exp < Math.floor(Date.now() / 1000);
};

/**
 * Generate JWKS (JSON Web Key Set) for public key distribution
 * TODO: Replace with actual RSA public key in production
 */
export const generateJWKS = (): JWKSResponse => {
  // Mock JWKS for development - replace with real RSA keys in production
  const mockKey: JWKSKey = {
    kty: 'RSA',
    use: 'sig',
    key_ops: ['verify'],
    alg: 'RS256',
    kid: 'dev-key-1',
    n: 'uH-ovitv5cRO7Q...mock_modulus...',
    e: 'AQAB'
  };

  return {
    keys: [mockKey]
  };
};

/**
 * Get token expiration time in seconds
 */
export const getTokenExpirationTime = (): number => {
  const expiryString = JWT_EXPIRY;

  // Parse expiry string (e.g., '15m', '1h', '24h')
  const match = expiryString.match(/(\d+)([smhd])/);
  if (!match) return 900; // Default 15 minutes

  const [, amount, unit] = match;
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400
  };

  return parseInt(amount, 10) * (multipliers[unit] || 60);
};

/**
 * Create secure cookie options for refresh token
 */
export const getRefreshTokenCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: isProduction, // Only HTTPS in production
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days in milliseconds
    domain: isProduction ? undefined : 'localhost' // Set appropriate domain for production
  };
};

/**
 * Extract bearer token from Authorization header
 */
export const extractBearerToken = (authHeader: string | undefined): string | null => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.substring(7); // Remove 'Bearer ' prefix
};

/**
 * Validate JWT format without verification
 */
export const isValidJWTFormat = (token: string): boolean => {
  const parts = token.split('.');
  return parts.length === 3 && parts.every(part => part.length > 0);
};