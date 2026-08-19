import { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';
import { Icon } from '../components/Icon';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContextType {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  const value = useMemo(() => ({ addToast }), [addToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className="flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-slide-in"
            style={{
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              border: `1px solid ${toast.type === 'error' ? 'var(--danger)' : toast.type === 'success' ? 'var(--modrinth)' : 'var(--border)'}`,
              borderLeftWidth: '4px',
            }}
          >
            {toast.type === 'success' && (
              <Icon name="check" size={16} style={{ color: 'var(--modrinth)' }} />
            )}
            {toast.type === 'error' && (
              <Icon name="x" size={16} style={{ color: 'var(--danger)' }} />
            )}
            {toast.type === 'info' && (
              <Icon name="info" size={16} style={{ color: 'var(--accent)' }} />
            )}
            {toast.message}
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
