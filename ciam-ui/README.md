# CIAM UI SDK

React components and hooks for Customer Identity and Access Management (CIAM) integration.

## 🚀 Features

- **Complete Authentication Flow**: Login, logout, MFA, session management
- **React Components**: Pre-built, customizable UI components
- **React Hooks**: Powerful hooks for authentication state management
- **TypeScript**: Full type safety and IntelliSense support
- **Material-UI**: Modern, accessible UI components
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Production Ready**: Comprehensive error handling and testing

## 📦 Installation

### Local Development (File Import)
```bash
npm install file:../ciam-ui
```

### Production (Nexus Repository)
```bash
npm install ciam-ui@^1.0.0
```

## 🎯 Quick Start

### 1. Setup Provider

Wrap your app with the CIAM provider:

```tsx
import React from 'react';
import { CiamProvider } from 'ciam-ui';

const App: React.FC = () => {
  return (
    <CiamProvider
      backendUrl="http://localhost:8080"
      onLoginSuccess={(user) => console.log('Logged in:', user)}
      onLogout={() => console.log('Logged out')}
    >
      <YourAppContent />
    </CiamProvider>
  );
};
```

### 2. Use Authentication Components

```tsx
import React from 'react';
import { CiamLoginComponent, useAuth } from 'ciam-ui';

const NavBar: React.FC = () => {
  const { isAuthenticated, user } = useAuth();

  return (
    <nav>
      <CiamLoginComponent
        onLoginSuccess={() => console.log('Login successful')}
      />

      {isAuthenticated && (
        <div>Welcome, {user?.given_name}!</div>
      )}
    </nav>
  );
};
```

### 3. Protect Routes

```tsx
import React from 'react';
import { ProtectedRoute, useAuth } from 'ciam-ui';

const SecurePage: React.FC = () => {
  return (
    <ProtectedRoute
      redirectTo="/login"
      fallback={<div>Loading...</div>}
    >
      <h1>This page requires authentication</h1>
    </ProtectedRoute>
  );
};
```

## 🧩 Components

### CiamLoginComponent

The main authentication component that handles login/logout states:

```tsx
import { CiamLoginComponent } from 'ciam-ui';

<CiamLoginComponent
  variant="form" // 'form' | 'button' | 'inline'
  onLoginSuccess={(user) => console.log(user)}
  onLoginError={(error) => console.error(error)}
  onLogout={() => console.log('Logged out')}
  showUserInfo={true}
  customStyles={{ maxWidth: 400 }}
/>
```

**Props:**
- `variant`: Display style ('form', 'button', 'inline')
- `onLoginSuccess`: Callback when login succeeds
- `onLoginError`: Callback when login fails
- `onLogout`: Callback when user logs out
- `showUserInfo`: Show user info when authenticated
- `customStyles`: Custom CSS styles
- `autoRedirect`: Auto-redirect after login
- `redirectUrl`: Where to redirect after login

### MfaComponent

Handles multi-factor authentication flows:

```tsx
import { MfaComponent } from 'ciam-ui';

<MfaComponent
  transactionId="tx-123456"
  method="otp" // 'otp' | 'push'
  onSuccess={(result) => console.log(result)}
  onError={(error) => console.error(error)}
  onCancel={() => console.log('Cancelled')}
/>
```

### ProtectedRoute

Wrapper component for protecting routes:

```tsx
import { ProtectedRoute } from 'ciam-ui';

<ProtectedRoute
  redirectTo="/login"
  fallback={<LoadingSpinner />}
  requiredRoles={['admin', 'user']}
>
  <SecureContent />
</ProtectedRoute>
```

### SessionManager

Displays active sessions and device management:

```tsx
import { SessionManager } from 'ciam-ui';

<SessionManager
  onSessionRevoked={(sessionId) => console.log('Revoked:', sessionId)}
  showDeviceInfo={true}
  allowSignOutAll={true}
/>
```

## 🎣 Hooks

### useAuth

Main authentication hook:

```tsx
import { useAuth } from 'ciam-ui';

const MyComponent: React.FC = () => {
  const {
    // State
    isAuthenticated,
    isLoading,
    user,
    error,

    // Actions
    login,
    logout,
    refreshSession,
    clearError
  } = useAuth();

  const handleLogin = async () => {
    try {
      const result = await login('username', 'password');
      console.log('Login result:', result);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  return (
    <div>
      {isAuthenticated ? (
        <div>
          Welcome, {user?.given_name}!
          <button onClick={logout}>Logout</button>
        </div>
      ) : (
        <button onClick={handleLogin}>Login</button>
      )}
    </div>
  );
};
```

### useMfa

Handle MFA operations:

```tsx
import { useMfa } from 'ciam-ui';

const MfaFlow: React.FC = () => {
  const {
    // State
    transaction,
    isLoading,
    error,

    // Actions
    initiateChallenge,
    verifyOtp,
    checkStatus,
    cancelTransaction
  } = useMfa();

  const handleOtpVerification = async (otp: string) => {
    try {
      const result = await verifyOtp(transaction.transactionId, otp);
      console.log('MFA verified:', result);
    } catch (error) {
      console.error('MFA failed:', error);
    }
  };

  return (
    <div>
      {/* MFA UI */}
    </div>
  );
};
```

### useSession

Session management:

```tsx
import { useSession } from 'ciam-ui';

const SessionInfo: React.FC = () => {
  const {
    // State
    sessions,
    currentSession,
    isLoading,

    // Actions
    loadSessions,
    revokeSession,
    revokeAllOtherSessions
  } = useSession();

  return (
    <div>
      <h3>Active Sessions: {sessions.length}</h3>
      {sessions.map(session => (
        <div key={session.sessionId}>
          {session.deviceId} - {session.location}
          <button onClick={() => revokeSession(session.sessionId)}>
            Sign Out
          </button>
        </div>
      ))}
    </div>
  );
};
```

