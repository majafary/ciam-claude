import React, { useEffect } from 'react';
import {
  Drawer,
  Box,
  IconButton,
  Typography,
  useTheme,
  useMediaQuery,
  Divider,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { CiamLoginComponent, useAuth } from 'ciam-ui';

interface LoginSlideOutProps {
  open: boolean;
  onClose: () => void;
}

const LoginSlideOut: React.FC<LoginSlideOutProps> = ({ open, onClose }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { isAuthenticated } = useAuth();
  const [wasAuthenticatedOnOpen, setWasAuthenticatedOnOpen] = React.useState(false);

  // Track auth state when drawer opens
  useEffect(() => {
    if (open) {
      setWasAuthenticatedOnOpen(isAuthenticated);
    }
  }, [open, isAuthenticated]);

  // Auto-close drawer only when user BECOMES authenticated (transition from false to true)
  useEffect(() => {
    if (isAuthenticated && open && !wasAuthenticatedOnOpen) {
      console.log('🚀 LoginSlideOut: User newly authenticated, auto-closing drawer');
      onClose();
    }
  }, [isAuthenticated, open, wasAuthenticatedOnOpen, onClose]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{
        '& .MuiDrawer-paper': {
          width: isMobile ? '100%' : '400px',
          maxWidth: '100vw',
          backgroundColor: 'white',
          borderLeft: `3px solid ${theme.palette.primary.main}`,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        },
      }}
      ModalProps={{
        keepMounted: false,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 3,
          pb: 2,
          borderBottom: `1px solid ${theme.palette.grey[200]}`,
        }}
      >
        <Typography
          variant="h5"
          sx={{
            fontWeight: 600,
            color: theme.palette.primary.main,
          }}
        >
          Log In
        </Typography>
        <IconButton
          onClick={onClose}
          sx={{
            color: theme.palette.text.secondary,
            '&:hover': {
              backgroundColor: theme.palette.grey[100],
            },
          }}
        >
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Content */}
      <Box
        sx={{
          flex: 1,
          p: 3,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {/* Welcome Message */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="body1" sx={{ color: '#666' }}>
            Welcome back! Please sign in to your account.
          </Typography>
        </Box>

        {/* CIAM Login Component */}
        <CiamLoginComponent
          variant="inline"
          showUserInfo={false}
          customStyles={{
            width: '100%',
            // Form container styling
            '& > div': {
              width: '100%',
            },
            // Text field styling
            '& .MuiTextField-root': {
              width: '100%',
              marginBottom: '16px',
              '& .MuiOutlinedInput-root': {
                backgroundColor: 'white',
                '& fieldset': {
                  borderRadius: '8px',
                  borderColor: theme.palette.grey[300],
                },
                '&.Mui-error fieldset': {
                  borderColor: '#dc2626',
                  borderWidth: '2px',
                },
                '&:hover fieldset': {
                  borderColor: theme.palette.primary.main,
                },
                '&.Mui-focused fieldset': {
                  borderColor: theme.palette.primary.main,
                },
              },
              '& .MuiInputBase-input': {
                padding: '14px 16px',
                fontSize: '16px',
                color: '#333',
              },
              '& .MuiInputLabel-root': {
                color: '#666',
                '&.Mui-focused': {
                  color: theme.palette.primary.main,
                },
              },
            },
            // Button styling
            '& .MuiButton-root': {
              width: '100%',
              padding: '12px 24px',
              fontSize: '16px',
              fontWeight: 600,
              borderRadius: '8px',
              textTransform: 'none',
              marginTop: '8px',
              backgroundColor: theme.palette.primary.main,
              color: 'white',
              '&:hover': {
                backgroundColor: theme.palette.primary.dark,
              },
              '&:disabled': {
                backgroundColor: theme.palette.grey[300],
                color: theme.palette.grey[500],
              },
            },
            // Alert styling for errors - professional and subtle
            '& .MuiAlert-root': {
              borderRadius: '8px',
              marginBottom: '16px',
              fontWeight: 500,
              fontSize: '14px',
              '&.MuiAlert-standardError': {
                backgroundColor: '#fef2f2',
                color: '#991b1b',
                border: '1px solid #fecaca',
                '& .MuiAlert-icon': {
                  color: '#dc2626',
                },
              },
              '&.MuiAlert-standardSuccess': {
                backgroundColor: '#f0fdf4',
                color: '#166534',
                border: '1px solid #bbf7d0',
                '& .MuiAlert-icon': {
                  color: '#16a34a',
                },
              },
            },
            // Loading spinner
            '& .MuiCircularProgress-root': {
              color: theme.palette.primary.main,
            },
            // Checkbox styling for "Save username"
            '& .MuiFormControlLabel-root': {
              '& .MuiFormControlLabel-label': {
                color: '#000 !important',
                fontSize: '14px',
                fontWeight: 500,
              },
              '& .MuiCheckbox-root': {
                color: theme.palette.primary.main,
                '&.Mui-checked': {
                  color: theme.palette.primary.main,
                },
              },
              // Target Typography component directly with maximum specificity
              '& .MuiTypography-root': {
                color: '#000 !important',
                fontSize: '14px !important',
              },
              // Also target label Typography specifically
              '& label.MuiTypography-root': {
                color: '#000 !important',
              },
            },
            // Target specific checkbox label by its ID
            '& label[for="inline-rememberMeFlag"]': {
              color: '#000 !important',
              fontSize: '14px !important',
            },
            // Global override for Save username text
            '& label[for="inline-rememberMeFlag"].MuiTypography-root': {
              color: '#000 !important',
            },
            // User info display (when logged in)
            '& .user-info': {
              padding: '16px',
              backgroundColor: theme.palette.grey[50],
              borderRadius: '8px',
              border: `1px solid ${theme.palette.grey[200]}`,
            },
            // Fix Avatar and PersonIcon sizing to prevent stretching
            '& .MuiAvatar-root': {
              width: '32px !important',
              height: '32px !important',
              flexShrink: 0,
              '& svg': {
                width: '20px',
                height: '20px',
              },
            },
            // Ensure PersonIcon maintains aspect ratio
            '& .MuiSvgIcon-root': {
              '&[data-testid="PersonIcon"]': {
                width: '20px',
                height: '20px',
                flexShrink: 0,
              },
            },
            // MFA component styling
            '& .mfa-container': {
              '& .MuiToggleButtonGroup-root': {
                width: '100%',
                marginBottom: '16px',
                '& .MuiToggleButton-root': {
                  flex: 1,
                  padding: '12px',
                  borderColor: theme.palette.grey[300],
                  '&.Mui-selected': {
                    backgroundColor: theme.palette.primary.main,
                    color: 'white',
                    '&:hover': {
                      backgroundColor: theme.palette.primary.dark,
                    },
                  },
                },
              },
            },
          }}
          onLoginSuccess={(user) => {
            console.log('🚀 LoginSlideOut: onLoginSuccess called with user:', user);
            console.log('🚀 LoginSlideOut: Calling onClose() to close drawer');
            // Close immediately on successful login for smooth UX
            onClose();
            console.log('🚀 LoginSlideOut: onClose() called');
          }}
          onLoginError={(error) => {
            console.error('LoginSlideOut: Login failed:', error);
          }}
        />

        {/* Footer Links */}
        <Divider sx={{ my: 2 }} />
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            alignItems: 'center',
          }}
        >
          <Typography
            variant="body2"
            sx={{
              color: theme.palette.primary.main,
              cursor: 'pointer',
              textDecoration: 'underline',
              '&:hover': {
                color: theme.palette.primary.dark,
              },
            }}
          >
            Forgot your password?
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: theme.palette.primary.main,
              cursor: 'pointer',
              textDecoration: 'underline',
              '&:hover': {
                color: theme.palette.primary.dark,
              },
            }}
          >
            Don't have an account? Sign up
          </Typography>
        </Box>
      </Box>
    </Drawer>
  );
};

export default LoginSlideOut;