import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { ProtectedRouteProps } from '../types';

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  redirectTo = '/login',
  fallback = <div>Loading...</div>,
  requiredRoles = [],
  onUnauthorized,
}) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!isAuthenticated) {
      onUnauthorized?.();

      // Redirect if running in browser
      if (typeof window !== 'undefined' && redirectTo) {
        window.location.href = redirectTo;
      }

      setShouldRender(false);
      return;
    }

    // Check role requirements
    if (requiredRoles.length > 0 && user) {
      const userRoles = user.roles || [];
      const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));

      if (!hasRequiredRole) {
        onUnauthorized?.();
        setShouldRender(false);
        return;
      }
    }

    setShouldRender(true);
  }, [isAuthenticated, isLoading, user, requiredRoles, redirectTo, onUnauthorized]);

  if (isLoading) {
    return <>{fallback}</>;
  }

  if (!isAuthenticated) {
    return null; // Will redirect via useEffect
  }

  if (requiredRoles.length > 0 && user) {
    const userRoles = user.roles || [];
    const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));

    if (!hasRequiredRole) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>Access Denied</h2>
          <p>You don't have the required permissions to view this page.</p>
          <p>Required roles: {requiredRoles.join(', ')}</p>
          <p>Your roles: {userRoles.join(', ') || 'None'}</p>
        </div>
      );
    }
  }

  if (!shouldRender) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};