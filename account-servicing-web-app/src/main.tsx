import React from 'react';
import ReactDOM from 'react-dom/client';
import { CiamProvider } from 'ciam-ui';
import App from './App';
import './index.css';

const backendUrl = import.meta.env.VITE_CIAM_BACKEND_URL || 'http://localhost:8080';
const debug = import.meta.env.VITE_DEBUG_CIAM === 'true';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CiamProvider
      backendUrl={backendUrl}
      debug={debug}
      onLoginSuccess={(user) => {
        console.log('Account-Servicing: User logged in successfully', user);
      }}
      onLoginError={(error) => {
        console.error('Account-Servicing: Login failed', error);
      }}
      onLogout={() => {
        console.log('Account-Servicing: User logged out');
      }}
      onSessionExpired={() => {
        console.log('Account-Servicing: Session expired');
      }}
      autoRefreshTokens={true}
      refreshInterval={300000} // 5 minutes
    >
      <App />
    </CiamProvider>
  </React.StrictMode>
);