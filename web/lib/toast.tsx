"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

const ToastContext = createContext<(message: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback((m: string) => {
    setMessage(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(""), 2500);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {message && (
        <div role="status" className="fixed bottom-5 right-5 z-50 rounded-lg bg-ink px-4 py-3 text-sm text-white">
          {message}
        </div>
      )}
    </ToastContext.Provider>
  );
}
