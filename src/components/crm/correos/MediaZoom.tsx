"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type WheelEvent,
} from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;
const DOUBLE_TAP_MS = 280;

type Point = { x: number; y: number };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mid(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Zoom pinch/pan/doble-tap + botones ± para imágenes (y contenido fijo).
 * Controlado por la app — no depende del pinch del WebView — así alejar
 * siempre llega hasta ZOOM_MIN.
 */
export function MediaZoom({
  children,
  className,
  showControls = true,
}: {
  children: ReactNode;
  className?: string;
  showControls?: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const panRef = useRef<Point>({ x: 0, y: 0 });
  const pointers = useRef<Map<number, Point>>(new Map());
  const pinch = useRef<{
    startDist: number;
    startZoom: number;
    startPan: Point;
    origin: Point;
  } | null>(null);
  const drag = useRef<{ start: Point; startPan: Point } | null>(null);
  const lastTap = useRef(0);
  const [active, setActive] = useState(false);

  const commit = useCallback((nextZoom: number, nextPan: Point) => {
    const z = clamp(Number(nextZoom.toFixed(3)), ZOOM_MIN, ZOOM_MAX);
    const p = z <= 1.01 ? { x: 0, y: 0 } : nextPan;
    zoomRef.current = z;
    panRef.current = p;
    setZoom(z);
    setPan(p);
  }, []);

  const bumpZoom = useCallback(
    (delta: number) => {
      const prev = zoomRef.current;
      const next = clamp(Number((prev + delta).toFixed(2)), ZOOM_MIN, ZOOM_MAX);
      if (next === prev) return;
      commit(next, panRef.current);
    },
    [commit],
  );

  const reset = useCallback(() => commit(1, { x: 0, y: 0 }), [commit]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onPointerDown = (e: PointerEvent) => {
      el.setPointerCapture?.(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.current.size === 2) {
        const [a, b] = Array.from(pointers.current.values());
        const rect = el.getBoundingClientRect();
        const m = mid(a, b);
        pinch.current = {
          startDist: dist(a, b) || 1,
          startZoom: zoomRef.current,
          startPan: { ...panRef.current },
          origin: { x: m.x - rect.left, y: m.y - rect.top },
        };
        drag.current = null;
        setActive(true);
        return;
      }

      if (pointers.current.size === 1 && zoomRef.current > 1.01) {
        drag.current = {
          start: { x: e.clientX, y: e.clientY },
          startPan: { ...panRef.current },
        };
        setActive(true);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.current.size >= 2 && pinch.current) {
        if (e.cancelable) e.preventDefault();
        const [a, b] = Array.from(pointers.current.values());
        const d = dist(a, b) || 1;
        const nextZoom = clamp(
          pinch.current.startZoom * (d / pinch.current.startDist),
          ZOOM_MIN,
          ZOOM_MAX,
        );
        const rect = el.getBoundingClientRect();
        const m = mid(a, b);
        const local = { x: m.x - rect.left, y: m.y - rect.top };
        const scale = nextZoom / pinch.current.startZoom;
        // Mantener el punto del pellizco fijo en pantalla.
        commit(nextZoom, {
          x: local.x - pinch.current.origin.x * scale + pinch.current.startPan.x * scale,
          y: local.y - pinch.current.origin.y * scale + pinch.current.startPan.y * scale,
        });
        return;
      }

      if (drag.current && pointers.current.size === 1) {
        if (e.cancelable) e.preventDefault();
        commit(zoomRef.current, {
          x: drag.current.startPan.x + (e.clientX - drag.current.start.x),
          y: drag.current.startPan.y + (e.clientY - drag.current.start.y),
        });
      }
    };

    const endPointer = (e: PointerEvent) => {
      const wasSingle = pointers.current.size === 1 && e.pointerId === [...pointers.current.keys()][0];
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2) pinch.current = null;
      if (pointers.current.size === 0) {
        // Doble-tap al soltar el único dedo (sin pan significativo).
        if (wasSingle && !drag.current) {
          const now = Date.now();
          if (now - lastTap.current < DOUBLE_TAP_MS) {
            if (zoomRef.current > 1.05) reset();
            else commit(2, { x: 0, y: 0 });
            lastTap.current = 0;
          } else {
            lastTap.current = now;
          }
        }
        drag.current = null;
        setActive(false);
      }
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove, { passive: false });
    el.addEventListener("pointerup", endPointer);
    el.addEventListener("pointercancel", endPointer);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", endPointer);
      el.removeEventListener("pointercancel", endPointer);
    };
  }, [commit, reset]);

  function onWheel(e: WheelEvent<HTMLDivElement>) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    bumpZoom(e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP);
  }

  return (
    <div className={`relative h-full min-h-0 ${className ?? ""}`}>
      <div
        ref={viewportRef}
        onWheel={onWheel}
        className="flex h-full min-h-0 items-center justify-center overflow-hidden"
        style={{ touchAction: "none" }}
      >
        <div
          ref={contentRef}
          className="will-change-transform"
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
            transformOrigin: "center center",
            transition: active ? "none" : "transform 140ms ease-out",
          }}
        >
          {children}
        </div>
      </div>

      {showControls && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
          <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-ds-border-default bg-ds-surface-2/95 px-1.5 py-1 shadow-lg backdrop-blur">
            <button
              type="button"
              aria-label="Alejar"
              onClick={() => bumpZoom(-ZOOM_STEP)}
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
              onClick={() => bumpZoom(ZOOM_STEP)}
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
                  onClick={reset}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-ds-text-2 ds-tap"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
