import { describe, it, expect, jest } from '@jest/globals';
import { generateAccessToken, generateRefreshToken, verifyToken, generateJWKS } from '../../utils/jwt';
import jwt from 'jsonwebtoken';

describe('JWT Utils', () => {
  const mockUser = {
    id: 'test-user-id',
    username: 'testuser',
    email: 'test@example.com',
    roles: ['user']
  };

  describe('generateAccessToken', () => {
    it('should generate a valid access token', () => {
      const token = generateAccessToken(mockUser);
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);

      const decoded = jwt.decode(token) as any;
      expect(decoded).toHaveProperty('sub', mockUser.id);
      expect(decoded).toHaveProperty('username', mockUser.username);
      expect(decoded).toHaveProperty('email', mockUser.email);
      expect(decoded).toHaveProperty('roles', mockUser.roles);
    });

    it('should include correct token type', () => {
      const token = generateAccessToken(mockUser);
      const decoded = jwt.decode(token) as any;
      expect(decoded).toHaveProperty('type', 'access');
    });

    it('should have proper expiration', () => {
      const token = generateAccessToken(mockUser);
      const decoded = jwt.decode(token) as any;
      expect(decoded).toHaveProperty('exp');
      expect(decoded.exp).toBeGreaterThan(Date.now() / 1000);
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a valid refresh token', () => {
      const token = generateRefreshToken(mockUser);
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);

      const decoded = jwt.decode(token) as any;
      expect(decoded).toHaveProperty('sub', mockUser.id);
      expect(decoded).toHaveProperty('type', 'refresh');
    });

    it('should have longer expiration than access token', () => {
      const accessToken = generateAccessToken(mockUser);
      const refreshToken = generateRefreshToken(mockUser);

      const accessDecoded = jwt.decode(accessToken) as any;
      const refreshDecoded = jwt.decode(refreshToken) as any;

      expect(refreshDecoded.exp).toBeGreaterThan(accessDecoded.exp);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid access token', () => {
      const token = generateAccessToken(mockUser);
      const result = verifyToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload).toHaveProperty('sub', mockUser.id);
      expect(result.payload).toHaveProperty('username', mockUser.username);
      expect(result.error).toBeUndefined();
    });

    it('should verify a valid refresh token', () => {
      const token = generateRefreshToken(mockUser);
      const result = verifyToken(token, 'refresh');

      expect(result.valid).toBe(true);
      expect(result.payload).toHaveProperty('sub', mockUser.id);
      expect(result.payload).toHaveProperty('type', 'refresh');
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid token', () => {
      const result = verifyToken('invalid-token');

      expect(result.valid).toBe(false);
      expect(result.payload).toBeNull();
      expect(result.error).toBeDefined();
    });

    it('should reject expired token', () => {
      // Create a token that expires immediately
      const expiredToken = jwt.sign(
        { ...mockUser, exp: Math.floor(Date.now() / 1000) - 60 },
        process.env.JWT_SECRET!
      );

      const result = verifyToken(expiredToken);

      expect(result.valid).toBe(false);
      expect(result.payload).toBeNull();
      expect(result.error).toContain('expired');
    });

    it('should reject access token when refresh expected', () => {
      const accessToken = generateAccessToken(mockUser);
      const result = verifyToken(accessToken, 'refresh');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject refresh token when access expected', () => {
      const refreshToken = generateRefreshToken(mockUser);
      const result = verifyToken(refreshToken, 'access');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('generateJWKS', () => {
    it('should generate valid JWKS', () => {
      const jwks = generateJWKS();

      expect(jwks).toHaveProperty('keys');
      expect(Array.isArray(jwks.keys)).toBe(true);
      expect(jwks.keys.length).toBe(1);

      const key = jwks.keys[0];
      expect(key).toHaveProperty('kty', 'RSA');
      expect(key).toHaveProperty('use', 'sig');
      expect(key).toHaveProperty('kid');
      expect(key).toHaveProperty('n');
      expect(key).toHaveProperty('e');
    });

    it('should generate consistent JWKS', () => {
      const jwks1 = generateJWKS();
      const jwks2 = generateJWKS();

      // Should be the same since we're using a fixed key
      expect(jwks1.keys[0].kid).toBe(jwks2.keys[0].kid);
      expect(jwks1.keys[0].n).toBe(jwks2.keys[0].n);
    });
  });
});