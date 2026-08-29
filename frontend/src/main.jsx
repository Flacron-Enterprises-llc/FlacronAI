import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { Toaster } from 'react-hot-toast';
import CookieConsent from './components/CookieConsent.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <App />
          <CookieConsent />
          <Toaster
            position="top-right"
            containerStyle={{ top: 84, zIndex: 9999 }}
            toastOptions={{
              duration: 4000,
              style: {
                background: 'rgb(var(--color-surface))',
                color: 'rgb(var(--color-ink))',
                border: '1px solid rgb(var(--color-border))',
                borderRadius: '10px',
                fontSize: '14px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
              },
              success: {
                iconTheme: { primary: '#22c55e', secondary: 'rgb(var(--color-surface))' },
                style: { border: '1px solid #22c55e55' },
              },
              error: {
                iconTheme: { primary: '#ef4444', secondary: 'rgb(var(--color-surface))' },
                style: { border: '1px solid #ef444455' },
              },
            }}
          />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
