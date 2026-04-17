import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ToastContext,
  describeError,
  type ToastApi,
  type ToastVariant,
} from "./useToast";

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

const SUCCESS_TIMEOUT_MS = 4000;
const INFO_TIMEOUT_MS = 4000;
const ERROR_TIMEOUT_MS = 7000;
const MAX_VISIBLE_TOASTS = 4;

let idCounter = 0;
function nextId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  idCounter += 1;
  return `toast-${idCounter}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const t = timersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string, timeoutMs: number) => {
      const id = nextId();
      setToasts((current) => {
        const next = [...current, { id, message, variant }];
        // Cap visible toasts: drop the oldest if we exceed the cap.
        if (next.length > MAX_VISIBLE_TOASTS) {
          const dropped = next.slice(0, next.length - MAX_VISIBLE_TOASTS);
          for (const t of dropped) {
            const timer = timersRef.current.get(t.id);
            if (timer) {
              clearTimeout(timer);
              timersRef.current.delete(t.id);
            }
          }
          return next.slice(-MAX_VISIBLE_TOASTS);
        }
        return next;
      });
      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        setToasts((current) => current.filter((t) => t.id !== id));
      }, timeoutMs);
      timersRef.current.set(id, timer);
    },
    []
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push("success", message, SUCCESS_TIMEOUT_MS),
      info: (message) => push("info", message, INFO_TIMEOUT_MS),
      error: (message, err) => {
        const text = err === undefined ? message : `${message}: ${describeError(err)}`;
        push("error", text, ERROR_TIMEOUT_MS);
      },
      dismiss,
    }),
    [push, dismiss]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastRegion({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  // Two regions so screen readers announce errors assertively without
  // interrupting success/info messages.
  const polite = toasts.filter((t) => t.variant !== "error");
  const assertive = toasts.filter((t) => t.variant === "error");

  return (
    <>
      <ToastList
        toasts={polite}
        onDismiss={onDismiss}
        ariaLive="polite"
        role="status"
        label="Notifications"
      />
      <ToastList
        toasts={assertive}
        onDismiss={onDismiss}
        ariaLive="assertive"
        role="alert"
        label="Errors"
      />
    </>
  );
}

function ToastList({
  toasts,
  onDismiss,
  ariaLive,
  role,
  label,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
  ariaLive: "polite" | "assertive";
  role: "status" | "alert";
  label: string;
}) {
  return (
    <ul
      className="toast-list"
      aria-live={ariaLive}
      aria-relevant="additions text"
      aria-label={label}
      role={role}
    >
      {toasts.map((t) => (
        <li key={t.id} className={`toast toast-${t.variant}`}>
          <span className="toast-message">{t.message}</span>
          <button
            type="button"
            className="toast-dismiss"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(t.id)}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
