import { createContext, useContext } from "react";
import { ApiError } from "@/api/client";

export type ToastVariant = "success" | "error" | "info";

export interface ToastApi {
  /** Show a success toast (auto-dismisses after a short timeout). */
  success: (message: string) => void;
  /** Show an info toast (auto-dismisses after a short timeout). */
  info: (message: string) => void;
  /**
   * Show an error toast. If `error` is provided, its user-safe message is
   * appended (e.g. the server's `error` field on `ApiError`). Errors stay on
   * screen longer than success/info toasts.
   */
  error: (message: string, error?: unknown) => void;
  dismiss: (id: string) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return ctx;
}

/** Extracts a user-safe message from an unknown error value. */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}
