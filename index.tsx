import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';
import './src/index.css';
import App from './src/App';
import { ThemeProvider } from './src/hooks/useTheme';
import { ToastProvider } from './src/hooks/useToast';
import { DevRoute } from './src/pages/DevPlayground';

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <ThemeProvider>
        <ToastProvider>
          <HashRouter>
            <Routes>
              <Route path="/dev" element={<DevRoute />} />
              <Route path="/*" element={<App />} />
            </Routes>
          </HashRouter>
        </ToastProvider>
      </ThemeProvider>
    </React.StrictMode>
  );
}
