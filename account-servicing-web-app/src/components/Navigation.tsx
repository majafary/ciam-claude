import React, { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Button,
  Menu,
  MenuItem,
  useTheme,
  Avatar,
  Divider,
} from '@mui/material';
import {
  Home as HomeIcon,
  Logout as LogoutIcon,
} from '@mui/icons-material';
import { useAuth } from 'ciam-ui';

const Navigation: React.FC = () => {
  const theme = useTheme();
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);

  const { user, logout } = useAuth();

  const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setUserMenuAnchor(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setUserMenuAnchor(null);
  };

  const handleGoToStorefront = () => {
    const storefrontUrl = import.meta.env.VITE_STOREFRONT_URL || 'http://localhost:3000';
    window.open(storefrontUrl, '_self');
    handleUserMenuClose();
  };


  const handleLogout = async () => {
    try {
      await logout();
      handleUserMenuClose();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <>
      <AppBar position="static" elevation={0}>
        <Toolbar
          sx={{
            display: 'flex',
            alignItems: 'center',
            minHeight: '64px',
            px: { xs: 2, md: 4 },
          }}
        >
          {/* Left Section: Logo */}
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography
              variant="h5"
              component="div"
              sx={{
                fontWeight: 700,
                color: '#1A1A1A', // Dark text for navigation logo (R26 G26 B26)
                cursor: 'pointer',
                letterSpacing: '-0.5px',
              }}
            >
              Account Servicing
            </Typography>
          </Box>

          {/* Spacer to push content to the right */}
          <Box sx={{ flexGrow: 1 }} />

          {/* Right Section: Navigation Links + User */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {/* Navigation Links */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, mr: 2 }}>
              <Button
                sx={{
                  color: '#1A1A1A', // Dark text for navigation (R26 G26 B26)
                  textTransform: 'none',
                  fontSize: '14px',
                  fontWeight: 500,
                  '&:hover': {
                    backgroundColor: 'transparent',
                    color: theme.palette.primary.main,
                  },
                }}
              >
                About Us
              </Button>
              <Button
                sx={{
                  color: '#1A1A1A', // Dark text for navigation (R26 G26 B26)
                  textTransform: 'none',
                  fontSize: '14px',
                  fontWeight: 500,
                  '&:hover': {
                    backgroundColor: 'transparent',
                    color: theme.palette.primary.main,
                  },
                }}
              >
                Contact Us
              </Button>
              <Button
                sx={{
                  color: '#1A1A1A', // Dark text for navigation (R26 G26 B26)
                  textTransform: 'none',
                  fontSize: '14px',
                  fontWeight: 500,
                  '&:hover': {
                    backgroundColor: 'transparent',
                    color: theme.palette.primary.main,
                  },
                }}
              >
                Help
              </Button>
            </Box>

            {/* User Account */}
            <Button
              onClick={handleUserMenuOpen}
              variant="outlined"
              startIcon={
                <Avatar
                  sx={{
                    width: 24,
                    height: 24,
                    bgcolor: theme.palette.primary.main,
                    fontSize: '12px'
                  }}
                >
                  {(user?.given_name?.[0] || user?.preferred_username?.[0] || 'U').toUpperCase()}
                </Avatar>
              }
              sx={{
                textTransform: 'none',
                fontSize: '14px',
                fontWeight: 500,
                borderColor: theme.palette.primary.main,
                color: theme.palette.primary.main,
                '&:hover': {
                  borderColor: theme.palette.primary.dark,
                  backgroundColor: theme.palette.primary.light,
                },
              }}
            >
              {user?.given_name || user?.preferred_username || 'Account'}
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      {/* User Menu */}
      <Menu
        anchorEl={userMenuAnchor}
        open={Boolean(userMenuAnchor)}
        onClose={handleUserMenuClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        sx={{
          '& .MuiPaper-root': {
            minWidth: 200,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            border: `1px solid ${theme.palette.grey[200]}`,
          }
        }}
      >
        {/* User Info Header */}
        <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${theme.palette.grey[200]}` }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {user?.given_name} {user?.family_name}
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {user?.email}
          </Typography>
        </Box>

        {/* Menu Items */}
        <MenuItem onClick={handleGoToStorefront} sx={{ py: 1.5 }}>
          <HomeIcon sx={{ mr: 2, color: theme.palette.text.secondary }} />
          <Typography>Storefront</Typography>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleLogout} sx={{ py: 1.5 }}>
          <LogoutIcon sx={{ mr: 2, color: theme.palette.text.secondary }} />
          <Typography>Sign Out</Typography>
        </MenuItem>
      </Menu>
    </>
  );
};

export default Navigation;