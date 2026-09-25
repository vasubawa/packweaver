import { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';
import { Icon } from '../components/Icon';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  action?: ToastAction;
}

interface ToastContextType {
  addToast: (message: string, type?: 'success' | 'error' | 'info', action?: ToastAction) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'info', action?: ToastAction) => {
      const id = crypto.randomUUID();
      setToasts(prev =>
        prev.some(toast => toast.message === message && toast.type === type)
          ? prev
          : [...prev, { id, message, type, action }]
      );
      setTimeout(
        () => {
          setToasts(prev => prev.filter(t => t.id !== id));
        },
        action ? 9000 : type === 'error' ? 6000 : 4000
      );
    },
    []
  );

  const value = useMemo(() => ({ addToast }), [addToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map(toast => (
          <div
            key={toast.id}
            role={toast.type === 'error' ? 'alert' : 'status'}
            className="flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-slide-in"
            style={{
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              border: `1px solid ${
                toast.type === 'error'
                  ? 'var(--danger)'
                  : toast.type === 'success'
                    ? 'var(--success)'
                    : 'var(--accent)'
              }`,
              borderLeftWidth: '4px',
            }}
          >
            {toast.type === 'success' && (
              <Icon name="check" size={16} style={{ color: 'var(--success)' }} />
            )}
            {toast.type === 'error' && (
              <Icon name="x" size={16} style={{ color: 'var(--danger)' }} />
            )}
            {toast.type === 'info' && (
              <Icon name="info" size={16} style={{ color: 'var(--accent)' }} />
            )}
            <span className="flex-1">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="btn-accent text-xs px-2.5 py-1 shrink-0 ml-2"
                onClick={() => {
                  toast.action?.onClick();
                  setToasts(prev => prev.filter(t => t.id !== toast.id));
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
