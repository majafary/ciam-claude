import React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box, CircularProgress } from '@mui/material';
import { ProtectedRoute, useAuth } from 'ciam-ui';
import Navigation from './components/Navigation';
import SnapshotPage from './pages/SnapshotPage';
import LoginRedirect from './components/LoginRedirect';
import { brandTheme } from './theme/brandTheme';

const App: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  // If not authenticated, redirect to CIAM login page
  if (!isLoading && !isAuthenticated) {
    return <LoginRedirect />;
  }

  if (isLoading) {
    return (
      <ThemeProvider theme={brandTheme}>
        <CssBaseline />
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <CircularProgress size={48} />
          <Box>Loading your account...</Box>
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={brandTheme}>
      <CssBaseline />
      <ProtectedRoute
        fallback={
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '100vh',
            }}
          >
            <CircularProgress />
          </Box>
        }
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <Navigation />
          <Box component="main" sx={{ flexGrow: 1, backgroundColor: 'background.default' }}>
            <SnapshotPage />
          </Box>
        </Box>
      </ProtectedRoute>
    </ThemeProvider>
  );
};

export default App;