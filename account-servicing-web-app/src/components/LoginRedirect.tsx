import React from 'react';
import { Box, Typography, Container } from '@mui/material';
import { CiamLoginComponent } from 'ciam-ui';

const LoginRedirect: React.FC = () => {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: 'background.default',
      }}
    >
      <Container maxWidth="sm">
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            p: 4,
            backgroundColor: 'white',
            borderRadius: 2,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          <Typography variant="h4" color="primary" textAlign="center">
            Account Servicing Portal
          </Typography>
          <Typography variant="body1" color="text.secondary" textAlign="center" sx={{ maxWidth: 400 }}>
            Please sign in to access your account servicing dashboard.
          </Typography>

          <Box sx={{ width: '100%', mt: 2 }}>
            <CiamLoginComponent />
          </Box>
        </Box>
      </Container>
    </Box>
  );
};

export default LoginRedirect;