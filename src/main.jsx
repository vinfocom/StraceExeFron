import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const enableStrictMode = String(import.meta.env.VITE_ENABLE_STRICT_MODE || '').toLowerCase() === 'true';
const isElectronRuntime =
  typeof navigator !== 'undefined' &&
  /electron/i.test(navigator.userAgent || '');
const enablePythonProcessLogs =
  import.meta.env.DEV ||
  isElectronRuntime ||
  String(import.meta.env.VITE_ENABLE_PYTHON_PROCESS_LOGS || '').toLowerCase() === 'true';

const electronWindow = window.electronWindow;
if (enablePythonProcessLogs && electronWindow && typeof electronWindow.onPythonLog === 'function') {
  electronWindow.onPythonLog((payload) => {
    const message = String(payload?.message ?? '');
    if (!message) {
      return;
    }

    const stream = payload?.stream === 'stderr' ? 'stderr' : 'stdout';
    const prefix = `[PYTHON ${stream.toUpperCase()}]`;

    if (payload?.level === 'warn') {
      console.warn(prefix, message);
      return;
    }

    if (payload?.level === 'error') {
      console.error(prefix, message);
      return;
    }

    console.log(prefix, message);
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  enableStrictMode ? (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  ) : (
    <App />
  ),
);
