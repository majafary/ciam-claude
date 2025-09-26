import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Alert,
  CircularProgress,
  Divider,
  Avatar,
  Menu,
  MenuItem,
  Chip,
} from '@mui/material';
import {
  Login as LoginIcon,
  Person as PersonIcon,
  Logout as LogoutIcon,
  AccountCircle as AccountCircleIcon,
} from '@mui/icons-material';
import { useAuth } from '../hooks/useAuth';
import { useMfa } from '../hooks/useMfa';
import { MfaMethodSelectionDialog } from './MfaMethodSelectionDialog';
import { CiamLoginComponentProps } from '../types';

export const CiamLoginComponent: React.FC<CiamLoginComponentProps> = ({
  variant = 'form',
  onLoginSuccess,
  onLoginError,
  onLogout,
  showUserInfo = true,
  customStyles = {},
  autoRedirect = false,
  redirectUrl,
  className,
}) => {
  const {
    isAuthenticated, isLoading, user, error, login, logout, clearError,
    mfaRequired, mfaAvailableMethods, mfaError, clearMfa, refreshSession, authService
  } = useAuth();
  const { transaction, initiateChallenge, verifyOtp, verifyPush, cancelTransaction } = useMfa();

  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  // Debug: Log state from Provider
  console.log('CiamLoginComponent render - mfaRequired:', mfaRequired, 'mfaAvailableMethods:', mfaAvailableMethods);

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));

    // Clear error when user starts typing
    if (error) {
      clearError();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.username || !formData.password) {
      return;
    }

    try {
      const result = await login(formData.username, formData.password);

      if (result.responseTypeCode === 'SUCCESS') {
        // Login successful
        onLoginSuccess?.(user!);

        if (autoRedirect && redirectUrl) {
          window.location.href = redirectUrl;
        }

        // Clear form
        setFormData({ username: '', password: '' });
      } else if (result.responseTypeCode === 'MFA_REQUIRED') {
        // MFA state is now handled centrally in the Provider
        console.log('MFA REQUIRED - Provider will handle MFA state');
      } else {
        // Handle all error cases: MFA_LOCKED, ACCOUNT_LOCKED, INVALID_CREDENTIALS, MISSING_CREDENTIALS
        const error = {
          code: result.responseTypeCode,
          message: result.message || 'Authentication failed',
          timestamp: new Date().toISOString(),
        };
        onLoginError?.(error);
      }
    } catch (error) {
      onLoginError?.(error as any);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      onLogout?.();
      setAnchorEl(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleMfaSuccess = async (mfaResponse: any) => {
    try {
      console.log('🟢 MFA Success - processing response:', mfaResponse);

      // Trigger session refresh to update Provider state with authenticated user
      await refreshSession();

      console.log('🟢 MFA Success - session refreshed, user should be authenticated');

      // Clear MFA state after successful authentication - this will close the dialog
      clearMfa();
      cancelTransaction(); // Clear transaction state to close dialog immediately
      setFormData({ username: '', password: '' });

      // Note: onLoginSuccess will be called by Provider after refreshSession updates user state
    } catch (error) {
      console.error('Failed to complete MFA authentication:', error);
      onLoginError?.(error as any);
    }
  };

  const handleMfaCancel = () => {
    clearMfa();
  };

  const handleMethodSelected = async (method: 'otp' | 'push') => {
    try {
      await initiateChallenge(method, formData.username);
      // MFA state transition is handled by the MFA hook
    } catch (error: any) {
      console.error('Failed to initiate MFA challenge:', error);
    }
  };

  const handleOtpVerify = async (otp: string) => {
    if (!transaction) return;

    try {
      const response = await verifyOtp(transaction.transactionId, otp);
      await handleMfaSuccess(response);
    } catch (error) {
      throw error; // Let the dialog handle the error display
    }
  };

  const handlePushVerify = async (pushResult: 'APPROVED' | 'REJECTED' = 'APPROVED') => {
    if (!transaction) return;

    try {
      const response = await verifyPush(transaction.transactionId, pushResult);
      await handleMfaSuccess(response);
    } catch (error) {
      throw error; // Let the dialog handle the error display
    }
  };

  const handleResendOtp = async () => {
    try {
      // Re-initiate OTP challenge to get a new code
      await initiateChallenge('otp', formData.username);
      console.log('🔄 New OTP challenge initiated');
    } catch (error: any) {
      console.error('Failed to resend OTP:', error);
      throw error;
    }
  };

  const handleMethodSelectionCancel = () => {
    console.log('🔴 handleMethodSelectionCancel called - clearing MFA state');
    clearMfa();
    cancelTransaction(); // Clear transaction state to close dialog immediately
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  // Render component content based on state
  let componentContent;

  // Authenticated state - show user info
  if (isAuthenticated && user && showUserInfo) {
    if (variant === 'button') {
      componentContent = (
        <Box sx={customStyles} className={className}>
          <Button
            variant="outlined"
            startIcon={<AccountCircleIcon />}
            onClick={handleMenuOpen}
            sx={{ textTransform: 'none' }}
          >
            {user.given_name || user.preferred_username || 'Account'}
          </Button>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'right',
            }}
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
          >
            <MenuItem disabled>
              <Box>
                <Typography variant="subtitle2">
                  {user.given_name} {user.family_name}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  {user.email}
                </Typography>
              </Box>
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <LogoutIcon sx={{ mr: 1 }} />
              Sign Out
            </MenuItem>
          </Menu>
        </Box>
      );
    } else if (variant === 'inline') {
      componentContent = (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            ...customStyles
          }}
          className={className}
        >
          <Avatar sx={{ width: 32, height: 32 }}>
            <PersonIcon />
          </Avatar>
          <Box>
            <Typography variant="body2">
              Welcome, {user.given_name || user.preferred_username}!
            </Typography>
            {user.roles && user.roles.length > 0 && (
              <Box sx={{ mt: 0.5 }}>
                {user.roles.map((role) => (
                  <Chip
                    key={role}
                    label={role}
                    size="small"
                    variant="outlined"
                    sx={{ mr: 0.5, fontSize: '0.75rem' }}
                  />
                ))}
              </Box>
            )}
          </Box>
          <Button
            size="small"
            variant="outlined"
            startIcon={<LogoutIcon />}
            onClick={handleLogout}
          >
            Sign Out
          </Button>
        </Box>
      );
    } else {
      // Default form variant - authenticated
      componentContent = (
        <Paper
          sx={{
            p: 3,
            maxWidth: 400,
            mx: 'auto',
            ...customStyles
          }}
          className={className}
        >
          <Box sx={{ textAlign: 'center', mb: 2 }}>
            <Avatar sx={{ mx: 'auto', mb: 1, bgcolor: 'primary.main' }}>
              <PersonIcon />
            </Avatar>
            <Typography variant="h6">
              Welcome back!
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {user.given_name} {user.family_name}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {user.email}
            </Typography>
          </Box>

          {user.roles && user.roles.length > 0 && (
            <Box sx={{ mb: 2, textAlign: 'center' }}>
              {user.roles.map((role) => (
                <Chip
                  key={role}
                  label={role}
                  size="small"
                  variant="outlined"
                  sx={{ mr: 0.5, mb: 0.5 }}
                />
              ))}
            </Box>
          )}

          <Button
            fullWidth
            variant="contained"
            startIcon={<LogoutIcon />}
            onClick={handleLogout}
            disabled={isLoading}
          >
            {isLoading ? <CircularProgress size={24} /> : 'Sign Out'}
          </Button>
        </Paper>
      );
    }
  }

  // Show MFA component if MFA transaction is active
  console.log('Component render state:', {
    mfaRequired,
    mfaAvailableMethods,
    transaction,
    isAuthenticated
  });

  if (!isAuthenticated || !showUserInfo) {
    // Not authenticated - show login form
    if (variant === 'button') {
      componentContent = (
        <Box className={className}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Button
            variant="contained"
            startIcon={<LoginIcon />}
            onClick={() => {/* Could open login modal */}}
            sx={customStyles}
            disabled={Boolean(error)}
          >
            Sign In
          </Button>
        </Box>
      );
    } else if (variant === 'inline') {
      componentContent = (
        <Box className={className} sx={{ position: 'relative' }}>
          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              ...customStyles
            }}
          >
            <TextField
              name="username"
              placeholder="Username"
              size="small"
              value={formData.username}
              onChange={handleInputChange}
              disabled={isLoading}
              error={Boolean(error)}
            />
            <TextField
              name="password"
              type="password"
              placeholder="Password"
              size="small"
              value={formData.password}
              onChange={handleInputChange}
              disabled={isLoading}
              error={Boolean(error)}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={isLoading || !formData.username || !formData.password}
              startIcon={isLoading ? <CircularProgress size={16} /> : <LoginIcon />}
            >
              {isLoading ? 'Signing In...' : 'Sign In1'}
            </Button>
          </Box>
          {error && (
            <Alert
              severity="error"
              sx={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                mt: 1,
                zIndex: 1300,
                minWidth: '300px',
              }}
            >
              {error}
            </Alert>
          )}
        </Box>
      );
    } else {
      // Default form variant
      componentContent = (
        <Paper
          sx={{
            p: 4,
            maxWidth: 400,
            mx: 'auto',
            ...customStyles
          }}
          className={className}
        >
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Avatar sx={{ mx: 'auto', mb: 2, bgcolor: 'primary.main' }}>
              <LoginIcon />
            </Avatar>
            <Typography variant="h5" gutterBottom>
              Sign In
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Enter your credentials to continue
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="username"
              label="Username"
              name="username"
              autoComplete="username"
              autoFocus
              value={formData.username}
              onChange={handleInputChange}
              disabled={isLoading}
              error={Boolean(error)}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type="password"
              id="password"
              autoComplete="current-password"
              value={formData.password}
              onChange={handleInputChange}
              disabled={isLoading}
              error={Boolean(error)}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              disabled={isLoading || !formData.username || !formData.password}
              startIcon={isLoading ? <CircularProgress size={20} /> : <LoginIcon />}
            >
              {isLoading ? 'Signing In...' : 'Sign In2'}
            </Button>

            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="textSecondary">
                Test credentials: testuser / password
              </Typography>
            </Box>
          </Box>

          {/* Debug: show current state */}
          {process.env.NODE_ENV === 'development' && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', fontSize: '0.75rem' }}>
              <div>Debug State:</div>
              <div>mfaRequired: {mfaRequired.toString()}</div>
              <div>mfaAvailableMethods: {JSON.stringify(mfaAvailableMethods)}</div>
              <div>mfaError: {mfaError || 'null'}</div>
            </Box>
          )}
        </Paper>
      );
    }
  }

  // Always render the MFA method selection dialog for all variants
  return (
    <>
      {componentContent}
      <MfaMethodSelectionDialog
        open={mfaRequired || !!transaction}
        availableMethods={mfaAvailableMethods}
        onMethodSelected={handleMethodSelected}
        onCancel={handleMethodSelectionCancel}
        error={mfaError}
        transaction={transaction}
        onOtpVerify={handleOtpVerify}
        onPushVerify={handlePushVerify}
        onMfaSuccess={handleMfaSuccess}
        onResendOtp={handleResendOtp}
      />
    </>
  );
};