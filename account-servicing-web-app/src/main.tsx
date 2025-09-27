import React from 'react';
import ReactDOM from 'react-dom/client';
import { CiamProvider } from 'ciam-ui';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CiamProvider
      backendUrl={import.meta.env.VITE_CIAM_BACKEND_URL || 'http://localhost:8080'}
      debug={import.meta.env.VITE_DEBUG_CIAM === 'true'}
      autoRefreshTokens={false}
      refreshInterval={300000}
    >
      <App />
    </CiamProvider>
  </React.StrictMode>
);