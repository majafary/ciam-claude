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
  FormControlLabel,
  Checkbox,
  InputAdornment,
  IconButton,
  Link,
} from '@mui/material';
import {
  Login as LoginIcon,
  Person as PersonIcon,
  Logout as LogoutIcon,
  AccountCircle as AccountCircleIcon,
  Visibility,
  VisibilityOff,
  Lock as LockIcon,
} from '@mui/icons-material';
import { useAuth } from '../hooks/useAuth';
import { useMfa } from '../hooks/useMfa';
import { MfaMethodSelectionDialog } from './MfaMethodSelectionDialog';
import { CiamLoginComponentProps } from '../types';
import { usernameStorage } from '../utils/usernameStorage';

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
    mfaRequired, mfaAvailableMethods, mfaError, mfaUsername, clearMfa, refreshSession, authService
  } = useAuth();
  const { transaction, initiateChallenge, verifyOtp, verifyPush, cancelTransaction, checkStatus } = useMfa();

  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [saveUsername, setSaveUsername] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Debug: Log state from Provider
  console.log('CiamLoginComponent render - mfaRequired:', mfaRequired, 'mfaAvailableMethods:', mfaAvailableMethods);

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  // Load saved username on component mount
  useEffect(() => {
    const savedUsername = usernameStorage.get();
    if (savedUsername) {
      setFormData(prev => ({
        ...prev,
        username: savedUsername,
      }));
      setSaveUsername(true);
    }
  }, []);

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

  const handleSaveUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setSaveUsername(checked);

    // If unchecking, remove saved username immediately
    if (!checked) {
      usernameStorage.remove();
    }
  };

  const handleTogglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.username || !formData.password) {
      return;
    }

    const currentUsername = formData.username; // Preserve username for MFA

    try {
      const result = await login(formData.username, formData.password);

      if (result.responseTypeCode === 'SUCCESS') {
        // Save username if checkbox is checked
        if (saveUsername) {
          usernameStorage.save(formData.username);
        } else {
          usernameStorage.remove();
        }

        // Login successful
        onLoginSuccess?.(user!);

        if (autoRedirect && redirectUrl) {
          window.location.href = redirectUrl;
        }

        // Clear form (but keep username if saving)
        setFormData({
          username: saveUsername ? formData.username : '',
          password: '',
        });
      } else if (result.responseTypeCode === 'MFA_REQUIRED') {
        // MFA state is now handled centrally in the Provider
        // Clear password for security but keep username for MFA challenge
        setFormData({ username: currentUsername, password: '' });
        console.log('MFA REQUIRED - Provider will handle MFA state');
        console.log('🔍 Username preserved for MFA:', currentUsername);
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

      // Save username if checkbox is checked
      if (saveUsername) {
        usernameStorage.save(formData.username);
      } else {
        usernameStorage.remove();
      }

      // Trigger session refresh to update Provider state with authenticated user
      await refreshSession();

      console.log('🟢 MFA Success - session refreshed, user should be authenticated');

      // Clear MFA state after successful authentication - this will close the dialog
      clearMfa();
      cancelTransaction(); // Clear transaction state to close dialog immediately

      // Clear form (but keep username if saving)
      setFormData({
        username: saveUsername ? formData.username : '',
        password: '',
      });

      // Call onLoginSuccess immediately to trigger slide-out closure
      onLoginSuccess?.(user!);

      // Note: Provider will also update user state after refreshSession
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
      // Use stored username from context (preferred) or fallback to local form state
      const usernameToUse = mfaUsername || formData.username;
      console.log('🔍 handleMethodSelected called with:', {
        method,
        mfaUsername,
        formDataUsername: formData.username,
        usernameToUse
      });

      await initiateChallenge(method, usernameToUse);
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

  const handlePushVerify = async (pushResult: 'APPROVED' | 'REJECTED' = 'APPROVED', selectedNumber?: number) => {
    if (!transaction) return;

    try {
      const response = await verifyPush(transaction.transactionId, pushResult, selectedNumber);
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
      // Single column layout for slide-out usage
      componentContent = (
        <Box className={className} sx={{ ...customStyles }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box
            component="form"
            onSubmit={handleSubmit}
            autoComplete="off"
            role="form"
            aria-label="Login form"
          >
            {/* Username Field with Person Icon */}
            <Box sx={{ mb: 2 }}>
              <Typography
                component="label"
                htmlFor="inline-username"
                sx={{
                  display: 'block',
                  mb: 1,
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'text.primary'
                }}
              >
                Username
              </Typography>
              <TextField
                id="inline-username"
                name="username"
                fullWidth
                value={formData.username}
                onChange={handleInputChange}
                disabled={isLoading}
                error={Boolean(error)}
                autoComplete="username"
                autoFocus
                required
                aria-label="Enter Username"
                aria-required="true"
                inputProps={{
                  'data-private': 'true',
                  'aria-label': 'Enter Username',
                  maxLength: 50
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                    </InputAdornment>
                  ),
                  sx: {
                    '& .MuiOutlinedInput-input': {
                      padding: '12px 14px 12px 0'
                    }
                  }
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    // Use theme default purple background
                  }
                }}
              />
            </Box>

            {/* Password Field with Eye Icon */}
            <Box sx={{ mb: 2 }}>
              <Typography
                component="label"
                htmlFor="inline-password"
                sx={{
                  display: 'block',
                  mb: 1,
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'text.primary'
                }}
              >
                Password
              </Typography>
              <TextField
                id="inline-password"
                name="password"
                fullWidth
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={handleInputChange}
                disabled={isLoading}
                error={Boolean(error)}
                autoComplete="current-password"
                required
                aria-label="Enter Password"
                aria-required="true"
                inputProps={{
                  'data-private': 'true',
                  'aria-label': 'Enter Password',
                  maxLength: 50
                }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={handleTogglePasswordVisibility}
                        edge="end"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        disabled={isLoading}
                        size="small"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                  sx: {
                    '& .MuiOutlinedInput-input': {
                      padding: '12px 14px'
                    }
                  }
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    // Use theme default purple background
                  }
                }}
              />
              {/* Screen reader feedback for password visibility */}
              <Box
                component="span"
                aria-live="polite"
                aria-atomic="false"
                aria-relevant="all"
                sx={{
                  position: 'absolute',
                  border: 0,
                  width: '1px',
                  height: '1px',
                  padding: 0,
                  margin: '-1px',
                  overflow: 'hidden',
                  clip: 'rect(0px, 0px, 0px, 0px)',
                  whiteSpace: 'nowrap'
                }}
              >
                {showPassword ? 'showing password' : 'hiding password'}
              </Box>
            </Box>

            {/* Login Button and Save Username */}
            <Box sx={{ mb: 2 }}>
              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={isLoading || !formData.username || !formData.password}
                startIcon={isLoading ? <CircularProgress size={20} /> : undefined}
                sx={{
                  mb: 2,
                  py: 1.5,
                  fontSize: '1rem',
                  fontWeight: 600,
                  textTransform: 'none'
                }}
                aria-label="Log In"
              >
                {isLoading ? 'Signing In...' : 'Log In'}
              </Button>

              <FormControlLabel
                control={
                  <Checkbox
                    id="inline-rememberMeFlag"
                    checked={saveUsername}
                    onChange={handleSaveUsernameChange}
                    size="small"
                    role="checkbox"
                    aria-checked={saveUsername}
                  />
                }
                label={
                  <Typography
                    component="label"
                    htmlFor="inline-rememberMeFlag"
                    sx={{ fontSize: '0.875rem' }}
                  >
                    Save username
                  </Typography>
                }
                sx={{ margin: 0 }}
              />
            </Box>
          </Box>
        </Box>
      );
    } else {
      // Default form variant
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
          {/* Header with Lock Icon */}
          <Box sx={{ mb: 3 }}>
            <Typography
              variant="h6"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                fontWeight: 600,
                mb: 0
              }}
              tabIndex={-1}
              role="heading"
              aria-level={2}
            >
              <LockIcon sx={{ fontSize: 20 }} />
              Log in
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {/* Form Section */}
          <Box
            component="form"
            onSubmit={handleSubmit}
            autoComplete="off"
            role="form"
            aria-label="Login form"
          >
            {/* Username Field with Person Icon */}
            <Box sx={{ mb: 2 }}>
              <Typography
                component="label"
                htmlFor="username"
                sx={{
                  display: 'block',
                  mb: 1,
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'text.primary'
                }}
              >
                Username
              </Typography>
              <TextField
                id="username"
                name="username"
                fullWidth
                value={formData.username}
                onChange={handleInputChange}
                disabled={isLoading}
                error={Boolean(error)}
                autoComplete="username"
                autoFocus
                required
                aria-label="Enter Username"
                aria-required="true"
                inputProps={{
                  'data-private': 'true',
                  'aria-label': 'Enter Username',
                  maxLength: 50
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                    </InputAdornment>
                  ),
                  sx: {
                    '& .MuiOutlinedInput-input': {
                      padding: '12px 14px 12px 0'
                    }
                  }
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    // Use theme default purple background
                  }
                }}
              />
            </Box>

            {/* Password Field with Eye Icon */}
            <Box sx={{ mb: 2 }}>
              <Typography
                component="label"
                htmlFor="password"
                sx={{
                  display: 'block',
                  mb: 1,
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'text.primary'
                }}
              >
                Password
              </Typography>
              <TextField
                id="password"
                name="password"
                fullWidth
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={handleInputChange}
                disabled={isLoading}
                error={Boolean(error)}
                autoComplete="current-password"
                required
                aria-label="Enter Password"
                aria-required="true"
                inputProps={{
                  'data-private': 'true',
                  'aria-label': 'Enter Password',
                  maxLength: 50
                }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={handleTogglePasswordVisibility}
                        edge="end"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        disabled={isLoading}
                        size="small"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                  sx: {
                    '& .MuiOutlinedInput-input': {
                      padding: '12px 14px'
                    }
                  }
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    // Use theme default purple background
                  }
                }}
              />
              {/* Screen reader feedback for password visibility */}
              <Box
                component="span"
                aria-live="polite"
                aria-atomic="false"
                aria-relevant="all"
                sx={{
                  position: 'absolute',
                  border: 0,
                  width: '1px',
                  height: '1px',
                  padding: 0,
                  margin: '-1px',
                  overflow: 'hidden',
                  clip: 'rect(0px, 0px, 0px, 0px)',
                  whiteSpace: 'nowrap'
                }}
              >
                {showPassword ? 'showing password' : 'hiding password'}
              </Box>
            </Box>

            {/* Login Button and Save Username */}
            <Box sx={{ mb: 2 }}>
              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={isLoading || !formData.username || !formData.password}
                startIcon={isLoading ? <CircularProgress size={20} /> : undefined}
                sx={{
                  mb: 2,
                  py: 1.5,
                  fontSize: '1rem',
                  fontWeight: 600,
                  textTransform: 'none'
                }}
                aria-label="Log In"
              >
                {isLoading ? 'Signing In...' : 'Log In'}
              </Button>

              <FormControlLabel
                control={
                  <Checkbox
                    id="rememberMeFlag"
                    checked={saveUsername}
                    onChange={handleSaveUsernameChange}
                    size="small"
                    role="checkbox"
                    aria-checked={saveUsername}
                  />
                }
                label={
                  <Typography
                    component="label"
                    htmlFor="rememberMeFlag"
                    sx={{ fontSize: '0.875rem' }}
                  >
                    Save username
                  </Typography>
                }
                sx={{ margin: 0 }}
              />
            </Box>
          </Box>

          {/* Footer Links Section */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Forgot{' '}
              <Link
                href="#"
                underline="always"
                onClick={(e) => e.preventDefault()}
                aria-label="Forgot username"
                sx={{ color: 'primary.main' }}
              >
                username
              </Link>
              {' '}or{' '}
              <Link
                href="#"
                underline="always"
                onClick={(e) => e.preventDefault()}
                aria-label="Forgot password"
                sx={{ color: 'primary.main' }}
              >
                password
              </Link>
              ?
            </Typography>
            <Typography variant="body2">
              <Link
                href="#"
                underline="always"
                onClick={(e) => e.preventDefault()}
                aria-label="Set up username and password"
                sx={{ color: 'primary.main' }}
              >
                Set up username and password
              </Link>
            </Typography>
          </Box>

          {/* More to do Section */}
          <Box sx={{ mb: 2 }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                mb: 1,
                color: 'text.primary'
              }}
              tabIndex={-1}
              component="h3"
            >
              More to do
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Button
                variant="text"
                onClick={(e) => e.preventDefault()}
                aria-label="Manage your Home Loan"
                sx={{
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  textTransform: 'none',
                  p: 0,
                  color: 'primary.main',
                  '&:hover': {
                    backgroundColor: 'transparent',
                    textDecoration: 'underline'
                  }
                }}
              >
                Manage your Home Loan
              </Button>
              <Link
                href="#"
                onClick={(e) => e.preventDefault()}
                underline="hover"
                aria-label="Complete a saved auto refinance application"
                sx={{
                  color: 'primary.main',
                  fontSize: '0.875rem',
                  display: 'block'
                }}
              >
                Complete a saved auto refinance or lease buyout application
              </Link>
            </Box>
          </Box>

          {/* Test credentials info */}
          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="textSecondary">
              Test credentials: testuser / password
            </Typography>
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
        onCheckStatus={checkStatus}
        username={formData.username}
      />
    </>
  );
};