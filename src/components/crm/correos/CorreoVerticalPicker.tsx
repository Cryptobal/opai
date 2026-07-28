"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, RotateCcw, Tag, X } from "lucide-react";
import { Surface } from "@/components/opai-ds";
import {
  VERTICAL_CAPABILITY,
  VERTICAL_META,
  type RadarCapability,
  type RadarVertical,
} from "@/modules/crm/email/radar-types";
import { CorreoVerticalDot } from "./CorreoVerticalDot";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Presentación: menú anclado (desktop) o bottom sheet (móvil). */
  variant?: "menu" | "sheet";
  anchor?: { x: number; y: number } | null;
  caps: Set<RadarCapability>;
  current: RadarVertical | null;
  fixed: boolean;
  onSelect: (vertical: RadarVertical | null) => void;
};

const OPTIONS = (
  Object.entries(VERTICAL_META) as Array<
    [Exclude<RadarVertical, "otro">, (typeof VERTICAL_META)[Exclude<RadarVertical, "otro">]]
  >
).sort(([, a], [, b]) => a.order - b.order);

/**
 * Selector de vertical (corrección humana). Filtra por capability del usuario.
 */
export function CorreoVerticalPicker({
  open,
  onClose,
  variant = "sheet",
  anchor = null,
  caps,
  current,
  fixed,
  onSelect,
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  const visible = OPTIONS.filter(([key]) => {
    const cap = VERTICAL_CAPABILITY[key];
    return Boolean(cap && caps.has(cap));
  });

  const list = (
    <div className="py-1" role="menu" aria-label="Corregir vertical">
      {visible.map(([key, meta]) => {
        const active = current === key;
        return (
          <button
            key={key}
            type="button"
            role="menuitemradio"
            aria-checked={active}
            onClick={() => {
              onClose();
              onSelect(key);
            }}
            className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] ds-tap hover:bg-ds-surface-2 ${
              active ? "text-ds-text-1" : "text-ds-text-2"
            }`}
          >
            <CorreoVerticalDot vertical={key} variant="dot" />
            <span className="min-w-0 flex-1 truncate">{meta.label}</span>
            {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
          </button>
        );
      })}
      {fixed && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onSelect(null);
          }}
          className="flex w-full items-center gap-2.5 border-t border-ds-border-subtle px-3 py-2.5 text-left text-[13px] text-ds-text-3 ds-tap hover:bg-ds-surface-2"
        >
          <RotateCcw className="h-3.5 w-3.5 shrink-0" />
          <span>Volver a la sugerencia de la IA</span>
        </button>
      )}
    </div>
  );

  if (variant === "menu" && anchor) {
    const MENU_W = 220;
    const x = Math.min(anchor.x, window.innerWidth - MENU_W - 8);
    const y = Math.min(anchor.y, window.innerHeight - 320);
    return createPortal(
      <div className="fixed inset-0 z-[70] hidden lg:block" onClick={onClose}>
        <Surface
          elevation={4}
          padding="none"
          className="absolute w-[220px] overflow-hidden rounded-xl"
          style={{ left: x, top: y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 border-b border-ds-border-subtle px-3 py-2">
            <Tag className="h-3.5 w-3.5 text-ds-text-3" />
            <p className="text-[12px] font-medium text-ds-text-2">Corregir vertical</p>
          </div>
          {list}
        </Surface>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <Surface
        elevation={4}
        padding="none"
        className="w-full max-h-[85dvh] overflow-y-auto rounded-b-none rounded-t-2xl pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] md:max-w-sm md:rounded-2xl motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-full bg-ds-surface-3 lg:hidden" />
        <div className="flex items-center justify-between px-3 pb-1 pt-2">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-ds-text-3" />
            <p className="font-display text-sm font-semibold text-ds-text-1">
              Corregir vertical
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-md ds-tap sm:h-9 sm:w-9"
          >
            <X className="h-4 w-4 text-ds-text-3" />
          </button>
        </div>
        {list}
      </Surface>
    </div>,
    document.body,
  );
}
