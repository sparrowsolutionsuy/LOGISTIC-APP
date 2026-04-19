import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';
import './src/index.css';
import App from './src/App';
import { ToastProvider } from './src/hooks/useToast';
import { DevRoute } from './src/pages/DevPlayground';

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <ToastProvider>
        <HashRouter>
          <Routes>
            <Route path="/dev" element={<DevRoute />} />
            <Route path="/*" element={<App />} />
          </Routes>
        </HashRouter>
      </ToastProvider>
    </React.StrictMode>
  );
}
