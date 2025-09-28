import React, { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  useMediaQuery,
  useTheme,
  Avatar,
  Divider,
} from '@mui/material';
import {
  Menu as MenuIcon,
  AccountBox as AccountIcon,
  Logout as LogoutIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import { useAuth } from 'ciam-ui';
import SearchComponent from './SearchComponent';
import LoginSlideOut from './LoginSlideOut';

const Navigation: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileMenuAnchor, setMobileMenuAnchor] = useState<null | HTMLElement>(null);
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);
  const [loginSlideOutOpen, setLoginSlideOutOpen] = useState(false);

  const { isAuthenticated, user, logout } = useAuth();

  const accountServicingUrl = import.meta.env.VITE_ACCOUNT_SERVICING_URL || 'http://localhost:3003';

  const handleMobileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setMobileMenuAnchor(event.currentTarget);
  };

  const handleMobileMenuClose = () => {
    setMobileMenuAnchor(null);
  };

  const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setUserMenuAnchor(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setUserMenuAnchor(null);
  };

  const handleViewAccount = () => {
    // Direct to snapshot page to avoid CIAM UI flicker
    window.open(accountServicingUrl, '_self');
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

  const handleLoginClick = () => {
    setLoginSlideOutOpen(true);
  };

  const handleLoginSlideOutClose = () => {
    setLoginSlideOutOpen(false);
  };

  const handleSearch = (query: string) => {
    console.log('Search query:', query);
    // TODO: Implement search functionality
  };

  const mobileMenuItems = (
    <Menu
      anchorEl={mobileMenuAnchor}
      open={Boolean(mobileMenuAnchor)}
      onClose={handleMobileMenuClose}
      anchorOrigin={{
        vertical: 'top',
        horizontal: 'right',
      }}
      transformOrigin={{
        vertical: 'top',
        horizontal: 'right',
      }}
    >
      <MenuItem onClick={handleMobileMenuClose}>
        <Typography>About Us</Typography>
      </MenuItem>
      <MenuItem onClick={handleMobileMenuClose}>
        <Typography>Contact Us</Typography>
      </MenuItem>
      <MenuItem onClick={handleMobileMenuClose}>
        <Typography>Help</Typography>
      </MenuItem>
      {isAuthenticated && (
        <MenuItem onClick={() => {
          handleViewAccount();
          handleMobileMenuClose();
        }}>
          <AccountIcon sx={{ mr: 1 }} />
          <Typography>My Account</Typography>
        </MenuItem>
      )}
    </Menu>
  );

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
          {/* Left Section: Logo Only */}
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
              Storefront
            </Typography>
          </Box>

          {/* Spacer to push content to the right */}
          <Box sx={{ flexGrow: 1 }} />

          {/* Right Section: Navigation Links + Search + Login/User */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {/* Desktop Navigation Links - Right aligned */}
            {!isMobile && (
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
            )}
            {/* Search Component */}
            {!isMobile && (
              <SearchComponent
                onSearch={handleSearch}
                placeholder="Search..."
              />
            )}

            {/* User Account or Login Button - Fixed width container to prevent layout shift */}
            <Box sx={{ minWidth: 120, display: 'flex', justifyContent: 'flex-end' }}>
              {isAuthenticated ? (
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
                    minWidth: 120,
                    '&:hover': {
                      borderColor: theme.palette.primary.dark,
                      backgroundColor: theme.palette.primary.light,
                    },
                  }}
                >
                  {user?.given_name || user?.preferred_username || 'Account'}
                </Button>
              ) : (
                <Button
                  variant="contained"
                  onClick={handleLoginClick}
                  sx={{
                    textTransform: 'none',
                    fontSize: '14px',
                    fontWeight: 600,
                    px: 3,
                    py: 1,
                    backgroundColor: theme.palette.primary.main,
                    color: 'white',
                    minWidth: 120,
                    '&:hover': {
                      backgroundColor: theme.palette.primary.dark,
                    },
                  }}
                >
                  Log In
                </Button>
              )}
            </Box>

            {/* Mobile Menu Button */}
            {isMobile && (
              <IconButton
                onClick={handleMobileMenuOpen}
                sx={{
                  color: '#1A1A1A', // Dark icon for navigation (R26 G26 B26)
                  '&:hover': {
                    backgroundColor: theme.palette.grey[100],
                  },
                }}
              >
                <MenuIcon />
              </IconButton>
            )}
          </Box>
        </Toolbar>
      </AppBar>

      {/* Mobile Menu */}
      {mobileMenuItems}

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
            border: `1px solid #E0E0E0`,
            backgroundColor: '#FFFFFF',
          }
        }}
      >
        {/* User Info Header */}
        <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid #E0E0E0` }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#333333' }}>
            {user?.given_name} {user?.family_name}
          </Typography>
          <Typography variant="body2" sx={{ color: '#666666' }}>
            {user?.email}
          </Typography>
        </Box>

        {/* Menu Items */}
        <MenuItem onClick={handleViewAccount} sx={{ py: 1.5 }}>
          <AccountIcon sx={{ mr: 2, color: '#666666' }} />
          <Typography sx={{ color: '#333333' }}>My Account</Typography>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleLogout} sx={{ py: 1.5 }}>
          <LogoutIcon sx={{ mr: 2, color: '#666666' }} />
          <Typography sx={{ color: '#333333' }}>Sign Out</Typography>
        </MenuItem>
      </Menu>

      {/* Login Slide-Out */}
      <LoginSlideOut
        open={loginSlideOutOpen}
        onClose={handleLoginSlideOutClose}
      />
    </>
  );
};

export default Navigation;