## ⚙️ Configuration

### CiamProvider Props

```tsx
interface CiamProviderProps {
  backendUrl: string;                    // CIAM backend URL
  children: React.ReactNode;             // App content
  onLoginSuccess?: (user: User) => void; // Login success callback
  onLoginError?: (error: Error) => void; // Login error callback
  onLogout?: () => void;                 // Logout callback
  onSessionExpired?: () => void;         // Session expired callback
  autoRefreshTokens?: boolean;           // Auto-refresh tokens (default: true)
  refreshInterval?: number;              // Token refresh interval (ms)
  storageType?: 'memory' | 'session';    // Token storage type
  theme?: CiamTheme;                     // Custom theme
  locale?: string;                       // Localization (default: 'en')
}
```

### Custom Theming

```tsx
import { CiamProvider, createCiamTheme } from 'ciam-ui';

const customTheme = createCiamTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
  components: {
    CiamLoginForm: {
      styleOverrides: {
        root: {
          maxWidth: 400,
          margin: '0 auto',
        },
      },
    },
  },
});

<CiamProvider theme={customTheme}>
  <App />
</CiamProvider>
```

## 🔧 API Services

The SDK includes service classes for direct API interaction:

```tsx
import { AuthService, MfaService, SessionService } from 'ciam-ui';

// Direct API calls (used internally by hooks)
const authService = new AuthService('http://localhost:8080');

try {
  const loginResult = await authService.login('username', 'password');
  const userInfo = await authService.getUserInfo();
  const sessions = await sessionService.getSessions();
} catch (error) {
  console.error('API call failed:', error);
}
```

## 🧪 Testing

The SDK includes comprehensive test utilities:

```tsx
import { render, screen } from '@testing-library/react';
import { CiamTestProvider, mockAuthResponse } from 'ciam-ui/testing';
import MyComponent from './MyComponent';

test('renders authenticated state', () => {
  render(
    <CiamTestProvider
      initialState={{
        isAuthenticated: true,
        user: mockAuthResponse.user
      }}
    >
      <MyComponent />
    </CiamTestProvider>
  );

  expect(screen.getByText('Welcome, Test User!')).toBeInTheDocument();
});
```

## 🔄 Migration Guide

### From v0.x to v1.0

1. **Provider Setup**: Wrap app with `CiamProvider`
2. **Hook Updates**: Replace `useAuthContext` with `useAuth`
3. **Component Props**: Update component prop names
4. **TypeScript**: Enable strict mode for better type safety

## 📋 Testing Credentials

For local development and testing:

| Username | Password | MFA | Expected Behavior |
|----------|----------|-----|------------------|
| `testuser` | `password` | OTP: `1234` | ✅ Successful login |
| `userlockeduser` | `password` | N/A | ❌ Account locked |
| `mfalockeduser` | `password` | N/A | ❌ MFA locked |

## 🚀 Development

### Local Development
```bash
npm install
npm run dev    # Start development server on port 3002
```

### Building
```bash
npm run build  # Build for production
npm run preview # Preview build
```

### Testing
```bash
npm test              # Run tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

### Publishing to Nexus
```bash
# Update version
npm version patch

# Build and publish
npm run build
npm publish --registry=https://your-nexus-registry
```

## 🤝 Integration Examples

### Next.js Integration
```tsx
// pages/_app.tsx
import { CiamProvider } from 'ciam-ui';

function MyApp({ Component, pageProps }) {
  return (
    <CiamProvider backendUrl={process.env.NEXT_PUBLIC_CIAM_URL}>
      <Component {...pageProps} />
    </CiamProvider>
  );
}
```

### Create React App
```tsx
// src/index.tsx
import { CiamProvider } from 'ciam-ui';

ReactDOM.render(
  <CiamProvider backendUrl={process.env.REACT_APP_CIAM_URL}>
    <App />
  </CiamProvider>,
  document.getElementById('root')
);
```

### Vite Integration
```tsx
// src/main.tsx
import { CiamProvider } from 'ciam-ui';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <CiamProvider backendUrl={import.meta.env.VITE_CIAM_URL}>
    <App />
  </CiamProvider>
);
```

## 🆘 Troubleshooting

### Common Issues

**CORS Errors**:
- Ensure CIAM backend includes your domain in CORS_ORIGINS
- Check that credentials are included in requests

**Token Refresh Issues**:
- Verify refresh tokens are properly stored as HttpOnly cookies
- Check token expiration times and refresh intervals

**MFA Not Working**:
- Ensure MFA endpoints are accessible
- Check transaction IDs match between requests
- Verify OTP is exactly "1234" for test scenarios

**Component Not Rendering**:
- Ensure CiamProvider wraps your app
- Check console for TypeScript errors
- Verify all required props are provided

### Debug Mode
```tsx
<CiamProvider
  backendUrl="http://localhost:8080"
  debug={true} // Enable debug logging
>
  <App />
</CiamProvider>
```

## 📚 API Reference

Complete API documentation available at: [API Docs](./docs/api.md)

## 🔗 Related Projects

- [CIAM Backend](../ciam-backend/) - Authentication API server
- [Storefront App](../storefront-web-app/) - Example storefront integration
- [Account Servicing App](../account-servicing-web-app/) - Example secure app

---

**🔐 Production-ready authentication components for React applications!**