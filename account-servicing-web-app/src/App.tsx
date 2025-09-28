import React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box } from '@mui/material';
import { CiamProtectedApp, useAuth } from 'ciam-ui';
import Navigation from './components/Navigation';
import SnapshotPage from './pages/SnapshotPage';
import LoginRedirect from './components/LoginRedirect';
import { brandTheme } from './theme/brandTheme';

const AuthenticatedContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  // Only render Navigation when authentication is confirmed
  // This prevents the navbar flicker during auth check
  if (!isAuthenticated || isLoading) {
    return null;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navigation />
      <Box component="main" sx={{ flexGrow: 1, backgroundColor: 'background.default' }}>
        <SnapshotPage />
      </Box>
    </Box>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider theme={brandTheme}>
      <CssBaseline />
      <CiamProtectedApp fallback={<LoginRedirect />}>
        <AuthenticatedContent />
      </CiamProtectedApp>
    </ThemeProvider>
  );
};

export default App;