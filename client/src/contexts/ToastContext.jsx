import { createContext, useCallback, useContext, useState } from "react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, options = {}) => {
    const { duration = 4000, variant = "success" } = options;
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setToasts((prev) => [...prev, { id, message, variant }]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
      }, duration);
    }
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`max-w-sm rounded-lg px-4 py-3 shadow-lg text-sm text-white ${
              toast.variant === "success"
                ? "bg-emerald-600"
                : toast.variant === "error"
                  ? "bg-red-600"
                  : "bg-gray-800"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
