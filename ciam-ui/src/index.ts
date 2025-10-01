// Main exports for CIAM UI SDK
export * from './types';

// Core Components (headless/agnostic)
export { CiamProvider } from './components/CiamProvider';
export { CiamProtectedApp } from './components/CiamProtectedApp';

// Optional UI Components (Material-UI based - teams can replace with custom)
export { CiamLoginComponent } from './components/CiamLoginComponent';
export { MfaMethodSelectionDialog } from './components/MfaMethodSelectionDialog';
export { ESignDialog } from './components/ESignDialog';
export { DeviceBindDialog } from './components/DeviceBindDialog';

// Legacy Components (consider removing in future versions)
export { ProtectedRoute } from './components/ProtectedRoute';

// Hooks (primary integration method)
export { useAuth } from './hooks/useAuth';
export { useAuthActions } from './hooks/useAuthActions';
export { useMfa } from './hooks/useMfa';

// Services
export { AuthService } from './services/AuthService';

// Version
export const VERSION = '1.0.0';

// Default export
export default {
  VERSION,
};