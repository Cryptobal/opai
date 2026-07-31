"use client";

import {
  useEffect,
  useMemo,
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
import { CorreoReaderScrollContext } from "./CorreoReaderScrollContext";

type Props = {
  open: boolean;
  onClose: () => void;
  headerFrom: string;
  headerSubject: string;
  /** Header adaptativo móvil (`<lg`); el header opaco queda solo para `lg+`. */
  mobileHeader?: ReactNode;
  /** Isla / barra de acciones flotante móvil (reemplaza el footer opaco). */
  mobileActions?: ReactNode;
  desktopWidth: number;
  onResizePointerDown: PointerEventHandler<HTMLElement>;
  onResizeKeyDown: KeyboardEventHandler<HTMLElement>;
  onResizeReset: () => void;
  desktopMode?: "split" | "contained" | "overlay";
  /** Default: true salvo contained. Activa el asa en split y overlay. */
  resizable?: boolean;
  manageBackHistory?: boolean;
  /** Pausa el Tab-trap (p. ej. composer portado a document.body). Escape sigue. */
  trapPaused?: boolean;
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
  mobileHeader,
  mobileActions,
  desktopWidth,
  onResizePointerDown,
  onResizeKeyDown,
  onResizeReset,
  desktopMode = "overlay",
  resizable,
  manageBackHistory = true,
  trapPaused = false,
  children,
}: Props) {
  useCloseOnBack(open && manageBackHistory, onClose);

  // C19: en móvil (y overlay/contained desktop) el lector es un modal real —
  // focus-trap + Escape; en split desktop solo Escape. Con composer abierto
  // (portal a body) se pausa el trap para no ciclar Tab dentro del lector.
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
  useFocusTrap(panelRef, {
    active: open,
    trap: isOverlay && !trapPaused,
    onEscape: onClose,
  });
  // Host para sheets absolutos (guardar adjuntos) acotados al visor.
  const [overlayHost, setOverlayHost] = useState<HTMLDivElement | null>(null);
  // Dock inferior (fuera del scroll): Responder / Reenviar siempre visibles.
  const [dockHost, setDockHost] = useState<HTMLDivElement | null>(null);

  // Estado de scroll para el header adaptativo móvil: glass + asunto tras 24px.
  // Listener nativo passive; solo re-render al cruzar el umbral (sin spam).
  const scrollElRef = useRef<HTMLDivElement | null>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = scrollElRef.current;
    if (!el) return;
    const onScroll = () => {
      const next = el.scrollTop > 24;
      setScrolled((prev) => (prev === next ? prev : next));
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [open]);
  const scrollValue = useMemo(() => ({ scrolled }), [scrolled]);

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
        <CorreoReaderScrollContext.Provider value={scrollValue}>
        <CorreoReaderOverlayContext.Provider value={overlayHost}>
          <CorreoReaderDockContext.Provider value={{ host: dockHost, enabled: true }}>
            {/* Un solo scroller X+Y: al desplazarse en horizontal se mueve TODO
                el panel (header + acciones + remitente + cuerpo), no el iframe
                blanco aislado. Los headers quedan sticky en el eje Y. */}
            <div
              ref={scrollElRef}
              data-correo-reader-scroller=""
              className={cn(
                // pb móvil 106px: espacio para la isla flotante (60 + safe-area).
                "min-h-0 flex-1 overflow-auto bg-background [-webkit-overflow-scrolling:touch] [overscroll-behavior:contain] lg:bg-ds-surface-2",
                // Máscara de scroll (móvil): fade inferior sobre la isla; el fade
                // superior solo aparece al scrollear.
                isMobile && scrolled && "mobile-scroll-fade",
              )}
              style={
                isMobile && scrolled
                  ? ({ "--fade-top": "40px", "--fade-bot": "112px" } as CSSProperties)
                  : undefined
              }
            >
              {/* Header opaco: solo desktop (lg+). En móvil lo reemplaza el
                  header adaptativo con glass. */}
              <header className="sticky top-0 z-10 hidden border-b border-ds-border-subtle bg-background px-2 py-2.5 pt-[calc(env(safe-area-inset-top)+0.625rem)] md:px-4 lg:block lg:bg-ds-surface-2">
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

              {/* Header adaptativo móvil (sticky en Y; en X viaja con el panel). */}
              {isMobile && (
                <div className="sticky top-0 z-10">
                  {mobileHeader}
                </div>
              )}

              <div className="space-y-4 px-3 pt-3 pb-[106px] md:px-4 md:pt-4 lg:pb-4">
                {children}
              </div>
            </div>

            {/* Dock Gmail: Responder / Reenviar fijos fuera del scroll. Solo
                lg+: en móvil la isla flotante resuelve la respuesta, así que el
                host no se monta y CorreoReplyBox no porta la barra (queda null
                con el composer cerrado). empty:hidden — solo ocupa espacio
                cuando el composer está cerrado y hay barra portada. */}
            {!isMobile && (
              <div
                ref={setDockHost}
                className="shrink-0 border-t border-ds-border-subtle bg-ds-surface-2 px-4 py-2 empty:hidden"
              />
            )}

            {/* Isla de acciones móvil: se posiciona sola (fixed, flotante).
                Solo se monta en móvil — en desktop reclamaría el host del undo
                estando oculta (lg:hidden) y el snackbar global no se vería. */}
            {isMobile && mobileActions}

            {/* Capa para sheets (guardar adjuntos): mismo ancho del visor. */}
            <div
              ref={setOverlayHost}
              className="pointer-events-none absolute inset-0 z-40"
            />
          </CorreoReaderDockContext.Provider>
        </CorreoReaderOverlayContext.Provider>
        </CorreoReaderScrollContext.Provider>
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
