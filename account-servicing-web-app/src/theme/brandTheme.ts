import { createTheme } from '@mui/material/styles';

// Brand colors matching exact digital color meter reading
const brandColors = {
  primary: '#2C0B40', // Exact brand purple (R44 G11 B64)
  secondary: '#000000', // Black
  white: '#FFFFFF',
  lightGray: '#F5F5F5',
  darkGray: '#333333',
  purple: {
    50: '#F3E5F5',
    100: '#E1BEE7',
    200: '#CE93D8',
    300: '#BA68C8',
    400: '#AB47BC',
    500: '#2C0B40', // Main brand purple (R44 G11 B64)
    600: '#260938',
    700: '#200730',
    800: '#1A0628',
    900: '#140420',
  },
};

// Create modern banking-inspired Material-UI theme
export const brandTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: brandColors.primary,
      light: brandColors.purple[300],
      dark: brandColors.purple[700],
      contrastText: brandColors.white,
    },
    secondary: {
      main: brandColors.secondary,
      contrastText: brandColors.white,
    },
    background: {
      default: brandColors.primary, // Purple background matching storefront exactly
      paper: brandColors.white,      // White paper background for cards
    },
    text: {
      primary: '#333333',        // Dark text for readability on white
      secondary: '#666666',      // Secondary text
    },
    grey: {
      50: '#FAFAFA',
      100: '#F5F5F5',
      200: '#EEEEEE',
      300: '#E0E0E0',
      400: '#BDBDBD',
      500: '#9E9E9E',
      600: '#757575',
      700: '#616161',
      800: '#424242',
      900: '#212121',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontWeight: 600,
      color: '#333333',
    },
    h2: {
      fontWeight: 600,
      color: '#333333',
    },
    h3: {
      fontWeight: 600,
      color: '#333333',
    },
    h4: {
      fontWeight: 600,
      color: '#333333',
    },
    h5: {
      fontWeight: 600,
      color: '#333333',
    },
    h6: {
      fontWeight: 600,
      color: '#333333',
    },
    button: {
      fontWeight: 500,
      textTransform: 'none',
    },
  },
  components: {
    // AppBar styling for navigation - matching storefront
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: brandColors.white, // White navigation
          color: '#1A1A1A',                   // Dark nav text (R26 G26 B26)
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          borderBottom: `1px solid ${brandColors.purple[100]}`,
        },
      },
    },
    // Button styling - matching storefront
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '6px',
          textTransform: 'none',
          fontWeight: 500,
          padding: '8px 16px',
        },
        contained: {
          backgroundColor: brandColors.primary,
          color: brandColors.white,
          '&:hover': {
            backgroundColor: brandColors.purple[700],
          },
        },
        outlined: {
          borderColor: brandColors.primary,
          color: brandColors.primary,
          '&:hover': {
            borderColor: brandColors.purple[700],
            backgroundColor: brandColors.purple[50],
          },
        },
        text: {
          color: '#1A1A1A', // Dark navigation text (R26 G26 B26)
          '&:hover': {
            backgroundColor: brandColors.purple[50],
            color: brandColors.primary,
          },
        },
      },
    },
    // Toolbar styling - matching storefront
    MuiToolbar: {
      styleOverrides: {
        root: {
          minHeight: '64px',
          padding: '0 24px',
          '@media (min-width: 600px)': {
            minHeight: '64px',
          },
        },
      },
    },
    // Card styling for account sections
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          border: `1px solid ${brandColors.purple[100]}`,
        },
      },
    },
    // Icon Button styling - matching storefront
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: '#1A1A1A', // Dark navigation icons (R26 G26 B26)
          '&:hover': {
            backgroundColor: brandColors.purple[50],
            color: brandColors.primary,
          },
        },
      },
    },
  },
});

export default brandTheme;