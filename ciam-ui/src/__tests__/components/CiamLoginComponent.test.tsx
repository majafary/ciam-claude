import React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CiamLoginComponent from '../../components/CiamLoginComponent';
import { CiamProvider } from '../../hooks/useAuth';
import type { CiamConfig } from '../../types';

// Mock the useAuth hook
const mockLogin = jest.fn();
const mockClearError = jest.fn();

jest.mock('../../hooks/useAuth', () => ({
  ...jest.requireActual('../../hooks/useAuth'),
  useAuth: () => ({
    login: mockLogin,
    clearError: mockClearError,
    isLoading: false,
    error: null,
    mfaRequired: false,
    mfaMethods: []
  })
}));

describe('CiamLoginComponent', () => {
  const config: CiamConfig = {
    baseUrl: 'http://localhost:8080',
    clientId: 'test-client',
    enableDebug: false,
    tokenRefreshThreshold: 300000,
    maxRetries: 3
  };

  const theme = createTheme();

  const renderComponent = (props = {}) => {
    const defaultProps = {
      onSuccess: jest.fn(),
      onError: jest.fn(),
      variant: 'standard' as const
    };

    return render(
      <ThemeProvider theme={theme}>
        <CiamProvider config={config}>
          <CiamLoginComponent {...defaultProps} {...props} />
        </CiamProvider>
      </ThemeProvider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render login form with standard variant', () => {
      renderComponent();

      expect(screen.getByRole('textbox', { name: /username/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('should render minimal variant', () => {
      renderComponent({ variant: 'minimal' });

      expect(screen.getByRole('textbox', { name: /username/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
      expect(screen.queryByText(/welcome back/i)).not.toBeInTheDocument();
    });

    it('should render card variant', () => {
      renderComponent({ variant: 'card' });

      expect(screen.getByRole('textbox', { name: /username/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
      expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
    });

    it('should render with custom title', () => {
      renderComponent({ title: 'Custom Login Title' });

      expect(screen.getByText('Custom Login Title')).toBeInTheDocument();
    });

    it('should show loading state', () => {
      jest.doMock('../../hooks/useAuth', () => ({
        ...jest.requireActual('../../hooks/useAuth'),
        useAuth: () => ({
          login: mockLogin,
          clearError: mockClearError,
          isLoading: true,
          error: null,
          mfaRequired: false,
          mfaMethods: []
        })
      }));

      renderComponent();

      expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled();
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });

  describe('form validation', () => {
    it('should validate required fields', async () => {
      const user = userEvent.setup();
      renderComponent();

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitButton);

      expect(screen.getByText(/username is required/i)).toBeInTheDocument();
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('should validate username format', async () => {
      const user = userEvent.setup();
      renderComponent();

      const usernameField = screen.getByRole('textbox', { name: /username/i });
      await user.type(usernameField, 'a');

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitButton);

      expect(screen.getByText(/username must be at least 3 characters/i)).toBeInTheDocument();
    });

    it('should validate password length', async () => {
      const user = userEvent.setup();
      renderComponent();

      const usernameField = screen.getByRole('textbox', { name: /username/i });
      const passwordField = screen.getByLabelText(/password/i);

      await user.type(usernameField, 'testuser');
      await user.type(passwordField, '123');

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitButton);

      expect(screen.getByText(/password must be at least 6 characters/i)).toBeInTheDocument();
    });

    it('should clear validation errors on input change', async () => {
      const user = userEvent.setup();
      renderComponent();

      // Trigger validation error
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitButton);

      expect(screen.getByText(/username is required/i)).toBeInTheDocument();

      // Start typing to clear error
      const usernameField = screen.getByRole('textbox', { name: /username/i });
      await user.type(usernameField, 't');

      expect(screen.queryByText(/username is required/i)).not.toBeInTheDocument();
    });
  });

  describe('login submission', () => {
    it('should submit valid credentials', async () => {
      const user = userEvent.setup();
      const onSuccess = jest.fn();

      mockLogin.mockResolvedValue({
        success: true,
        access_token: 'token',
        token_type: 'Bearer',
        expires_in: 900,
        user: { id: 'test', username: 'testuser', email: 'test@test.com', roles: [] }
      });

      renderComponent({ onSuccess });

      const usernameField = screen.getByRole('textbox', { name: /username/i });
      const passwordField = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(usernameField, 'testuser');
      await user.type(passwordField, 'password');
      await user.click(submitButton);

      expect(mockLogin).toHaveBeenCalledWith('testuser', 'password');

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith({
          success: true,
          access_token: 'token',
          token_type: 'Bearer',
          expires_in: 900,
          user: { id: 'test', username: 'testuser', email: 'test@test.com', roles: [] }
        });
      });
    });

    it('should handle login failure', async () => {
      const user = userEvent.setup();
      const onError = jest.fn();

      mockLogin.mockResolvedValue({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password'
      });

      renderComponent({ onError });

      const usernameField = screen.getByRole('textbox', { name: /username/i });
      const passwordField = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(usernameField, 'testuser');
      await user.type(passwordField, 'wrongpassword');
      await user.click(submitButton);

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith({
          success: false,
          error: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password'
        });
      });
    });

    it('should handle MFA required scenario', async () => {
      const user = userEvent.setup();
      const onMfaRequired = jest.fn();

      mockLogin.mockResolvedValue({
        success: false,
        error: 'MFA_REQUIRED',
        message: 'Multi-factor authentication required',
        mfa_required: true,
        available_methods: ['otp', 'push']
      });

      renderComponent({ onMfaRequired });

      const usernameField = screen.getByRole('textbox', { name: /username/i });
      const passwordField = screen.getByLabelText(/password/i });
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(usernameField, 'mfalockeduser');
      await user.type(passwordField, 'password');
      await user.click(submitButton);

      await waitFor(() => {
        expect(onMfaRequired).toHaveBeenCalledWith({
          success: false,
          error: 'MFA_REQUIRED',
          message: 'Multi-factor authentication required',
          mfa_required: true,
          available_methods: ['otp', 'push']
        });
      });
    });
  });

  describe('keyboard navigation', () => {
    it('should support Enter key submission', async () => {
      const user = userEvent.setup();
      renderComponent();

      const usernameField = screen.getByRole('textbox', { name: /username/i });
      const passwordField = screen.getByLabelText(/password/i);

      await user.type(usernameField, 'testuser');
      await user.type(passwordField, 'password');
      await user.keyboard('{Enter}');

      expect(mockLogin).toHaveBeenCalledWith('testuser', 'password');
    });

    it('should move focus from username to password on Tab', async () => {
      const user = userEvent.setup();
      renderComponent();

      const usernameField = screen.getByRole('textbox', { name: /username/i });
      const passwordField = screen.getByLabelText(/password/i);

      usernameField.focus();
      await user.keyboard('{Tab}');

      expect(passwordField).toHaveFocus();
    });
  });

  describe('accessibility', () => {
    it('should have proper form labels', () => {
      renderComponent();

      expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    });

    it('should have form role', () => {
      renderComponent();

      expect(screen.getByRole('form')).toBeInTheDocument();
    });

    it('should associate error messages with fields', async () => {
      const user = userEvent.setup();
      renderComponent();

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      await user.click(submitButton);

      const usernameField = screen.getByRole('textbox', { name: /username/i });
      expect(usernameField).toHaveAttribute('aria-invalid', 'true');
      expect(usernameField).toHaveAccessibleDescription();
    });

    it('should be keyboard navigable', () => {
      renderComponent();

      const usernameField = screen.getByRole('textbox', { name: /username/i });
      const passwordField = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      expect(usernameField).toHaveAttribute('tabIndex', '0');
      expect(passwordField).toHaveAttribute('tabIndex', '0');
      expect(submitButton).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('error display', () => {
    it('should display authentication errors', () => {
      jest.doMock('../../hooks/useAuth', () => ({
        ...jest.requireActual('../../hooks/useAuth'),
        useAuth: () => ({
          login: mockLogin,
          clearError: mockClearError,
          isLoading: false,
          error: 'Invalid credentials',
          mfaRequired: false,
          mfaMethods: []
        })
      }));

      renderComponent();

      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('should clear errors on form reset', async () => {
      const user = userEvent.setup();
      renderComponent();

      // Clear error should be called when form is interacted with
      const usernameField = screen.getByRole('textbox', { name: /username/i });
      await user.type(usernameField, 't');

      expect(mockClearError).toHaveBeenCalled();
    });
  });
});