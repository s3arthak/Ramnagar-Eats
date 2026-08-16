import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: "success" | "info" | "danger";
}

interface ToastState {
  push: (title: string, options?: { body?: string; tone?: Toast["tone"] }) => void;
}

const ToastContext = createContext<ToastState | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((title: string, options?: { body?: string; tone?: Toast["tone"] }) => {
    const id = nextId++;
    setToasts((current) => [...current, { id, title, body: options?.body, tone: options?.tone ?? "info" }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="toast-stack" aria-live="polite" role="status">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.tone}`}>
            <strong>{toast.title}</strong>
            {toast.body && <p>{toast.body}</p>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastState {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}
