import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { registerGlobalErrorHandlers } from './utils/registerGlobalErrorHandlers';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

registerGlobalErrorHandlers();

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
); 