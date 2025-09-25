// Main exports for CIAM UI SDK
export * from './types';

// Components
export { CiamProvider } from './components/CiamProvider';
export { CiamLoginComponent } from './components/CiamLoginComponent';
export { MfaComponent } from './components/MfaComponent';
export { ProtectedRoute } from './components/ProtectedRoute';
export { SessionManager } from './components/SessionManager';

// Hooks
export { useAuth } from './hooks/useAuth';
export { useMfa } from './hooks/useMfa';
export { useSession } from './hooks/useSession';

// Services
export { AuthService } from './services/AuthService';

// Version
export const VERSION = '1.0.0';

// Default export
export default {
  VERSION,
};