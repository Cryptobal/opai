"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";
import { Surface } from "@/components/opai-ds";

export type CorreoMenuItem = {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  /** Inserta un separador ANTES de este ítem. */
  divider?: boolean;
  /** Cabecera de grupo (no clickeable). */
  header?: string;
  /** Pill junto al header (opcional). */
  headerPill?: string;
  /** Etiqueta de subsección (no clickeable). */
  sectionLabel?: string;
  /** Submenú anidado (desktop). */
  submenu?: CorreoMenuItem[];
};

type Anchor = { x: number; y: number };

const MENU_W = 236;
const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 200;
const VIEWPORT_MARGIN = 8;

/**
 * Menú contextual (click derecho) para las filas de correo — desktop. Se
 * posiciona en el cursor y se ajusta para no salirse del viewport; cierra con
 * click afuera, Escape o scroll. Soporta submenús con hover/teclado y flip
 * horizontal + clamp vertical. En móvil el triage va por swipe/long-press
 * (`hidden lg:block`).
 */
export function CorreoContextMenu({
  anchor,
  items,
  onClose,
}: {
  anchor: Anchor | null;
  items: CorreoMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const subRef = useRef<HTMLDivElement | null>(null);
  const subAnchorRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<Anchor | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const [openSubIdx, setOpenSubIdx] = useState<number | null>(null);
  const [subFocusIdx, setSubFocusIdx] = useState(0);
  const [flipLeft, setFlipLeft] = useState(false);
  /** Posición fixed del submenú (portal a body para no quedar clipado por overflow del padre). */
  const [subFixed, setSubFixed] = useState<{
    top: number;
    left?: number;
    right?: number;
    maxH: number | null;
  } | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const actionable = items
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => !item.header && !item.sectionLabel);

  const clearTimers = useCallback(() => {
    if (openTimer.current != null) window.clearTimeout(openTimer.current);
    if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);

  const scheduleOpen = useCallback(
    (actionIndex: number) => {
      clearTimers();
      const entry = actionable[actionIndex];
      if (!entry?.item.submenu?.length) {
        setOpenSubIdx(null);
        return;
      }
      openTimer.current = window.setTimeout(() => {
        setOpenSubIdx(actionIndex);
        setSubFocusIdx(0);
        if (pos) {
          setFlipLeft(pos.x + MENU_W * 2 > window.innerWidth - VIEWPORT_MARGIN);
        }
      }, OPEN_DELAY_MS);
    },
    [actionable, clearTimers, pos],
  );

  const scheduleClose = useCallback(() => {
    clearTimers();
    closeTimer.current = window.setTimeout(() => {
      setOpenSubIdx(null);
    }, CLOSE_DELAY_MS);
  }, [clearTimers]);

  useLayoutEffect(() => {
    if (!anchor) {
      setPos(null);
      setOpenSubIdx(null);
      setSubFixed(null);
      return;
    }
    const x = Math.min(anchor.x, window.innerWidth - MENU_W - VIEWPORT_MARGIN);
    // Medición real del menú ya montado (layout effect corre tras el DOM).
    const h = ref.current?.offsetHeight ?? 0;
    const maxMenuH = window.innerHeight - VIEWPORT_MARGIN * 2;
    const effectiveH = h > 0 ? Math.min(h, maxMenuH) : maxMenuH;
    setPos({
      x,
      y: Math.min(anchor.y, window.innerHeight - effectiveH - VIEWPORT_MARGIN),
    });
    setFlipLeft(x + MENU_W * 2 > window.innerWidth - VIEWPORT_MARGIN);
    setFocusIdx(0);
    setOpenSubIdx(null);
    setSubFixed(null);
  }, [anchor, items.length]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  // Clamp vertical del submenú: naturalTop desde el ancla (fila), no desde
  // getBoundingClientRect del submenú — evita loop si hubiera transform previo.
  useLayoutEffect(() => {
    if (openSubIdx == null || !subRef.current || !subAnchorRef.current) {
      setSubFixed(null);
      return;
    }
    const el = subRef.current;
    const anchorRect = subAnchorRef.current.getBoundingClientRect();
    const naturalTop = anchorRect.top;
    const naturalH = el.scrollHeight;
    const viewportH = window.innerHeight;

    let top = naturalTop;
    let maxH: number | null = null;
    if (naturalH > viewportH - VIEWPORT_MARGIN * 2) {
      top = VIEWPORT_MARGIN;
      maxH = viewportH - VIEWPORT_MARGIN * 2;
    } else {
      const overflow = naturalTop + naturalH - (viewportH - VIEWPORT_MARGIN);
      if (overflow > 0) top = naturalTop - overflow;
      if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN;
    }

    setSubFixed(
      flipLeft
        ? {
            top,
            right: window.innerWidth - anchorRect.left + 2,
            maxH,
          }
        : {
            top,
            left: anchorRect.right + 2,
            maxH,
          },
    );
  }, [openSubIdx, flipLeft]);

  // Teclado: llevar el ítem enfocado a la vista cuando hay scroll interno.
  useEffect(() => {
    if (openSubIdx == null || !subRef.current) return;
    const focused = subRef.current.querySelector<HTMLElement>('[tabindex="0"]');
    focused?.scrollIntoView({ block: "nearest" });
  }, [subFocusIdx, openSubIdx]);

  useEffect(() => {
    if (!anchor) return;
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (openSubIdx != null) {
          setOpenSubIdx(null);
          return;
        }
        onClose();
        return;
      }
      if (openSubIdx != null) {
        const sub = actionable[openSubIdx]?.item.submenu ?? [];
        const subItems = sub.filter(
          (s) => !s.header && !s.sectionLabel && !(s.divider && !s.label),
        );
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setOpenSubIdx(null);
          return;
        }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          if (subItems.length === 0) return;
          setSubFocusIdx((cur) => {
            const delta = e.key === "ArrowDown" ? 1 : -1;
            return (cur + delta + subItems.length) % subItems.length;
          });
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const target = subItems[subFocusIdx];
          if (target) {
            target.onClick();
            onClose();
          }
          return;
        }
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (actionable.length === 0) return;
        setFocusIdx((cur) => {
          const delta = e.key === "ArrowDown" ? 1 : -1;
          const next = (cur + delta + actionable.length) % actionable.length;
          return next;
        });
        setOpenSubIdx(null);
        return;
      }
      if (e.key === "ArrowRight" || e.key === "Enter") {
        const entry = actionable[focusIdx];
        if (!entry) return;
        if (entry.item.submenu?.length) {
          e.preventDefault();
          clearTimers();
          setOpenSubIdx(focusIdx);
          setSubFocusIdx(0);
          if (pos) setFlipLeft(pos.x + MENU_W * 2 > window.innerWidth - VIEWPORT_MARGIN);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          entry.item.onClick();
          onClose();
        }
      }
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (subRef.current?.contains(t)) return;
      onClose();
    };
    // resize: cerrar todo (más predecible que reposicionar en vivo).
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [
    anchor,
    onClose,
    actionable,
    focusIdx,
    openSubIdx,
    subFocusIdx,
    clearTimers,
    pos,
  ]);

  if (!anchor) return null;

  const openSubItem =
    openSubIdx != null ? actionable[openSubIdx]?.item : null;

  const submenuPortal =
    openSubItem?.submenu &&
    typeof document !== "undefined" &&
    createPortal(
      <Surface
        ref={subRef}
        elevation={4}
        padding="none"
        role="menu"
        aria-label={openSubItem.label}
        className="fixed z-[71] w-[236px] rounded-ds-lg py-1.5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-100"
        style={{
          top: subFixed?.top ?? 0,
          left: subFixed?.left,
          right: subFixed?.right,
          maxHeight: subFixed?.maxH ?? undefined,
          overflowY: subFixed?.maxH ? "auto" : undefined,
          visibility: subFixed ? "visible" : "hidden",
        }}
        onMouseEnter={clearTimers}
        onMouseLeave={scheduleClose}
        onClick={(e) => e.stopPropagation()}
      >
        {openSubItem.submenu.map((sub, si) => {
          if (sub.header) {
            return (
              <div key={`sh-${sub.header}-${si}`} className="px-3 pb-1 pt-1.5">
                <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-ds-text-3">
                  {sub.header}
                </span>
              </div>
            );
          }
          if (sub.sectionLabel) {
            return (
              <div key={`ss-${sub.sectionLabel}-${si}`}>
                <div className="my-1 h-px bg-ds-border-subtle" aria-hidden />
                <div className="px-3 py-1 font-mono text-[12px] uppercase tracking-[0.08em] text-ds-text-4">
                  {sub.sectionLabel}
                </div>
              </div>
            );
          }
          if (sub.divider && !sub.label) {
            return (
              <div key={`sd-${si}`} className="my-1 h-px bg-ds-border-subtle" aria-hidden />
            );
          }
          const subItems = openSubItem.submenu!.filter(
            (s) => !s.header && !s.sectionLabel && !(s.divider && !s.label),
          );
          const subActionIndex = subItems.indexOf(sub);
          const subFocused = subActionIndex === subFocusIdx;
          return (
            <div key={`${sub.label}-${si}`}>
              {sub.divider && si > 0 && (
                <div className="my-1 h-px bg-ds-border-subtle" aria-hidden />
              )}
              <button
                type="button"
                role="menuitem"
                tabIndex={subFocused ? 0 : -1}
                onClick={() => {
                  sub.onClick();
                  onClose();
                }}
                className={`flex min-h-10 w-full items-center gap-3 px-3 text-left text-[13px] ds-tap sm:min-h-9 ${
                  subFocused ? "bg-ds-surface-2" : "hover:bg-ds-surface-2"
                } ${sub.danger ? "text-status-danger-fg" : "text-ds-text-1"}`}
              >
                <span className={`shrink-0 ${sub.danger ? "" : "text-ds-text-3"}`}>
                  {sub.icon}
                </span>
                {sub.label}
              </button>
            </div>
          );
        })}
      </Surface>,
      document.body,
    );

  return (
    <>
      <Surface
        ref={ref}
        elevation={4}
        padding="none"
        role="menu"
        aria-label="Acciones del correo"
        className="fixed z-[70] hidden w-[236px] py-1.5 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150 lg:block"
        style={{
          left: pos?.x ?? anchor.x,
          top: pos?.y ?? anchor.y,
          visibility: pos ? "visible" : "hidden",
          maxHeight: "calc(100dvh - 16px)",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((item, i) => {
          if (item.header) {
            return (
              <div key={`h-${item.header}-${i}`} className="px-3 pb-1 pt-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-ds-text-3">
                    {item.header}
                  </span>
                  {item.headerPill && (
                    <span className="rounded-full bg-tint-violet/10 px-1.5 py-0.5 text-[12px] text-tint-violet-fg">
                      {item.headerPill}
                    </span>
                  )}
                </div>
              </div>
            );
          }
          if (item.sectionLabel) {
            return (
              <div key={`s-${item.sectionLabel}-${i}`}>
                <div className="my-1 h-px bg-ds-border-subtle" aria-hidden />
                <div className="px-3 py-1 font-mono text-[12px] uppercase tracking-[0.08em] text-ds-text-4">
                  {item.sectionLabel}
                </div>
              </div>
            );
          }

          const actionIndex = actionable.findIndex((a) => a.i === i);
          const focused = actionIndex === focusIdx;
          const hasSub = Boolean(item.submenu?.length);
          const subOpen = hasSub && openSubIdx === actionIndex;

          return (
            <div
              key={`${item.label}-${i}`}
              ref={subOpen ? subAnchorRef : undefined}
              className="relative"
              onMouseEnter={() => {
                if (actionIndex < 0) return;
                if (hasSub) scheduleOpen(actionIndex);
                else {
                  clearTimers();
                  setOpenSubIdx(null);
                }
              }}
              onMouseLeave={() => {
                if (hasSub) scheduleClose();
              }}
            >
              {item.divider && i > 0 && (
                <div className="my-1 h-px bg-ds-border-subtle" aria-hidden />
              )}
              <button
                type="button"
                role="menuitem"
                tabIndex={focused ? 0 : -1}
                aria-haspopup={hasSub ? "menu" : undefined}
                aria-expanded={hasSub ? subOpen : undefined}
                onClick={() => {
                  if (hasSub) {
                    clearTimers();
                    setOpenSubIdx(actionIndex);
                    setSubFocusIdx(0);
                    return;
                  }
                  item.onClick();
                  onClose();
                }}
                onKeyDown={(e: ReactKeyboardEvent) => {
                  if (hasSub && (e.key === "ArrowRight" || e.key === "Enter")) {
                    e.preventDefault();
                    clearTimers();
                    setOpenSubIdx(actionIndex);
                    setSubFocusIdx(0);
                  }
                }}
                className={`flex min-h-10 w-full items-center gap-3 px-3 text-left text-[13px] ds-tap focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[hsl(var(--ds-border-strong))] sm:min-h-9 ${
                  focused || subOpen ? "bg-ds-surface-2" : "hover:bg-ds-surface-2"
                } ${item.danger ? "text-status-danger-fg" : "text-ds-text-1"}`}
              >
                <span className={`shrink-0 ${item.danger ? "" : "text-ds-text-3"}`}>{item.icon}</span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.headerPill && (
                  <span className="shrink-0 rounded-full bg-tint-violet/10 px-1.5 py-0.5 text-[12px] text-tint-violet-fg">
                    {item.headerPill}
                  </span>
                )}
                {hasSub && (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ds-text-4" aria-hidden />
                )}
              </button>
            </div>
          );
        })}
      </Surface>
      {submenuPortal}
    </>
  );
}
