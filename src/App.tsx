import React, { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ToastProvider, useToast } from './components/pixel/PixelToast';
import { ErrorBoundary } from './components/layout/SystemStateBanners';
import { setupGlobalErrorHandlers } from './core/errors';
import { AppRouter } from './router';

const GlobalErrorBridge: React.FC = () => {
  const { showToast } = useToast();

  useEffect(() => {
    return setupGlobalErrorHandlers((t) => {
      showToast({
        type: 'error',
        title: t.title,
        message: t.message,
      });
    });
  }, [showToast]);

  return null;
};

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <GlobalErrorBridge />
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
};

export default App;
