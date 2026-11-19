import React, { createContext, useCallback, useContext, useState } from 'react';
import { PixelIcon } from './PixelIcon';
import type { IconName } from './icons';

export type ToastType = 'info' | 'success' | 'warn' | 'error';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastContextType {
  showToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type, title, message, duration }: Omit<ToastMessage, 'id'>) => {
      const id = `${Date.now()}-${Math.random()}`;
      const autoDismissMs = duration || (type === 'error' ? 8000 : 5000);

      setToasts((prev) => [...prev, { id, type, title, message, duration: autoDismissMs }]);

      setTimeout(() => {
        removeToast(id);
      }, autoDismissMs);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      {/* Toast Container stacked top-right */}
      <div
        aria-live="polite"
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 'var(--z-toast, 10001)' as any,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          maxWidth: '380px',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((t) => {
          const typeConfig: Record<ToastType, { icon: IconName; border: string; bg: string }> = {
            success: { icon: 'check', border: 'var(--good)', bg: '#EDF9F1' },
            warn: { icon: 'warning', border: 'var(--warn)', bg: '#FFF8E7' },
            error: { icon: 'cross', border: 'var(--bad)', bg: '#FDF0ED' },
            info: { icon: 'info', border: 'var(--blue)', bg: 'var(--white)' },
          };
          const config = typeConfig[t.type];

          return (
            <div
              key={t.id}
              className="px-shadow"
              style={{
                pointerEvents: 'auto',
                backgroundColor: config.bg,
                border: `2px solid var(--ink)`,
                borderLeft: `6px solid ${config.border}`,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                clipPath: 'polygon(3px 0, calc(100% - 3px) 0, 100% 3px, 100% calc(100% - 3px), calc(100% - 3px) 100%, 3px 100%, 0 calc(100% - 3px), 0 3px)',
              }}
            >
              <PixelIcon name={config.icon} size={18} />
              <div style={{ flex: 1 }}>
                {t.title && (
                  <div className="font-pixel" style={{ fontSize: '16px', color: 'var(--ink)' }}>
                    {t.title}
                  </div>
                )}
                <div className="font-content" style={{ fontSize: '13px', color: 'var(--ink)', marginTop: '2px' }}>
                  {t.message}
                </div>
              </div>
              <button
                onClick={() => removeToast(t.id)}
                aria-label="Đóng thông báo"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px',
                  color: 'var(--ink-soft)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <PixelIcon name="cross" size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      showToast: () => {},
      removeToast: () => {},
      toasts: [],
    };
  }
  return context;
}

