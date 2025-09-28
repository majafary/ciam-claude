import React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box } from '@mui/material';
import Navigation from './components/Navigation';
import StorefrontPage from './pages/StorefrontPage';
import { brandTheme } from './theme/brandTheme';

const App: React.FC = () => {
  return (
    <ThemeProvider theme={brandTheme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Navigation />
        <Box component="main" sx={{ flexGrow: 1 }}>
          <StorefrontPage />
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default App;