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
    mfaRequired, mfaAvailableMethods, mfaOtpMethods, mfaError, mfaUsername, mfaTransactionId, mfaContextId, mfaDeviceFingerprint, clearMfa, refreshSession, authService, showDeviceBindDialog, showESignDialog
  } = useAuth();
  const { transaction, initiateChallenge, verifyOtp, verifyPush, cancelTransaction, pollPushStatus } = useMfa();

  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [saveUsername, setSaveUsername] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Preserve original login state for MFA completion - use sessionStorage for persistence across remounts
  const getOriginalLoginData = () => {
    try {
      const stored = sessionStorage.getItem('ciam_mfa_original_login_data');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  };

  const setOriginalLoginData = (data: { username: string; saveUsername: boolean } | null) => {
    try {
      if (data) {
        sessionStorage.setItem('ciam_mfa_original_login_data', JSON.stringify(data));
      } else {
        sessionStorage.removeItem('ciam_mfa_original_login_data');
      }
    } catch {
      // Ignore storage errors
    }
  };

  // Component instance tracking for debugging
  const componentId = React.useRef(Math.random().toString(36).substr(2, 9));

  // Format last login timestamp from API data
  const formatLastLogin = () => {
    if (!user?.lastLoginAt) {
      return 'My Last Login: First time signing in';
    }

    const lastLoginDate = new Date(user.lastLoginAt);
    const options: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    };

    return `My Last Login: ${lastLoginDate.toLocaleDateString('en-US', options)}`;
  };

  // Debug: Log state from Provider
  console.log('CiamLoginComponent render - mfaRequired:', mfaRequired, 'mfaAvailableMethods:', mfaAvailableMethods, 'componentId:', componentId.current, 'originalLoginData:', getOriginalLoginData());

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  // Load saved username on component mount
  useEffect(() => {
    const savedUsername = usernameStorage.get();
    console.log('🔍 [MOUNT DEBUG] localStorage check:', {
      savedUsername,
      origin: window.location.origin,
      port: window.location.port,
      key: 'ciam_saved_username'
    });
    if (savedUsername) {
      setFormData(prev => ({
        ...prev,
        username: savedUsername,
      }));
      setSaveUsername(true);
      console.log('✅ [MOUNT DEBUG] Pre-populated username:', savedUsername);
    } else {
      console.log('❌ [MOUNT DEBUG] No saved username found');
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
    console.log('🚀 [SUBMIT DEBUG] Form submission:', {
      username: formData.username,
      saveUsername,
      currentUsernameVar: currentUsername,
      origin: window.location.origin
    });

    try {
      const result = await login(formData.username, formData.password);

      // v3.0.0: Check response_type_code with fallback to responseTypeCode
      const responseTypeCode = result.response_type_code || result.responseTypeCode;

      if (responseTypeCode === 'SUCCESS') {
        console.log('✅ Direct login success - completing authentication');

        // eSign requirement now comes directly in login response as ESIGN_REQUIRED
        // No need for post-login-check (deprecated flow removed)
        if (saveUsername) {
          usernameStorage.save(formData.username);
          console.log('💾 [SUCCESS DEBUG] Username saved to localStorage:', formData.username);
        } else {
          usernameStorage.remove();
          console.log('🗑️ [SUCCESS DEBUG] Username removed from localStorage');
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
      } else if (responseTypeCode === 'ESIGN_REQUIRED') {
        console.log('📝 eSign required after login - calling Provider');
        // Preserve login data for eSign completion
        setOriginalLoginData({
          username: currentUsername,
          saveUsername: saveUsername
        });

        // Use Provider's showESignDialog to manage state persistently
        showESignDialog(
          result.esign_document_id || '',
          result.transaction_id || result.context_id || '',
          true, // Login-level eSign is always mandatory
          currentUsername,
          saveUsername,
          '', // deviceFingerprint removed from v2.0.0 API
          async () => {
            // On complete callback - handle component-specific logic
            console.log('✅ eSign completed via Provider');

            // Use preserved original login data
            const loginDataToUse = getOriginalLoginData() || {
              username: formData.username,
              saveUsername: saveUsername
            };

            // Save username if checkbox was originally checked
            if (loginDataToUse.saveUsername && loginDataToUse.username) {
              usernameStorage.save(loginDataToUse.username);
            } else {
              usernameStorage.remove();
            }

            // Clear original login data
            setOriginalLoginData(null);

            // Clear form
            setFormData({
              username: loginDataToUse.saveUsername ? loginDataToUse.username : '',
              password: '',
            });

            // Complete login
            if (user) {
              onLoginSuccess?.(user);
            }

            if (autoRedirect && redirectUrl) {
              window.location.href = redirectUrl;
            }
          }
        );
      } else if (result.responseTypeCode === 'MFA_REQUIRED') {
        // Preserve original login data for MFA completion
        setOriginalLoginData({
          username: currentUsername,
          saveUsername: saveUsername
        });
        console.log('💾 [MFA REQUIRED] Preserved original login data:', {
          username: currentUsername,
          saveUsername: saveUsername
        });

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
      console.log('🚪 [LOGOUT DEBUG] Logout initiated, localStorage before:', {
        currentStorage: usernameStorage.get(),
        origin: window.location.origin
      });
      await logout();
      onLogout?.();
      setAnchorEl(null);
      console.log('🚪 [LOGOUT DEBUG] Logout completed, localStorage after:', {
        currentStorage: usernameStorage.get(),
        origin: window.location.origin
      });
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleMfaSuccess = async (mfaResponse: any) => {
    try {
      console.log('🟢 MFA Success - processing response:', mfaResponse);

      // Check for eSign requirement directly in MFA response (v3.0.0: check response_type_code with fallback)
      const responseTypeCode = mfaResponse.response_type_code || mfaResponse.responseTypeCode;
      if (responseTypeCode === 'ESIGN_REQUIRED') {
        console.log('📝 eSign required after MFA - calling Provider');

        // Use preserved original login data
        const loginDataToUse = getOriginalLoginData() || {
          username: formData.username,
          saveUsername: saveUsername
        };

        // Use Provider's showESignDialog to manage state persistently
        showESignDialog(
          mfaResponse.esign_document_id || '',
          mfaResponse.transaction_id || '',
          mfaResponse.is_mandatory || false,
          loginDataToUse.username,
          loginDataToUse.saveUsername,
          mfaResponse.transaction_id || '', // Pass transaction_id for device binding (backend handles fingerprint)
          async () => {
            // On complete callback
            console.log('✅ Post-MFA eSign completed via Provider');

            // Save username if checkbox was originally checked
            if (loginDataToUse.saveUsername && loginDataToUse.username) {
              usernameStorage.save(loginDataToUse.username);
            } else {
              usernameStorage.remove();
            }

            // Clear original login data
            setOriginalLoginData(null);

            // Clear form
            setFormData({
              username: loginDataToUse.saveUsername ? loginDataToUse.username : '',
              password: '',
            });

            // Complete login
            if (user) {
              onLoginSuccess?.(user);
            }

            if (autoRedirect && redirectUrl) {
              window.location.href = redirectUrl;
            }
          }
        );

        // Clear MFA dialog but keep original login data for eSign completion
        clearMfa();
        cancelTransaction();
        return; // Don't complete authentication yet, wait for eSign
      }

      // Use preserved original login data instead of current form state
      const loginDataToUse = getOriginalLoginData() || {
        username: formData.username,
        saveUsername: saveUsername
      };

      console.log('🔍 [MFA SUCCESS DEBUG] State at MFA completion:', {
        currentFormDataUsername: formData.username,
        currentSaveUsername: saveUsername,
        originalLoginData: getOriginalLoginData(),
        loginDataToUse: loginDataToUse,
        origin: window.location.origin,
        willSave: loginDataToUse.saveUsername,
        storageBefore: usernameStorage.get()
      });

      // Save username if checkbox was originally checked
      if (loginDataToUse.saveUsername && loginDataToUse.username) {
        usernameStorage.save(loginDataToUse.username);
        console.log('💾 [MFA SUCCESS DEBUG] Username saved to localStorage:', loginDataToUse.username);
        console.log('🔍 [MFA SUCCESS DEBUG] localStorage after save:', usernameStorage.get());
      } else {
        usernameStorage.remove();
        console.log('🗑️ [MFA SUCCESS DEBUG] Username removed from localStorage');
      }

      // Trigger session refresh to update Provider state with authenticated user
      await refreshSession();

      console.log('🟢 MFA Success - session refreshed, user should be authenticated');

      // Check if device binding should be offered
      console.log('🔍 [DEVICE BIND CHECK]', {
        mfaDeviceFingerprint,
        username: loginDataToUse.username,
        willShowDialog: !!(mfaDeviceFingerprint && loginDataToUse.username)
      });

      if (mfaDeviceFingerprint && loginDataToUse.username) {
        console.log('🔐 Offering device binding:', { username: loginDataToUse.username, deviceFingerprint: mfaDeviceFingerprint });

        // Clear MFA dialog immediately
        clearMfa();
        cancelTransaction();

        // Show device bind dialog (managed by provider, persists after component unmount)
        showDeviceBindDialog(loginDataToUse.username, mfaDeviceFingerprint, () => {
          // This callback runs after device bind (whether trusted or skipped)
          console.log('🔐 Device bind completed, finishing authentication flow');
          setOriginalLoginData(null);

          // Clear form (but keep username if saving)
          setFormData({
            username: loginDataToUse.saveUsername ? loginDataToUse.username : '',
            password: '',
          });

          onLoginSuccess?.(user!);

          if (autoRedirect && redirectUrl) {
            window.location.href = redirectUrl;
          }
        });

        return; // Don't complete authentication flow yet - wait for device bind dialog
      }

      // Clear MFA state after successful authentication - this will close the dialog
      clearMfa();
      cancelTransaction(); // Clear transaction state to close dialog immediately

      // Clear original login data since MFA is complete
      setOriginalLoginData(null);

      // Clear form (but keep username if saving)
      setFormData({
        username: loginDataToUse.saveUsername ? loginDataToUse.username : '',
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

  const handleMethodSelected = async (method: 'sms' | 'voice' | 'push') => {
    try {
      console.log('🔍 handleMethodSelected - checking values:', {
        method,
        mfaContextId,
        mfaTransactionId,
        mfaContextIdType: typeof mfaContextId,
        mfaTransactionIdType: typeof mfaTransactionId,
        mfaRequired,
        mfaAvailableMethods,
        mfaOtpMethods
      });

      // Use stored context_id and transaction_id from context (required for v3.0.0)
      if (!mfaContextId || !mfaTransactionId) {
        console.error('❌ Missing context_id or transaction_id for MFA initiate', {
          mfaContextId,
          mfaTransactionId
        });
        throw new Error('Missing context_id or transaction_id for MFA challenge');
      }

      // For OTP methods (sms/voice), we need to pass the mfa_option_id from the first available OTP method
      let mfaOptionId: number | undefined;
      if ((method === 'sms' || method === 'voice') && mfaOtpMethods && mfaOtpMethods.length > 0) {
        mfaOptionId = mfaOtpMethods[0].mfa_option_id;
      }

      console.log('🔍 handleMethodSelected called with:', {
        method,
        mfaContextId,
        mfaTransactionId,
        mfaOptionId,
      });

      await initiateChallenge(method, mfaContextId, mfaTransactionId, mfaOptionId);
      // MFA state transition is handled by the MFA hook
    } catch (error: any) {
      console.error('Failed to initiate MFA challenge:', error);
    }
  };

  const handleOtpVerify = async (otp: string) => {
    if (!transaction || !mfaContextId) return;

    try {
      const response = await verifyOtp(mfaContextId, transaction.transaction_id, otp);
      await handleMfaSuccess(response);
    } catch (error: any) {
      // Check if this is an invalid OTP error - invalidates session
      if (error.code === 'INVALID_MFA_CODE') {
        // Let error display for 2 seconds, then force login restart
        setTimeout(() => {
          console.log('🔴 Invalid OTP - returning to login');
          clearMfa('Invalid verification code. Please try again with the correct code.');
          cancelTransaction();
          setFormData({
            username: saveUsername ? formData.username : '',
            password: ''
          });
        }, 2000);
      }
      throw error; // Let the dialog handle the error display
    }
  };

  const handlePushVerify = async (pushResult: 'APPROVED' | 'REJECTED' = 'APPROVED', selectedNumber?: number) => {
    if (!transaction || !mfaContextId) return;

    try {
      const response = await verifyPush(mfaContextId, transaction.transaction_id);
      await handleMfaSuccess(response);
    } catch (error) {
      throw error; // Let the dialog handle the error display
    }
  };

  const handleMethodSelectionCancel = () => {
    console.log('🔴 handleMethodSelectionCancel called - clearing MFA state and resetting form');
    // When MFA dialog is cancelled, show appropriate error message on login screen
    // This handles push rejections, OTP failures, and user cancellations
    clearMfa('Multi-factor authentication was not completed. Please log in again.');
    cancelTransaction(); // Clear transaction state to close dialog immediately
    // Reset form fields (clear password, optionally keep username if saved)
    setFormData({
      username: saveUsername ? formData.username : '',
      password: ''
    });
  };

  const handleBackToMethodSelection = () => {
    console.log('🔙 User returning to MFA method selection');
    cancelTransaction(); // Clears transaction state → dialog shows method selection
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
    if (variant === 'inline') {
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
            <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 0.25 }}>
              {formatLastLogin()}
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
    if (variant === 'inline') {
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


          {/* Test credentials info */}
          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="textSecondary">
              Test credentials: testuser / password
            </Typography>
          </Box>

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
        onPollPushStatus={pollPushStatus}
        mfaContextId={mfaContextId}
        username={formData.username}
        onBackToMethodSelection={handleBackToMethodSelection}
      />
    </>
  );
};