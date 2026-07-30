"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { Spinner } from "@/components/opai-ds";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { loadPdf, renderPage } from "./pdf-canvas-render";

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
/** Alto reservado del placeholder antes de renderizar (proporción A4 vertical). */
const A4_RATIO = 1.414;

type Load =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; pdf: PDFDocumentProxy };

/** Una página: monta el canvas solo al acercarse al viewport (lazy) y lo
 *  re-renderiza al cambiar el ancho, cancelando el task en vuelo. */
function PdfPage({
  pdf,
  pageNumber,
  width,
  onEnter,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  onEnter: (n: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const taskRef = useRef<RenderTask | null>(null);
  const pageRef = useRef<PDFPageProxy | null>(null);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            onEnter(pageNumber);
          }
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [pageNumber, onEnter]);

  useEffect(() => {
    if (!visible || width <= 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const page = pageRef.current ?? (await pdf.getPage(pageNumber));
        pageRef.current = page;
        if (cancelled || !canvasRef.current) return;
        taskRef.current?.cancel();
        const task = renderPage(page, canvasRef.current, width);
        taskRef.current = task;
        await task.promise;
        if (!cancelled) setRendered(true);
      } catch {
        /* cancel / render race: se reintenta en el próximo cambio de width */
      }
    })();
    return () => {
      cancelled = true;
      taskRef.current?.cancel();
    };
  }, [visible, width, pdf, pageNumber]);

  return (
    <div
      ref={wrapRef}
      // Fondo blanco: una página de PDF es papel, no cromo de la app.
      className="mx-auto w-full overflow-hidden rounded-sm bg-white shadow-sm"
      style={rendered ? undefined : { aspectRatio: `1 / ${A4_RATIO}` }}
    >
      {visible && <canvas ref={canvasRef} className="block max-w-full" />}
    </div>
  );
}

/**
 * Visor de PDF: scroll vertical continuo, zoom por CSS `zoom` (afecta layout →
 * alejar achica de verdad) + pinch controlado + botones ±. El canvas se
 * renderiza al ancho base; el zoom NO re-renderiza página a página (fluido).
 */
export function PdfCanvas({ data }: { data: ArrayBuffer }) {
  const [load, setLoad] = useState<Load>({ phase: "loading" });
  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(1);
  const [baseWidth, setBaseWidth] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);

  useEffect(() => {
    let alive = true;
    let created: PDFDocumentProxy | null = null;
    setLoad({ phase: "loading" });
    // getDocument consume el buffer (lo transfiere al worker): clonar para
    // permitir reintentos y no invalidar el buffer del padre.
    loadPdf(data.slice(0))
      .then((pdf) => {
        if (!alive) {
          void pdf.destroy();
          return;
        }
        created = pdf;
        setLoad({ phase: "ready", pdf });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        const name = (err as { name?: string })?.name;
        setLoad({
          phase: "error",
          message:
            name === "PasswordException"
              ? "Este PDF está protegido con contraseña."
              : "No se pudo abrir el PDF (archivo dañado o incompleto).",
        });
      });
    return () => {
      alive = false;
      void created?.destroy();
    };
  }, [data]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setBaseWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [load.phase]);

  const setZoomClamped = useCallback((z: number) => {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(z.toFixed(2))));
    zoomRef.current = next;
    setZoom(next);
  }, []);

  // Pinch controlado: evita el zoom del WebView (que agranda pero no achica).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || load.phase !== "ready") return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const a = e.touches[0];
      const b = e.touches[1];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
      pinchRef.current = { startDist: d, startZoom: zoomRef.current };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinchRef.current) return;
      if (e.cancelable) e.preventDefault();
      const a = e.touches[0];
      const b = e.touches[1];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
      setZoomClamped(pinchRef.current.startZoom * (d / pinchRef.current.startDist));
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current = null;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [load.phase, setZoomClamped]);

  const onEnter = useCallback((n: number) => setCurrent(n), []);

  if (load.phase === "loading") return <Spinner className="mx-auto mt-12" />;
  if (load.phase === "error") {
    return (
      <p className="mx-auto mt-12 max-w-xs px-4 text-center text-ds-body text-ds-text-2">
        {load.message} Usá el botón de descarga para abrirlo en otra app.
      </p>
    );
  }

  // Ancho base fijo: el zoom es CSS y no dispara re-render de canvas.
  const pageWidth = Math.max(120, Math.round(baseWidth - 24));
  const total = load.pdf.numPages;

  return (
    <div className="relative flex h-full flex-col">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto px-3 py-3 [-webkit-overflow-scrolling:touch]"
      >
        {/* `zoom` CSS afecta layout → alejar achica el scrollable de verdad.
            Fallback transform si el motor no soporta zoom (Firefox viejo). */}
        <div
          className="mx-auto flex flex-col items-center gap-3"
          style={
            {
              width: pageWidth,
              // CSS zoom afecta layout → alejar achica el scrollable de verdad.
              zoom,
            } as CSSProperties
          }
        >
          {Array.from({ length: total }, (_, i) => (
            <PdfPage
              key={i + 1}
              pdf={load.pdf}
              pageNumber={i + 1}
              width={pageWidth}
              onEnter={onEnter}
            />
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-ds-border-default bg-ds-surface-2/95 px-1.5 py-1 shadow-lg backdrop-blur">
          <button
            type="button"
            aria-label="Alejar"
            onClick={() => setZoomClamped(zoom - ZOOM_STEP)}
            disabled={zoom <= ZOOM_MIN}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ds-text-2 ds-tap disabled:opacity-40"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-[3rem] text-center text-[12px] tabular-nums text-ds-text-2">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            aria-label="Acercar"
            onClick={() => setZoomClamped(zoom + ZOOM_STEP)}
            disabled={zoom >= ZOOM_MAX}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ds-text-2 ds-tap disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
          </button>
          {zoom !== 1 && (
            <>
              <span className="mx-1 h-5 w-px shrink-0 bg-ds-border-subtle" />
              <button
                type="button"
                aria-label="Restablecer zoom"
                onClick={() => setZoomClamped(1)}
                className="flex h-11 w-11 items-center justify-center rounded-full text-ds-text-2 ds-tap"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </>
          )}
          <span className="mx-1 h-5 w-px shrink-0 bg-ds-border-subtle" />
          <span className="min-w-[3.5rem] px-1 text-center text-[12px] tabular-nums text-ds-text-3">
            {current} / {total}
          </span>
        </div>
      </div>
    </div>
  );
}
