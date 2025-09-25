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
} from '@mui/material';
import {
  Menu as MenuIcon,
  Store as StoreIcon,
  ShoppingCart as CartIcon,
  AccountBox as AccountIcon,
} from '@mui/icons-material';
import { CiamLoginComponent, useAuth } from 'ciam-ui';

const Navigation: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileMenuAnchor, setMobileMenuAnchor] = useState<null | HTMLElement>(null);

  const { isAuthenticated, user } = useAuth();

  const accountServicingUrl = import.meta.env.VITE_ACCOUNT_SERVICING_URL || 'http://localhost:3001';

  const handleMobileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setMobileMenuAnchor(event.currentTarget);
  };

  const handleMobileMenuClose = () => {
    setMobileMenuAnchor(null);
  };

  const handleViewAccount = () => {
    window.open(accountServicingUrl, '_self');
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
        <Typography>Products</Typography>
      </MenuItem>
      <MenuItem onClick={handleMobileMenuClose}>
        <Typography>About</Typography>
      </MenuItem>
      <MenuItem onClick={handleMobileMenuClose}>
        <Typography>Contact</Typography>
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
    <AppBar position="static" elevation={2}>
      <Toolbar>
        {/* Logo */}
        <Box sx={{ display: 'flex', alignItems: 'center', mr: 4 }}>
          <StoreIcon sx={{ mr: 1 }} />
          <Typography
            variant="h6"
            component="div"
            sx={{
              fontWeight: 'bold',
              color: 'inherit',
              textDecoration: 'none',
            }}
          >
            Storefront
          </Typography>
        </Box>

        {/* Desktop Navigation */}
        {!isMobile && (
          <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1, gap: 3 }}>
            <Button color="inherit">Products</Button>
            <Button color="inherit">About</Button>
            <Button color="inherit">Contact</Button>

            {/* Account Access Button - Only show when authenticated */}
            {isAuthenticated && (
              <Button
                color="inherit"
                variant="outlined"
                startIcon={<AccountIcon />}
                onClick={handleViewAccount}
                sx={{
                  ml: 2,
                  borderColor: 'rgba(255, 255, 255, 0.5)',
                  '&:hover': {
                    borderColor: 'white',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  },
                }}
              >
                View My Account
              </Button>
            )}
          </Box>
        )}

        {/* Spacer for mobile */}
        {isMobile && <Box sx={{ flexGrow: 1 }} />}

        {/* Shopping Cart Icon */}
        <IconButton color="inherit" sx={{ mr: 1 }}>
          <CartIcon />
        </IconButton>

        {/* CIAM Login Component */}
        <Box sx={{ ml: 2 }}>
          <CiamLoginComponent
            variant={isMobile ? 'button' : 'inline'}
            showUserInfo={true}
            customStyles={{
              color: 'white',
              '& .MuiTextField-root': {
                '& .MuiOutlinedInput-root': {
                  color: 'white',
                  '& fieldset': {
                    borderColor: 'rgba(255, 255, 255, 0.5)',
                  },
                  '&:hover fieldset': {
                    borderColor: 'rgba(255, 255, 255, 0.7)',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: 'white',
                  },
                },
                '& .MuiInputLabel-root': {
                  color: 'rgba(255, 255, 255, 0.7)',
                },
              },
              '& .MuiButton-root': {
                color: 'white',
                borderColor: 'rgba(255, 255, 255, 0.5)',
                '&:hover': {
                  borderColor: 'white',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                },
              },
            }}
            onLoginSuccess={(user) => {
              console.log('Navigation: User logged in:', user);
            }}
          />
        </Box>

        {/* Mobile Menu Button */}
        {isMobile && (
          <IconButton
            color="inherit"
            onClick={handleMobileMenuOpen}
            sx={{ ml: 1 }}
          >
            <MenuIcon />
          </IconButton>
        )}
      </Toolbar>

      {/* Mobile Menu */}
      {mobileMenuItems}

      {/* Account Access Banner - Mobile Only */}
      {isMobile && isAuthenticated && (
        <Box
          sx={{
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            px: 2,
            py: 1,
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <Button
            fullWidth
            variant="outlined"
            startIcon={<AccountIcon />}
            onClick={handleViewAccount}
            sx={{
              color: 'white',
              borderColor: 'rgba(255, 255, 255, 0.5)',
              '&:hover': {
                borderColor: 'white',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
              },
            }}
          >
            View My Account
          </Button>
        </Box>
      )}
    </AppBar>
  );
};

export default Navigation;