"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock3, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Presets de terreno; cubren la mayoría de vencimientos de tarea. */
const PRESETS = ["08:00", "09:00", "10:00", "12:00", "15:00", "16:00", "17:00", "18:00"];

const MENU_WIDTH = 244;
const GAP = 4;
const MARGIN = 8;

/**
 * Chip + popover propio de hora para tareas (v3.1). Reemplaza al
 * `input[type=time]` nativo, que en iOS no deja limpiar ni cerrar una vez
 * elegido. `value` = "HH:MM" (vacío = sin hora / todo el día).
 *  - Vacío  → chip "＋ Hora".
 *  - Con hora → chip "17:00 ×"; la × limpia al instante (`onChange("")`).
 * El popover ofrece presets, "Sin hora" y "Listo". Se portalea a <body> con
 * posición `fixed` para que ningún ancestro con `overflow` lo recorte.
 */
export function TimeChipPicker({
  value,
  onChange,
  className,
  menuAlign = "left",
}: {
  value: string;
  onChange: (time: string) => void;
  className?: string;
  menuAlign?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setCoords(null);
  }, []);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const menuH = menuRef.current?.offsetHeight ?? 220;
    let left = menuAlign === "right" ? r.right - MENU_WIDTH : r.left;
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - MENU_WIDTH - MARGIN));
    const spaceBelow = window.innerHeight - r.bottom - GAP - MARGIN;
    const spaceAbove = r.top - GAP - MARGIN;
    const openUp = spaceBelow < menuH && spaceAbove > spaceBelow;
    const top = openUp ? Math.max(MARGIN, r.top - GAP - menuH) : r.bottom + GAP;
    setCoords({ top, left });
  }, [menuAlign]);

  useEffect(() => {
    if (!open) return;
    place();
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const reposition = () => place();
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, place, close]);

  const menu = (
    <div
      ref={menuRef}
      style={{ position: "fixed", top: coords?.top ?? -9999, left: coords?.left ?? -9999 }}
      className={cn(
        "z-[70] w-[244px] rounded-xl border border-ds-border-default bg-ds-surface-1 p-2 shadow-ds-lg",
        !coords && "pointer-events-none opacity-0",
      )}
    >
      <div className="mb-1 px-1 text-[12px] font-medium text-ds-text-4">Hora de vencimiento</div>
      <div className="grid grid-cols-4 gap-1">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={cn(
              "flex h-10 items-center justify-center rounded-lg text-ds-body ds-tap",
              value === p ? "bg-primary font-medium text-primary-foreground" : "bg-ds-surface-2 text-ds-text-1",
            )}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          onClick={() => onChange("")}
          className={cn(
            "h-10 flex-1 rounded-lg text-ds-body ds-tap",
            !value ? "bg-primary/10 font-medium text-primary" : "bg-ds-surface-2 text-ds-text-1",
          )}
        >
          Sin hora
        </button>
        <button
          type="button"
          onClick={close}
          className="h-10 flex-1 rounded-lg bg-primary text-ds-body font-medium text-primary-foreground ds-tap"
        >
          Listo
        </button>
      </div>
    </div>
  );

  return (
    <div ref={anchorRef} className={cn("relative inline-flex", className)}>
      {value ? (
        <div className="inline-flex items-center overflow-hidden rounded-xl border border-ds-border-default bg-ds-surface-1">
          <button
            type="button"
            onClick={() => (open ? close() : setOpen(true))}
            aria-label="Cambiar hora"
            aria-expanded={open}
            className="flex h-11 items-center gap-1.5 pl-3 pr-2 text-ds-body text-ds-text-1 ds-tap sm:h-9"
          >
            <Clock3 className="h-4 w-4 text-ds-text-4" />
            {value}
          </button>
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Quitar hora"
            className="grid h-11 w-9 place-items-center border-l border-ds-border-subtle text-ds-text-4 ds-tap sm:h-9"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => (open ? close() : setOpen(true))}
          aria-label="Agregar hora"
          aria-expanded={open}
          className="flex h-11 items-center gap-1.5 rounded-xl border border-dashed border-ds-border-default px-3 text-ds-body text-ds-text-3 ds-tap sm:h-9"
        >
          <Plus className="h-4 w-4" />
          Hora
        </button>
      )}
      {open && typeof document !== "undefined" && createPortal(menu, document.body)}
    </div>
  );
}

export default TimeChipPicker;
