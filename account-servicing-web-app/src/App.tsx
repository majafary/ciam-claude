import React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box } from '@mui/material';
import { CiamProtectedApp } from 'ciam-ui';
import Navigation from './components/Navigation';
import SnapshotPage from './pages/SnapshotPage';
import LoginRedirect from './components/LoginRedirect';
import { brandTheme } from './theme/brandTheme';

const App: React.FC = () => {
  return (
    <ThemeProvider theme={brandTheme}>
      <CssBaseline />
      <CiamProtectedApp fallback={<LoginRedirect />}>
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <Navigation />
          <Box component="main" sx={{ flexGrow: 1, backgroundColor: 'background.default' }}>
            <SnapshotPage />
          </Box>
        </Box>
      </CiamProtectedApp>
    </ThemeProvider>
  );
};

export default App;