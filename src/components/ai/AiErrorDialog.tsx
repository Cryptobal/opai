"use client";

import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";
import { AI_ERROR_USER_MESSAGES, type AIErrorCode } from "@/lib/ai-errors";

export type AiErrorPayload = {
  code: string;
  message?: string;
  providerType?: string | null;
};

export function AiErrorDialog({
  error,
  onClose,
}: {
  error: AiErrorPayload | null;
  onClose: () => void;
}) {
  if (!error) return null;

  const meta =
    AI_ERROR_USER_MESSAGES[error.code as AIErrorCode] ??
    AI_ERROR_USER_MESSAGES.AI_PROVIDER_ERROR;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="ai-error-dialog-title" className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-900">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-3 top-3 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-amber-500/15 p-2 text-amber-500">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 id="ai-error-dialog-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {meta.title}
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {meta.description}
            </p>
            {error.providerType && (
              <p className="mt-2 text-[11px] text-gray-400">
                Proveedor: {error.providerType}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          {meta.actionHref && meta.actionLabel && (
            <Link
              href={meta.actionHref}
              onClick={onClose}
              className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-teal-700"
            >
              {meta.actionLabel}
            </Link>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
