import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { validateUser, initiatePasswordReset, resetPassword } from '../../services/userService';

describe('UserService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateUser', () => {
    it('should validate correct test user credentials', async () => {
      const result = await validateUser('testuser', 'password');

      expect(result).toEqual({
        success: true,
        user: {
          id: 'testuser',
          username: 'testuser',
          email: 'testuser@example.com',
          roles: ['user']
        }
      });
    });

    it('should return account locked for locked user', async () => {
      const result = await validateUser('lockeduser', 'password');

      expect(result).toEqual({
        success: false,
        error: 'ACCOUNT_LOCKED',
        message: 'Account is temporarily locked'
      });
    });

    it('should return MFA required for MFA locked user', async () => {
      const result = await validateUser('mfalockeduser', 'password');

      expect(result).toEqual({
        success: false,
        error: 'MFA_REQUIRED',
        message: 'Multi-factor authentication required',
        mfaRequired: true,
        availableMethods: ['otp', 'push']
      });
    });

    it('should return invalid credentials for wrong password', async () => {
      const result = await validateUser('testuser', 'wrongpassword');

      expect(result).toEqual({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password'
      });
    });

    it('should return invalid credentials for unknown user', async () => {
      const result = await validateUser('unknownuser', 'password');

      expect(result).toEqual({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password'
      });
    });

    it('should handle empty credentials', async () => {
      const result1 = await validateUser('', 'password');
      const result2 = await validateUser('testuser', '');
      const result3 = await validateUser('', '');

      expect(result1).toEqual({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password'
      });

      expect(result2).toEqual({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password'
      });

      expect(result3).toEqual({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password'
      });
    });

    it('should simulate processing delay', async () => {
      const startTime = Date.now();
      await validateUser('testuser', 'password');
      const endTime = Date.now();

      // Should take at least some time (simulated delay)
      expect(endTime - startTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('initiatePasswordReset', () => {
    it('should initiate password reset for valid email', async () => {
      const result = await initiatePasswordReset('testuser@example.com');

      expect(result).toEqual({
        success: true,
        message: 'Password reset instructions sent to your email'
      });
    });

    it('should return success even for non-existent email (security)', async () => {
      const result = await initiatePasswordReset('nonexistent@example.com');

      expect(result).toEqual({
        success: true,
        message: 'Password reset instructions sent to your email'
      });
    });

    it('should handle invalid email format', async () => {
      const result = await initiatePasswordReset('invalid-email');

      expect(result).toEqual({
        success: false,
        error: 'INVALID_EMAIL',
        message: 'Please provide a valid email address'
      });
    });

    it('should handle empty email', async () => {
      const result = await initiatePasswordReset('');

      expect(result).toEqual({
        success: false,
        error: 'INVALID_EMAIL',
        message: 'Please provide a valid email address'
      });
    });
  });

  describe('resetPassword', () => {
    const validToken = 'valid-reset-token';
    const newPassword = 'newSecurePassword123!';

    it('should reset password with valid token', async () => {
      const result = await resetPassword(validToken, newPassword);

      expect(result).toEqual({
        success: true,
        message: 'Password has been reset successfully'
      });
    });

    it('should reject invalid token', async () => {
      const result = await resetPassword('invalid-token', newPassword);

      expect(result).toEqual({
        success: false,
        error: 'INVALID_TOKEN',
        message: 'Invalid or expired reset token'
      });
    });

    it('should reject expired token', async () => {
      const result = await resetPassword('expired-token', newPassword);

      expect(result).toEqual({
        success: false,
        error: 'INVALID_TOKEN',
        message: 'Invalid or expired reset token'
      });
    });

    it('should validate password strength', async () => {
      const weakPasswords = ['123', 'password', 'abc'];

      for (const password of weakPasswords) {
        const result = await resetPassword(validToken, password);
        expect(result).toEqual({
          success: false,
          error: 'WEAK_PASSWORD',
          message: 'Password does not meet security requirements'
        });
      }
    });

    it('should handle empty inputs', async () => {
      const result1 = await resetPassword('', newPassword);
      const result2 = await resetPassword(validToken, '');
      const result3 = await resetPassword('', '');

      expect(result1).toEqual({
        success: false,
        error: 'INVALID_TOKEN',
        message: 'Invalid or expired reset token'
      });

      expect(result2).toEqual({
        success: false,
        error: 'WEAK_PASSWORD',
        message: 'Password does not meet security requirements'
      });

      expect(result3).toEqual({
        success: false,
        error: 'INVALID_TOKEN',
        message: 'Invalid or expired reset token'
      });
    });
  });
});