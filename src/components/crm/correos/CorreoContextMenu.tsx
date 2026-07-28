"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
  /** Pill junto al header (ej. Radar: Comercial). */
  headerPill?: string;
  /** Etiqueta de subsección (no clickeable). */
  sectionLabel?: string;
};

type Anchor = { x: number; y: number };

const MENU_W = 236;

/**
 * Menú contextual (click derecho) para las filas de correo — desktop. Se
 * posiciona en el cursor y se ajusta para no salirse del viewport; cierra con
 * click afuera, Escape o scroll. En móvil el triage va por swipe/long-press,
 * así que este menú es `hidden lg:block`.
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
  const [pos, setPos] = useState<Anchor | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);

  const actionable = items
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => !item.header && !item.sectionLabel);

  useEffect(() => {
    if (!anchor) {
      setPos(null);
      return;
    }
    const h = ref.current?.offsetHeight ?? 320;
    setPos({
      x: Math.min(anchor.x, window.innerWidth - MENU_W - 8),
      y: Math.min(anchor.y, window.innerHeight - h - 8),
    });
    setFocusIdx(0);
  }, [anchor, items.length]);

  useEffect(() => {
    if (!anchor) return;
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (actionable.length === 0) return;
        setFocusIdx((cur) => {
          const delta = e.key === "ArrowDown" ? 1 : -1;
          return (cur + delta + actionable.length) % actionable.length;
        });
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const target = actionable[focusIdx];
        if (target) {
          target.item.onClick();
          onClose();
        }
      }
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
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
  }, [anchor, onClose, actionable, focusIdx]);

  if (!anchor) return null;

  return (
    <Surface
      ref={ref}
      elevation={4}
      padding="none"
      role="menu"
      aria-label="Acciones del correo"
      className="fixed z-[70] hidden w-[236px] overflow-hidden py-1.5 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150 lg:block"
      style={{ left: pos?.x ?? anchor.x, top: pos?.y ?? anchor.y, visibility: pos ? "visible" : "hidden" }}
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

        return (
          <div key={`${item.label}-${i}`}>
            {item.divider && i > 0 && (
              <div className="my-1 h-px bg-ds-border-subtle" aria-hidden />
            )}
            <button
              type="button"
              role="menuitem"
              tabIndex={focused ? 0 : -1}
              onClick={() => {
                item.onClick();
                onClose();
              }}
              className={`flex min-h-10 w-full items-center gap-3 px-3 text-left text-[13px] ds-tap focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary sm:min-h-9 ${
                focused ? "bg-ds-surface-2" : "hover:bg-ds-surface-2"
              } ${item.danger ? "text-status-danger-fg" : "text-ds-text-1"}`}
            >
              <span className={`shrink-0 ${item.danger ? "" : "text-ds-text-3"}`}>{item.icon}</span>
              {item.label}
            </button>
          </div>
        );
      })}
    </Surface>
  );
}
