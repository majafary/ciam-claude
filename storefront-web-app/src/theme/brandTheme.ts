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
      default: brandColors.primary, // Purple background by default
      paper: brandColors.primary,   // Purple paper background
    },
    text: {
      primary: '#FFFFFF',     // Pure white text (R255 G255 B255)
      secondary: '#FFFFFF',   // Pure white for secondary text too
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
      color: '#FFFFFF', // Pure white (R255 G255 B255)
    },
    h2: {
      fontWeight: 600,
      color: '#FFFFFF', // Pure white (R255 G255 B255)
    },
    h3: {
      fontWeight: 600,
      color: '#FFFFFF', // Pure white (R255 G255 B255)
    },
    h4: {
      fontWeight: 600,
      color: '#FFFFFF', // Pure white (R255 G255 B255)
    },
    h5: {
      fontWeight: 600,
      color: '#FFFFFF', // Pure white (R255 G255 B255)
    },
    h6: {
      fontWeight: 600,
      color: '#FFFFFF', // Pure white (R255 G255 B255)
    },
    button: {
      fontWeight: 500,
      textTransform: 'none',
    },
  },
  components: {
    // AppBar styling for navigation
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: brandColors.white, // Keep navigation white for contrast
          color: '#1A1A1A',                   // Dark nav text (R26 G26 B26)
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          borderBottom: `1px solid ${brandColors.purple[100]}`,
        },
      },
    },
    // Button styling
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
    // Toolbar styling
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
    // Drawer styling for slide-out
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: brandColors.white,
          borderLeft: `2px solid ${brandColors.primary}`,
        },
      },
    },
    // TextField styling
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: brandColors.primary, // Purple background
            color: brandColors.white, // White text
            '& fieldset': {
              borderColor: brandColors.purple[300],
            },
            '&:hover fieldset': {
              borderColor: brandColors.purple[200],
            },
            '&.Mui-focused fieldset': {
              borderColor: brandColors.white,
              borderWidth: '2px',
            },
            '& .MuiInputBase-input': {
              color: brandColors.white,
              '&::placeholder': {
                color: brandColors.purple[200],
                opacity: 1,
              },
            },
          },
          '& .MuiInputLabel-root': {
            color: brandColors.purple[200],
            '&.Mui-focused': {
              color: brandColors.white,
            },
            '&.MuiInputLabel-shrunk': {
              color: brandColors.white,
            },
          },
          '& .MuiInputAdornment-root': {
            color: brandColors.purple[200],
          },
        },
      },
    },
    // Icon Button styling
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