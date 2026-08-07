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
import { TOUCH_LAYOUT_QUERY } from "@/lib/breakpoints";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";
import { Surface } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import { useCloseOnBack } from "./useCloseOnBack";
import { useFocusTrap } from "./useFocusTrap";
import { CorreoReaderDockContext } from "./CorreoReaderDockContext";
import { CorreoReaderOverlayContext } from "./CorreoReaderOverlayContext";
import { CorreoReaderScrollContext } from "./CorreoReaderScrollContext";
import { useCorreoTouchUi } from "./correo-touch-ui";

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
  const [isNarrowViewport, setIsNarrowViewport] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(TOUCH_LAYOUT_QUERY).matches,
  );
  const touchUi = useCorreoTouchUi();
  const useMobileChrome = isNarrowViewport || touchUi;
  useEffect(() => {
    const media = window.matchMedia(TOUCH_LAYOUT_QUERY);
    const update = () => setIsNarrowViewport(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const isOverlay =
    isNarrowViewport || desktopMode === "overlay" || desktopMode === "contained";
  useFocusTrap(panelRef, {
    active: open,
    trap: isOverlay && !trapPaused,
    onEscape: onClose,
  });
  // Host para sheets absolutos (guardar adjuntos) acotados al visor.
  const [overlayHost, setOverlayHost] = useState<HTMLDivElement | null>(null);
  // Dock inferior (fuera del scroll): Responder / Reenviar siempre visibles.
  const [dockHost, setDockHost] = useState<HTMLDivElement | null>(null);
  // Fila superior del dock: chips de intención de respuesta.
  const [dockTopHost, setDockTopHost] = useState<HTMLDivElement | null>(null);

  // Estado de scroll para el header adaptativo móvil: glass + asunto tras 24px.
  // Listener nativo passive; solo re-render al cruzar el umbral (sin spam).
  const scrollElRef = useRef<HTMLDivElement | null>(null);
  const [scrolled, setScrolled] = useState(false);
  // Holgura extra (px) por encima del piso CSS. La medición NUNCA baja el
  // padding: si la isla aún no montó, el piso CSS ya cubre Sugerir respuestas
  // + Responder (+ safe-area). Bajar a 0 cortaba mails cortos sin adjuntos.
  const [islandExtraPx, setIslandExtraPx] = useState(0);
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

  // Si la isla real supera el piso CSS, suma el remanente (undo más alto, etc.).
  useEffect(() => {
    if (!open || !useMobileChrome) {
      setIslandExtraPx(0);
      return;
    }
    const panel = panelRef.current;
    if (!panel) return;

    // Piso alineado con pb-[calc(env(safe-area-inset-bottom)+11.5rem)].
    const FLOOR_PX = 184; // 11.5rem @ 16px; safe-area va en el CSS
    const GAP_PX = 24;
    let raf = 0;
    const measure = () => {
      const island = panel.querySelector<HTMLElement>("[data-correo-reader-island]");
      if (!island) {
        // Sin nodo: mantener piso CSS (extra=0). No pisar a padding 0.
        setIslandExtraPx((prev) => (prev === 0 ? prev : 0));
        return;
      }
      const panelBottom = panel.getBoundingClientRect().bottom;
      const islandTop = island.getBoundingClientRect().top;
      const needed = Math.max(0, Math.ceil(panelBottom - islandTop + GAP_PX));
      const extra = Math.max(0, needed - FLOOR_PX);
      setIslandExtraPx((prev) => (prev === extra ? prev : extra));
    };
    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        measure();
      });
    };

    measure();
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    ro?.observe(panel);
    const island = panel.querySelector("[data-correo-reader-island]");
    if (island) ro?.observe(island);

    const mo = new MutationObserver(() => {
      const node = panel.querySelector("[data-correo-reader-island]");
      if (node) ro?.observe(node);
      schedule();
    });
    mo.observe(panel, { childList: true, subtree: true });

    window.addEventListener("resize", schedule);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      ro?.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [open, useMobileChrome, mobileActions]);

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
          isNarrowViewport && "animate-in slide-in-from-right duration-200 ease-out",
        )}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <CorreoReaderScrollContext.Provider value={scrollValue}>
        <CorreoReaderOverlayContext.Provider value={overlayHost}>
          <CorreoReaderDockContext.Provider
            value={{ host: dockHost, topHost: dockTopHost, enabled: true }}
          >
            {/* Un solo scroller X+Y: al desplazarse en horizontal se mueve TODO
                el panel (header + acciones + remitente + cuerpo), no el iframe
                blanco aislado. Los headers quedan sticky en el eje Y. */}
            <div
              ref={scrollElRef}
              data-correo-reader-scroller=""
              className={cn(
                "min-h-0 flex-1 overflow-auto bg-background [-webkit-overflow-scrolling:touch] [overscroll-behavior:contain] lg:bg-ds-surface-2",
                // Máscara de scroll (móvil): fade inferior sobre la isla; el fade
                // superior solo aparece al scrollear.
                useMobileChrome && scrolled && "mobile-scroll-fade",
              )}
              style={
                useMobileChrome && scrolled
                  ? ({
                      "--fade-top": "40px",
                      // Piso 11.5rem + safe-area + extra medido.
                      "--fade-bot": `calc(env(safe-area-inset-bottom, 0px) + 11.5rem + ${islandExtraPx}px)`,
                    } as CSSProperties)
                  : undefined
              }
            >
              {/* Header opaco: solo desktop (lg+). En móvil lo reemplaza el
                  header adaptativo con glass. */}
              {!useMobileChrome && (
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
              )}

              {/* Header táctil (iPad / móvil): archivar, eliminar, Copiloto… */}
              {useMobileChrome && (
                <div className="sticky top-0 z-10">
                  {mobileHeader}
                </div>
              )}

              <div
                className={cn(
                  "space-y-2 px-3 pt-1.5 md:space-y-4 md:px-4 md:pt-4 lg:pb-4",
                  // Piso CSS: isla unificada (Sugerir respuestas + acciones) +
                  // safe-area. No depende de JS — evita cortar el cuerpo al
                  // montar o en mails cortos sin adjuntos.
                  useMobileChrome &&
                    "pb-[calc(env(safe-area-inset-bottom,0px)+11.5rem)]",
                )}
                style={
                  useMobileChrome && islandExtraPx > 0
                    ? {
                        paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + 11.5rem + ${islandExtraPx}px)`,
                      }
                    : undefined
                }
                data-correo-island-clearance={useMobileChrome ? "floor" : undefined}
                data-correo-island-extra={useMobileChrome ? islandExtraPx : undefined}
              >
                {children}
              </div>
            </div>

            {/* Dock Gmail: Responder / Reenviar fijos fuera del scroll. Solo
                lg+: en móvil la isla flotante resuelve la respuesta, así que el
                host no se monta y CorreoReplyBox no porta la barra (queda null
                con el composer cerrado). empty:hidden — solo ocupa espacio
                cuando el composer está cerrado y hay barra portada. */}
            {!useMobileChrome && (
              <div className="shrink-0">
                {/* Chips de intención: fila superior del dock, sobre las
                    acciones. Vacía (y sin borde) mientras no haya chips. */}
                <div
                  ref={setDockTopHost}
                  className="border-t border-ds-border-subtle bg-ds-surface-2/95 px-4 py-1.5 backdrop-blur empty:hidden"
                />
                <div
                  ref={setDockHost}
                  className="border-t border-ds-border-subtle bg-ds-surface-2 px-4 py-2 empty:hidden"
                />
              </div>
            )}

            {/* Isla de acciones móvil: se posiciona sola (fixed, flotante).
                Solo se monta en móvil — en desktop reclamaría el host del undo
                estando oculta (lg:hidden) y el snackbar global no se vería. */}
            {useMobileChrome && mobileActions}

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
  const shouldPortal = isNarrowViewport || desktopMode === "overlay";
  if (shouldPortal && typeof document !== "undefined") {
    return createPortal(overlay, document.body);
  }
  return overlay;
}
