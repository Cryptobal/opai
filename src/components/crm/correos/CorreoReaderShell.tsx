"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEventHandler,
  type MouseEvent,
  type PointerEventHandler,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";
import { Surface } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import { useCloseOnBack } from "./useCloseOnBack";
import { useFocusTrap } from "./useFocusTrap";

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

  // C19: en móvil (y overlay desktop) el lector es un modal real — focus-trap
  // + Escape; en split desktop solo Escape (no atrapa el foco del workspace).
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1023px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const isOverlay = isMobile || desktopMode === "overlay";
  useFocusTrap(panelRef, { active: open, trap: isOverlay, onEscape: onClose });

  if (!open) return null;

  const style = {
    "--correo-panel-width": `${desktopWidth}px`,
  } as CSSProperties;

  const overlay = (
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
        ref={panelRef}
        elevation={2}
        padding="none"
        role={isOverlay ? "dialog" : undefined}
        aria-modal={isOverlay ? "true" : undefined}
        aria-label={headerSubject || "Correo"}
        tabIndex={-1}
        className={cn(
          "flex h-full w-full flex-col overflow-hidden lg:border lg:border-ds-border-default",
          desktopMode === "overlay" &&
            "lg:w-[var(--correo-panel-width)] lg:shrink-0",
          // Entrada suave en móvil: slide desde la derecha (estilo Gmail/iOS).
          isMobile && "animate-in slide-in-from-right duration-200 ease-out",
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

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3 [-webkit-overflow-scrolling:touch] [overscroll-behavior:contain] md:px-4 md:py-4">
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

  // En móvil el lector viaja por portal a <body> (mismo patrón y razón que
  // BottomNavPortal): los hijos animados de ds-page-enter conservan un
  // transform con fill forwards que crea containing block + stacking context,
  // dejando un `fixed` anclado al workspace y por debajo de la BottomNav
  // (z-40 a nivel body). Portaleado, el z-50 cubre isla, FAB y top inmersivo.
  // Desktop (split/overlay) queda inline, como siempre.
  if (isMobile && typeof document !== "undefined") {
    return createPortal(overlay, document.body);
  }
  return overlay;
}
