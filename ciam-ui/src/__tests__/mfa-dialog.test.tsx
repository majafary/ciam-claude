import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CiamProvider } from '../components/CiamProvider';
import { CiamLoginComponent } from '../components/CiamLoginComponent';
import { AuthService } from '../services/AuthService';

// Mock the AuthService
jest.mock('../services/AuthService');

// Mock the MFA hooks
const mockInitiateChallenge = jest.fn();
jest.mock('../hooks/useMfa', () => ({
  useMfa: () => ({
    transaction: null,
    initiateChallenge: mockInitiateChallenge,
  }),
}));

describe('MFA Dialog Integration Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock console.log to avoid noise in tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const renderWithProvider = (children: React.ReactNode) => {
    return render(
      <CiamProvider
        backendUrl="http://localhost:3000"
        debug={false}
      >
        {children}
      </CiamProvider>
    );
  };

  it('should show MFA method selection dialog after mfauser login', async () => {
    // Mock AuthService to return MFA_REQUIRED
    const mockLogin = jest.fn().mockResolvedValue({
      responseTypeCode: 'MFA_REQUIRED',
      message: 'MFA Required',
      sessionId: 'test-session',
      available_methods: ['otp', 'push']
    });

    // Mock the AuthService instance
    const MockedAuthService = AuthService as any;
    MockedAuthService.mockImplementation(() => ({
      login: mockLogin,
      isAuthenticated: () => false,
      clearTokens: jest.fn(),
    }));

    renderWithProvider(<CiamLoginComponent variant="form" />);

    // Fill in the form
    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const signInButton = screen.getByRole('button', { name: /sign in/i });

    fireEvent.change(usernameInput, { target: { value: 'mfauser' } });
    fireEvent.change(passwordInput, { target: { value: 'password' } });

    // Submit the form
    fireEvent.click(signInButton);

    // Wait for the MFA dialog to appear
    await waitFor(() => {
      expect(screen.getByText('Choose Verification Method')).toBeInTheDocument();
    }, { timeout: 3000 });

    // Verify the available methods are shown
    expect(screen.getByText('Text Message (OTP)')).toBeInTheDocument();
    expect(screen.getByText('Push Notification')).toBeInTheDocument();

    // Verify the login was called with correct credentials
    expect(mockLogin).toHaveBeenCalledWith('mfauser', 'password');
  });

  it('should not show MFA dialog on page load', () => {
    // Mock AuthService to return not authenticated
    const MockedAuthService = AuthService as any;
    MockedAuthService.mockImplementation(() => ({
      login: jest.fn(),
      isAuthenticated: () => false,
      clearTokens: jest.fn(),
    }));

    renderWithProvider(<CiamLoginComponent variant="form" />);

    // Dialog should not be visible on page load
    expect(screen.queryByText('Choose Verification Method')).not.toBeInTheDocument();

    // Form should be visible
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('should handle MFA method selection', async () => {
    // Mock AuthService to return MFA_REQUIRED
    const mockLogin = jest.fn().mockResolvedValue({
      responseTypeCode: 'MFA_REQUIRED',
      message: 'MFA Required',
      sessionId: 'test-session',
      available_methods: ['otp', 'push']
    });

    const MockedAuthService = AuthService as any;
    MockedAuthService.mockImplementation(() => ({
      login: mockLogin,
      isAuthenticated: () => false,
      clearTokens: jest.fn(),
    }));

    renderWithProvider(<CiamLoginComponent variant="form" />);

    // Fill and submit form
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'mfauser' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    // Wait for dialog
    await waitFor(() => {
      expect(screen.getByText('Choose Verification Method')).toBeInTheDocument();
    });

    // Select OTP method - click on the card containing the text
    const otpText = screen.getByText('Text Message (OTP)');
    expect(otpText).toBeInTheDocument();
    fireEvent.click(otpText);

    // Click continue button
    const continueButton = screen.getByRole('button', { name: /continue/i });
    fireEvent.click(continueButton);

    // Verify initiateChallenge was called with OTP
    await waitFor(() => {
      expect(mockInitiateChallenge).toHaveBeenCalledWith('otp', 'mfauser');
    });
  });

  it('should handle MFA dialog cancellation', async () => {
    // Mock AuthService to return MFA_REQUIRED
    const mockLogin = jest.fn().mockResolvedValue({
      responseTypeCode: 'MFA_REQUIRED',
      message: 'MFA Required',
      sessionId: 'test-session',
      available_methods: ['otp', 'push']
    });

    const MockedAuthService = AuthService as any;
    MockedAuthService.mockImplementation(() => ({
      login: mockLogin,
      isAuthenticated: () => false,
      clearTokens: jest.fn(),
    }));

    renderWithProvider(<CiamLoginComponent variant="form" />);

    // Fill and submit form
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'mfauser' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    // Wait for dialog
    await waitFor(() => {
      expect(screen.getByText('Choose Verification Method')).toBeInTheDocument();
    });

    // Cancel the dialog
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    // Dialog should be closed
    await waitFor(() => {
      expect(screen.queryByText('Choose Verification Method')).not.toBeInTheDocument();
    });

    // Form should be visible again
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  });

  it('should handle regular login success without showing MFA dialog', async () => {
    // Mock successful login without MFA
    const mockLogin = jest.fn().mockResolvedValue({
      responseTypeCode: 'SUCCESS',
      message: 'Login successful',
      sessionId: 'test-session',
      id_token: 'fake-token',
      access_token: 'fake-access-token'
    });

    const mockGetUserInfo = jest.fn().mockResolvedValue({
      sub: 'testuser',
      preferred_username: 'testuser',
      email: 'test@example.com',
      given_name: 'Test',
      family_name: 'User'
    });

    const MockedAuthService = AuthService as any;
    MockedAuthService.mockImplementation(() => ({
      login: mockLogin,
      getUserInfo: mockGetUserInfo,
      isAuthenticated: () => false,
      clearTokens: jest.fn(),
    }));

    const mockOnLoginSuccess = jest.fn();

    renderWithProvider(
      <CiamLoginComponent
        variant="form"
        onLoginSuccess={mockOnLoginSuccess}
      />
    );

    // Fill and submit form with regular user
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    // Verify login was called
    expect(mockLogin).toHaveBeenCalledWith('testuser', 'password');

    // MFA dialog should NOT appear
    await waitFor(() => {
      expect(screen.queryByText('Choose Verification Method')).not.toBeInTheDocument();
    }, { timeout: 1000 });

    // Wait for successful login callback
    await waitFor(() => {
      expect(mockOnLoginSuccess).toHaveBeenCalled();
    });
  });
});