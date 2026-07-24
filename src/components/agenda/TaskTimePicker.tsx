"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock3, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "15", "30", "45"];

const MENU_WIDTH = 256; // w-64
const GAP = 4;
const MARGIN = 8;

/**
 * Selector horario en pasos de 15 minutos, con botón "Sin hora" explícito.
 *
 * `value` = "HH:MM" (cadena vacía = sin hora / todo el día). Elegir una hora
 * llama `onChange("HH:MM")`; "Sin hora" llama `onChange("")`. Tokens DS v3,
 * cierre por click-outside y Escape.
 *
 * El menú se portalea a <body> con posición `fixed` calculada desde el gatillo:
 * así ningún ancestro con `overflow` (paneles del lector de correo, tarjetas
 * redondeadas, sheets) lo recorta. Abre hacia arriba si abajo no hay espacio y
 * sigue al gatillo si un contenedor interno scrollea.
 */
export function TaskTimePicker({
  value,
  onChange,
  className,
  ariaLabel = "Hora (pasos de 15 min)",
  menuAlign = "left",
}: {
  value: string;
  onChange: (time: string) => void;
  className?: string;
  ariaLabel?: string;
  /** Borde por el que se ancla el menú. "right" evita desbordes en paneles angostos. */
  menuAlign?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [selectedHour, setSelectedHour] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setSelectedHour(null);
    setCoords(null);
  }, []);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const menuH = menuRef.current?.offsetHeight ?? 240;
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
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const reposition = () => place();
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", reposition);
    // capture: sigue al gatillo aunque scrollee un contenedor interno (lector).
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, place, close]);

  // Reajusta la posición al cambiar de vista (horas ↔ minutos cambia la altura).
  useEffect(() => {
    if (open) place();
  }, [open, selectedHour, place]);

  const pickMinute = (minute: string) => {
    if (!selectedHour) return;
    onChange(`${selectedHour}:${minute}`);
    close();
  };

  const menu = (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: coords?.top ?? -9999,
        left: coords?.left ?? -9999,
      }}
      className={cn(
        "z-[60] w-64 rounded-xl border border-ds-border-default bg-ds-surface-1 p-2 shadow-ds-lg",
        !coords && "pointer-events-none opacity-0",
      )}
    >
      <button
        type="button"
        onClick={() => {
          onChange("");
          close();
        }}
        className={cn(
          "mb-2 w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-ds-surface-2",
          !value ? "bg-primary/10 font-medium text-primary" : "text-ds-text-1",
        )}
      >
        Sin hora (todo el día)
      </button>

      {!selectedHour ? (
        <div>
          <div className="mb-1 px-1 text-[12px] font-medium text-ds-text-4">Hora</div>
          <div className="grid grid-cols-6 gap-1">
            {HOURS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setSelectedHour(h)}
                className={cn(
                  "flex h-9 items-center justify-center rounded-lg text-[13px] hover:bg-ds-surface-2",
                  value.startsWith(`${h}:`) ? "bg-primary/10 font-medium text-primary" : "text-ds-text-1",
                )}
              >
                {h}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setSelectedHour(null)}
            className="mb-1 flex items-center gap-1 px-1 text-[12px] font-medium text-ds-text-4 hover:text-ds-text-1"
          >
            <ChevronLeft className="h-3 w-3" /> {selectedHour}:__
          </button>
          <div className="grid grid-cols-4 gap-1">
            {MINUTES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => pickMinute(m)}
                className={cn(
                  "flex h-10 items-center justify-center rounded-lg text-[13px] hover:bg-ds-surface-2",
                  value === `${selectedHour}:${m}` ? "bg-primary text-primary-foreground" : "text-ds-text-1",
                )}
              >
                :{m}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={ariaLabel}
        aria-expanded={open}
        className="flex h-9 min-h-[44px] items-center gap-2 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1 sm:min-h-0"
      >
        <Clock3 className="h-4 w-4 text-ds-text-4" />
        <span className={cn(!value && "text-ds-text-4")}>{value || "Sin hora"}</span>
      </button>
      {open && typeof document !== "undefined" && createPortal(menu, document.body)}
    </div>
  );
}
