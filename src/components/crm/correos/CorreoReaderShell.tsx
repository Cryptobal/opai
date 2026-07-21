"use client";

import type { ReactNode, MouseEvent } from "react";
import { Surface } from "@/components/opai-ds";

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
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <Surface
        elevation={2}
        padding="none"
        className="flex h-full w-full flex-col md:max-w-lg"
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 border-b border-ds-border-subtle bg-ds-surface-1 px-3 py-2.5 md:px-4">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] text-ds-text-3">{headerFrom || "—"}</p>
              <p className="truncate font-display text-[15px] font-semibold text-ds-text-1 md:text-base">
                {headerSubject || "Correo"}
              </p>
            </div>
            <button type="button" onClick={onClose} className="shrink-0 px-1 text-[13px] text-ds-text-3 ds-tap">
              Cerrar
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3 md:px-4 md:py-4">
          {children}
        </div>

        {mobileActions && (
          <footer className="sticky bottom-0 z-10 border-t border-ds-border-subtle bg-ds-surface-1 p-2 md:hidden">
            <div className="h-11">{mobileActions}</div>
          </footer>
        )}
      </Surface>
    </div>
  );
}
