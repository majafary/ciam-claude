import React from 'react';
import ReactDOM from 'react-dom/client';
import { CiamProvider } from 'ciam-ui';
import App from './App';
import './index.css';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

const backendUrl = import.meta.env.VITE_CIAM_BACKEND_URL || 'http://localhost:8080';
const debug = import.meta.env.VITE_DEBUG_CIAM === 'true';

root.render(
  <React.StrictMode>
    <CiamProvider
      backendUrl={backendUrl}
      debug={debug}
      onLoginSuccess={(user) => {
        console.log('Storefront: User logged in successfully', user);
      }}
      onLoginError={(error) => {
        console.error('Storefront: Login failed', error);
      }}
      onLogout={() => {
        console.log('Storefront: User logged out');
      }}
      onSessionExpired={() => {
        console.log('Storefront: Session expired');
      }}
      autoRefreshTokens={true}
      refreshInterval={5 * 60 * 1000} // 5 minutes
    >
      <App />
    </CiamProvider>
  </React.StrictMode>
);