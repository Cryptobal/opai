"use client";

import type { ReactNode, MouseEvent } from "react";
import { ChevronLeft } from "lucide-react";
import { Surface } from "@/components/opai-ds";
import { useCloseOnBack } from "./useCloseOnBack";

type Props = {
  open: boolean;
  onClose: () => void;
  headerFrom: string;
  headerSubject: string;
  mobileActions?: ReactNode;
  children: ReactNode;
};

/** Layout responsive del lector: fullscreen mobile, drawer desktop. */
export function CorreoReaderShell({
  open,
  onClose,
  headerFrom,
  headerSubject,
  mobileActions,
  children,
}: Props) {
  useCloseOnBack(open, onClose);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <Surface
        elevation={2}
        padding="none"
        className="flex h-full w-full flex-col md:max-w-lg"
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 border-b border-ds-border-subtle bg-ds-surface-1 px-2 py-2.5 pt-[calc(env(safe-area-inset-top)+0.625rem)] md:px-4">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onClose}
              aria-label="Volver"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ds-text-2 ds-tap"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] text-ds-text-3">{headerFrom || "—"}</p>
              <p className="truncate font-display text-[15px] font-semibold text-ds-text-1 md:text-base">
                {headerSubject || "Correo"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="hidden shrink-0 px-1 text-[13px] text-ds-text-3 ds-tap md:block"
            >
              Cerrar
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3 md:px-4 md:py-4">
          {children}
        </div>

        {mobileActions && (
          <footer className="sticky bottom-0 z-10 border-t border-ds-border-subtle bg-ds-surface-1 p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] md:hidden">
            <div className="h-11">{mobileActions}</div>
          </footer>
        )}
      </Surface>
    </div>
  );
}
