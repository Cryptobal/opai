"use client";

import type {
  CSSProperties,
  KeyboardEventHandler,
  MouseEvent,
  PointerEventHandler,
  ReactNode,
} from "react";
import { ChevronLeft } from "lucide-react";
import { Surface } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import { useCloseOnBack } from "./useCloseOnBack";

type Props = {
  open: boolean;
  onClose: () => void;
  headerFrom: string;
  headerSubject: string;
  mobileActions?: ReactNode;
  desktopWidth: number;
  onResizePointerDown: PointerEventHandler<HTMLElement>;
  onResizeKeyDown: KeyboardEventHandler<HTMLElement>;
  onResizeReset: () => void;
  desktopMode?: "split" | "overlay";
  manageBackHistory?: boolean;
  children: ReactNode;
};

/** Fullscreen bajo lg; panel master-detail redimensionable en desktop. */
export function CorreoReaderShell({
  open,
  onClose,
  headerFrom,
  headerSubject,
  mobileActions,
  desktopWidth,
  onResizePointerDown,
  onResizeKeyDown,
  onResizeReset,
  desktopMode = "overlay",
  manageBackHistory = true,
  children,
}: Props) {
  useCloseOnBack(open && manageBackHistory, onClose);
  if (!open) return null;

  const style = {
    "--correo-panel-width": `${desktopWidth}px`,
  } as CSSProperties;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex justify-end bg-black/40",
        desktopMode === "split" &&
          "lg:sticky lg:inset-auto lg:top-16 lg:z-20 lg:h-[calc(100dvh-5rem)] lg:w-[var(--correo-panel-width)] lg:shrink-0 lg:bg-transparent",
      )}
      style={style}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {desktopMode === "split" && (
        <div
          role="separator"
          aria-label="Cambiar ancho del lector"
          aria-orientation="vertical"
          aria-valuenow={desktopWidth}
          tabIndex={0}
          onPointerDown={onResizePointerDown}
          onKeyDown={onResizeKeyDown}
          onDoubleClick={onResizeReset}
          className="group absolute -left-3 top-0 z-20 hidden h-full w-6 cursor-col-resize touch-none items-center justify-center outline-none lg:flex"
          title="Arrastrá para cambiar el ancho · doble clic para restaurar"
        >
          <span className="h-16 w-1 rounded-full bg-ds-surface-3 transition-colors group-hover:bg-primary group-focus-visible:bg-primary" />
        </div>
      )}
      <Surface
        elevation={2}
        padding="none"
        className={cn(
          "flex h-full w-full flex-col overflow-hidden lg:border lg:border-ds-border-default",
          desktopMode === "overlay" &&
            "lg:w-[var(--correo-panel-width)] lg:shrink-0",
        )}
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
          <footer className="sticky bottom-0 z-10 border-t border-ds-border-subtle bg-ds-surface-1 p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] lg:hidden">
            <div className="h-11">{mobileActions}</div>
          </footer>
        )}
      </Surface>
    </div>
  );
}
