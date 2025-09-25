import React, { useState } from 'react';
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
import { MfaComponent } from './MfaComponent';
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
  const { isAuthenticated, isLoading, user, error, login, logout, clearError } = useAuth();
  const { transaction, initiateChallenge } = useMfa();

  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [showMfa, setShowMfa] = useState(false);
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
      console.log("$THIS1");
    e.preventDefault();

    if (!formData.username || !formData.password) {
      return;
    }

    try {
      const result = await login(formData.username, formData.password);
      console.log("$THIS2:", result);
      if (result.responseTypeCode === 'SUCCESS') {
        // Login successful
        onLoginSuccess?.(user!);

        if (autoRedirect && redirectUrl) {
          window.location.href = redirectUrl;
        }

        // Clear form
        setFormData({ username: '', password: '' });
      } else if (result.responseTypeCode === 'MFA_REQUIRED') {
        // Start MFA challenge
        if (result.sessionId) {
          await initiateChallenge('otp', formData.username);
          setShowMfa(true);
        }
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

  const handleMfaSuccess = () => {
    setShowMfa(false);
    setFormData({ username: '', password: '' });
    onLoginSuccess?.(user!);

    if (autoRedirect && redirectUrl) {
      window.location.href = redirectUrl;
    }
  };

  const handleMfaCancel = () => {
    setShowMfa(false);
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  // Authenticated state - show user info
  if (isAuthenticated && user && showUserInfo) {
    if (variant === 'button') {
      return (
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
    }

    if (variant === 'inline') {
      return (
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
    }

    // Default form variant - authenticated
    return (
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

  // Show MFA component if MFA is required
  if (showMfa && transaction) {
    return (
      <MfaComponent
        transactionId={transaction.transactionId}
        method={transaction.method}
        onSuccess={handleMfaSuccess}
        onError={(error) => onLoginError?.(error)}
        onCancel={handleMfaCancel}
      />
    );
  }

  // Not authenticated - show login form
  if (variant === 'button') {
    return (
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
  }

  if (variant === 'inline') {
    return (
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
  }

  // Default form variant
  return (
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
    </Paper>
  );
};