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
  }, [anchor]);

  useEffect(() => {
    if (!anchor) return;
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
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
  }, [anchor, onClose]);

  if (!anchor) return null;

  return (
    <Surface
      ref={ref}
      elevation={4}
      padding="none"
      role="menu"
      aria-label="Acciones del correo"
      className="fixed z-[70] hidden w-[236px] overflow-hidden py-1.5 lg:block"
      style={{ left: pos?.x ?? anchor.x, top: pos?.y ?? anchor.y, visibility: pos ? "visible" : "hidden" }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => (
        <div key={item.label}>
          {item.divider && i > 0 && (
            <div className="my-1 h-px bg-ds-border-subtle" aria-hidden />
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => { item.onClick(); onClose(); }}
            className={`flex min-h-9 w-full items-center gap-3 px-3 text-left text-[13px] ds-tap hover:bg-ds-surface-2 ${
              item.danger ? "text-status-danger-fg" : "text-ds-text-1"
            }`}
          >
            <span className={`shrink-0 ${item.danger ? "" : "text-ds-text-3"}`}>{item.icon}</span>
            {item.label}
          </button>
        </div>
      ))}
    </Surface>
  );
}
