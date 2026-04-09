import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const enableStrictMode = String(import.meta.env.VITE_ENABLE_STRICT_MODE || '').toLowerCase() === 'true';

ReactDOM.createRoot(document.getElementById('root')).render(
  enableStrictMode ? (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  ) : (
    <App />
  ),
);
