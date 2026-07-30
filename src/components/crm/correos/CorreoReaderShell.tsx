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
import { CorreoReaderDockContext } from "./CorreoReaderDockContext";
import { CorreoReaderOverlayContext } from "./CorreoReaderOverlayContext";

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
  desktopMode?: "split" | "contained" | "overlay";
  /** Default: true salvo contained. Activa el asa en split y overlay. */
  resizable?: boolean;
  manageBackHistory?: boolean;
  children: ReactNode;
};

/** Fullscreen bajo lg; panel master-detail redimensionable en desktop.
 *  - split: columna sticky al lado de la lista
 *  - contained: cubre el workspace (absolute), dock Intelligence sigue visible
 *  - overlay: modal de viewport (Hub / fichas) */
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
  resizable,
  manageBackHistory = true,
  children,
}: Props) {
  useCloseOnBack(open && manageBackHistory, onClose);

  // C19: en móvil (y overlay/contained desktop) el lector es un modal real —
  // focus-trap + Escape; en split desktop solo Escape.
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
  const isOverlay =
    isMobile || desktopMode === "overlay" || desktopMode === "contained";
  useFocusTrap(panelRef, { active: open, trap: isOverlay, onEscape: onClose });
  // Host para sheets absolutos (guardar adjuntos) acotados al visor.
  const [overlayHost, setOverlayHost] = useState<HTMLDivElement | null>(null);
  // Dock inferior (fuera del scroll): Responder / Reenviar siempre visibles.
  const [dockHost, setDockHost] = useState<HTMLDivElement | null>(null);

  if (!open) return null;

  const canResize = resizable ?? desktopMode !== "contained";
  const style = {
    "--correo-panel-width": `${desktopWidth}px`,
  } as CSSProperties;

  const resizeHandle = canResize ? (
    <div
      role="separator"
      aria-label="Cambiar ancho del lector"
      aria-orientation="vertical"
      aria-valuenow={desktopWidth}
      tabIndex={0}
      onPointerDown={onResizePointerDown}
      onKeyDown={onResizeKeyDown}
      onDoubleClick={onResizeReset}
      className={cn(
        "group absolute top-0 z-20 hidden h-full w-6 cursor-col-resize touch-none items-center justify-center outline-none lg:flex",
        desktopMode === "split" && "-left-3",
        desktopMode === "overlay" && "translate-x-1/2",
      )}
      style={
        desktopMode === "overlay"
          ? { right: "var(--correo-panel-width)" }
          : undefined
      }
      title="Arrastrá para cambiar el ancho · doble clic para restaurar"
    >
      <span className="h-16 w-1 rounded-full bg-ds-surface-3 transition-colors group-hover:bg-primary group-focus-visible:bg-primary" />
    </div>
  ) : null;

  const overlay = (
    <div
      data-correo-scope
      className={cn(
        "fixed inset-0 z-50 flex justify-end bg-black/40",
        desktopMode === "split" &&
          "lg:sticky lg:inset-auto lg:top-[var(--correo-stick)] lg:z-20 lg:h-[calc(100dvh-var(--correo-stick)-1rem)] lg:w-[var(--correo-panel-width)] lg:shrink-0 lg:bg-transparent",
        desktopMode === "contained" &&
          "lg:absolute lg:inset-0 lg:z-40 lg:bg-ds-surface-1",
      )}
      style={style}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {resizeHandle}
      <Surface
        ref={panelRef}
        // elevation 3 = sheet/modal: glass-strong con underlay opaco (~0.72).
        // elevation 2 (glass-m) dejaba leer la bandeja a través del lector.
        elevation={3}
        padding="none"
        role={isOverlay ? "dialog" : undefined}
        aria-modal={isOverlay ? "true" : undefined}
        aria-label={headerSubject || "Correo"}
        tabIndex={-1}
        className={cn(
          // Fondo sólido de respaldo: el underlay del glass-strong + este bg
          // evitan que la lista de correos se lea detrás de chips/acciones.
          // `relative` ancla el host de overlays (guardar adjuntos) al visor.
          // Sin ring de :focus-visible global: el focus-trap enfoca este panel
          // y el anillo primary/naranja se leía como “borde rojo” del lector.
          "relative flex h-full w-full flex-col overflow-hidden bg-background outline-none focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 lg:border lg:border-ds-border-default lg:bg-ds-surface-2",
          desktopMode === "overlay" &&
            "lg:w-[var(--correo-panel-width)] lg:shrink-0",
          // Entrada suave en móvil: slide desde la derecha (estilo Gmail/iOS).
          isMobile && "animate-in slide-in-from-right duration-200 ease-out",
        )}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <CorreoReaderOverlayContext.Provider value={overlayHost}>
          <CorreoReaderDockContext.Provider value={{ host: dockHost, enabled: true }}>
            <header className="sticky top-0 z-10 border-b border-ds-border-subtle bg-background px-2 py-2.5 pt-[calc(env(safe-area-inset-top)+0.625rem)] md:px-4 lg:bg-ds-surface-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Volver"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ds-text-2 outline-none focus-visible:ring-0 focus-visible:ring-offset-0 ds-tap"
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

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-background px-3 py-3 [-webkit-overflow-scrolling:touch] [overscroll-behavior:contain] md:px-4 md:py-4 lg:bg-ds-surface-2">
              {children}
            </div>

            {/* Dock Gmail: Responder / Reenviar fijos fuera del scroll.
                empty:hidden — solo ocupa espacio cuando CorreoReplyBox porta
                la barra aquí (composer cerrado). Safe-area solo si no hay
                barra de acciones móvil debajo. */}
            <div
              ref={setDockHost}
              className={cn(
                "shrink-0 border-t border-ds-border-subtle bg-background px-3 py-2 empty:hidden md:px-4 lg:bg-ds-surface-2",
                !mobileActions &&
                  "pb-[calc(env(safe-area-inset-bottom)+0.5rem)] lg:pb-2",
              )}
            />

            {mobileActions && (
              <footer className="z-10 border-t border-ds-border-subtle bg-background p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] lg:hidden">
                <div className="h-11">{mobileActions}</div>
              </footer>
            )}

            {/* Capa para sheets (guardar adjuntos): mismo ancho del visor. */}
            <div
              ref={setOverlayHost}
              className="pointer-events-none absolute inset-0 z-40"
            />
          </CorreoReaderDockContext.Provider>
        </CorreoReaderOverlayContext.Provider>
      </Surface>
    </div>
  );

  // En móvil (y overlay desktop) el lector viaja por portal a <body>: los
  // hijos animados de ds-page-enter / cards con overflow-hidden / transform
  // crean containing block + stacking context que rompen el `fixed`.
  // Split y contained siguen inline (anclados al workspace de Correos).
  const shouldPortal = isMobile || desktopMode === "overlay";
  if (shouldPortal && typeof document !== "undefined") {
    return createPortal(overlay, document.body);
  }
  return overlay;
}
