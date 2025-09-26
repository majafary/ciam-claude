import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CiamProvider } from '../components/CiamProvider';
import { CiamLoginComponent } from '../components/CiamLoginComponent';
import { AuthService } from '../services/AuthService';

// Mock the AuthService
jest.mock('../services/AuthService');

describe('MFA End-to-End Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
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

  it('should complete the full MFA flow: login -> method selection -> OTP verification -> success', async () => {
    // Mock the complete MFA flow
    let transactionId = 'otp-transaction-123';

    const mockLogin = jest.fn().mockResolvedValue({
      responseTypeCode: 'MFA_REQUIRED',
      message: 'MFA Required',
      sessionId: 'test-session',
      available_methods: ['otp', 'push']
    });

    const mockInitiateMFAChallenge = jest.fn().mockResolvedValue({
      transactionId: transactionId,
      challengeStatus: 'PENDING',
      expiresAt: new Date(Date.now() + 300000).toISOString(), // 5 minutes
      message: 'OTP sent successfully'
    });

    const mockVerifyMFAChallenge = jest.fn().mockResolvedValue({
      id_token: 'test-id-token',
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      sessionId: 'test-session-id',
      transactionId: transactionId,
      message: 'MFA verification successful'
    });

    const mockGetUserInfo = jest.fn().mockResolvedValue({
      sub: 'mfauser',
      preferred_username: 'mfauser',
      email: 'mfauser@example.com',
      email_verified: true,
      given_name: 'MFA',
      family_name: 'User',
      roles: ['user']
    });

    const mockRefreshToken = jest.fn().mockResolvedValue({
      id_token: 'test-id-token',
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token'
    });

    const mockSetStoredAccessToken = jest.fn();

    // Mock AuthService instance
    const MockedAuthService = AuthService as any;
    MockedAuthService.mockImplementation(() => ({
      login: mockLogin,
      initiateMFAChallenge: mockInitiateMFAChallenge,
      verifyMFAChallenge: mockVerifyMFAChallenge,
      getUserInfo: mockGetUserInfo,
      refreshToken: mockRefreshToken,
      setStoredAccessToken: mockSetStoredAccessToken,
      isAuthenticated: () => true, // After MFA success
      clearTokens: jest.fn(),
    }));

    const mockOnLoginSuccess = jest.fn();

    renderWithProvider(
      <CiamLoginComponent
        variant="form"
        onLoginSuccess={mockOnLoginSuccess}
      />
    );

    // Step 1: Initial form should be visible
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();

    // Step 2: Fill in credentials and submit
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'mfauser' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    // Step 3: Wait for MFA method selection dialog
    await waitFor(() => {
      expect(screen.getByText('Choose Verification Method')).toBeInTheDocument();
    }, { timeout: 3000 });

    expect(screen.getByText('Text Message (OTP)')).toBeInTheDocument();
    expect(screen.getByText('Push Notification')).toBeInTheDocument();

    // Verify login was called
    expect(mockLogin).toHaveBeenCalledWith('mfauser', 'password');

    // Step 4: Select OTP method
    const otpOption = screen.getByText('Text Message (OTP)');
    fireEvent.click(otpOption);

    const continueButton = screen.getByRole('button', { name: /continue/i });
    fireEvent.click(continueButton);

    // Step 5: Wait for OTP entry form
    await waitFor(() => {
      expect(screen.getByText('Enter Verification Code')).toBeInTheDocument();
    }, { timeout: 3000 });

    expect(screen.getByPlaceholderText('1234')).toBeInTheDocument();
    expect(screen.getByText('Enter the 4-digit code (use 1234 for testing)')).toBeInTheDocument();

    // Verify initiate challenge was called
    expect(mockInitiateMFAChallenge).toHaveBeenCalledWith('otp', 'mfauser');

    // Step 6: Enter OTP and verify
    const otpInput = screen.getByPlaceholderText('1234');
    fireEvent.change(otpInput, { target: { value: '1234' } });

    const verifyButton = screen.getByRole('button', { name: /verify/i });
    expect(verifyButton).not.toBeDisabled();
    fireEvent.click(verifyButton);

    // Step 7: Wait for authentication completion
    await waitFor(() => {
      // The MFA verification should complete and clear the dialog
      expect(screen.queryByText('Enter Verification Code')).not.toBeInTheDocument();
    }, { timeout: 5000 });

    // Step 8: Verify the complete flow worked
    expect(mockVerifyMFAChallenge).toHaveBeenCalledWith(transactionId, '1234');
    expect(mockSetStoredAccessToken).toHaveBeenCalledWith('test-access-token');
    expect(mockRefreshToken).toHaveBeenCalled(); // refreshSession called
    expect(mockGetUserInfo).toHaveBeenCalled(); // getUserInfo called during refresh
    expect(mockOnLoginSuccess).toHaveBeenCalledWith({
      sub: 'mfauser',
      preferred_username: 'mfauser',
      email: 'mfauser@example.com',
      email_verified: true,
      given_name: 'MFA',
      family_name: 'User',
      roles: ['user']
    });

    // Step 9: Verify final state - should show authenticated user
    await waitFor(() => {
      // The component should now show the authenticated state
      expect(screen.queryByText('Choose Verification Method')).not.toBeInTheDocument();
      expect(screen.queryByText('Enter Verification Code')).not.toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('should handle MFA cancellation at method selection', async () => {
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

    // Login to get to MFA selection
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'mfauser' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    // Wait for MFA dialog
    await waitFor(() => {
      expect(screen.getByText('Choose Verification Method')).toBeInTheDocument();
    });

    // Cancel the dialog
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    // Should return to login form
    await waitFor(() => {
      expect(screen.queryByText('Choose Verification Method')).not.toBeInTheDocument();
      expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    });
  });

  it('should handle MFA cancellation during OTP entry', async () => {
    const mockLogin = jest.fn().mockResolvedValue({
      responseTypeCode: 'MFA_REQUIRED',
      message: 'MFA Required',
      sessionId: 'test-session',
      available_methods: ['otp']
    });

    const mockInitiateMFAChallenge = jest.fn().mockResolvedValue({
      transactionId: 'otp-test-123',
      challengeStatus: 'PENDING',
      expiresAt: new Date(Date.now() + 300000).toISOString(),
      message: 'OTP sent successfully'
    });

    const MockedAuthService = AuthService as any;
    MockedAuthService.mockImplementation(() => ({
      login: mockLogin,
      initiateMFAChallenge: mockInitiateMFAChallenge,
      isAuthenticated: () => false,
      clearTokens: jest.fn(),
    }));

    renderWithProvider(<CiamLoginComponent variant="form" />);

    // Complete login and method selection to get to OTP entry
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'mfauser' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Choose Verification Method')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Text Message (OTP)'));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByText('Enter Verification Code')).toBeInTheDocument();
    });

    // Cancel during OTP entry
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    // Should return to login form
    await waitFor(() => {
      expect(screen.queryByText('Enter Verification Code')).not.toBeInTheDocument();
      expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    });
  });
});