import React from 'react';
import {
  Container,
  Box,
  Typography,
  Button,
  Grid,
  Paper,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { useAuth } from 'ciam-ui';
import BankingPromo from '../components/BankingPromo';



const StorefrontPage: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { isAuthenticated, user } = useAuth();


  return (
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
          color: 'white',
          py: { xs: 4, md: 8 },
        }}
      >
        <Container>
          <Grid container spacing={4} alignItems="center">
            <Grid item xs={12} md={6}>
              <Typography
                variant={isMobile ? 'h3' : 'h2'}
                component="h1"
                gutterBottom
                sx={{ fontWeight: 'bold' }}
              >
                Welcome to Storefront
              </Typography>
              <Typography
                variant="h6"
                sx={{ mb: 3, opacity: 0.9 }}
              >
                Every great journey needs a great partner. We're proud to be yours!
              </Typography>

              {isAuthenticated && user && (
                <Box sx={{ mb: 3 }}>
                  <Paper
                    sx={{
                      p: 2,
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      backdropFilter: 'blur(10px)',
                    }}
                  >
                    <Typography variant="h6" sx={{ mb: 1 }}>
                      Welcome back, {user.given_name || user.preferred_username}! 👋
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                      Enjoy the benefits of membership.
                    </Typography>
                  </Paper>
                </Box>
              )}

              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  size="large"
                  sx={{
                    backgroundColor: 'white',
                    color: 'primary.main',
                    '&:hover': {
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    },
                  }}
                >
                  Open Account
                </Button>
              </Box>
            </Grid>

            <Grid item xs={12} md={6}>
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <BankingPromo width={500} height={400} />
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>



      {/* Newsletter Section */}
      <Box
        sx={{
          py: { xs: 4, md: 6 },
          backgroundColor: 'white',
          color: theme.palette.primary.main,
        }}
      >
        <Container>
          <Grid container spacing={4} alignItems="center">
            <Grid item xs={12} md={6}>
              <Typography variant="h4" gutterBottom>
                Stay Updated
              </Typography>
            </Grid>
          </Grid>
        </Container>
      </Box>
    </Box>
  );
};

export default StorefrontPage;