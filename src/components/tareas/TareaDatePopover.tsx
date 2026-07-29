"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { TareaTimeGrid } from "./TareaTimeGrid";
import { dateAtChileSlot, formatAgendaTime } from "@/components/agenda/agenda-calendar-utils";
import { todayInChile, ymdInChile } from "@/lib/dates-cl";

export type DueValue = { dueAt: string | null; allDay: boolean };

export const DEFAULT_MINUTE = 9 * 60; // 09:00 Chile para tareas "todo el día".
const POPOVER_W = 300;
const GAP = 6;
const MARGIN = 8;

/** ymd (Chile) → ISO en el slot dado. Sin hora (allDay) usa DEFAULT_MINUTE. */
export function dueFromYmd(ymd: string, minute: number, allDay: boolean): DueValue {
  return { dueAt: dateAtChileSlot(ymd, minute).toISOString(), allDay };
}
function minuteOf(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}
function pickedYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function ymdToLocalDate(ymd: string): Date {
  return new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
}

/**
 * Trigger + popover opaco para elegir fecha y hora.
 * Por defecto portal a <body> (fixed). Si se pasa `portalContainer` (p. ej. el
 * Dialog.Content del detalle), se portalea ahí con posición absolute relativa
 * al contenedor — así recupera pointer-events dentro de un Dialog modal.
 */
export function TareaDatePopover({
  value,
  onChange,
  disabled,
  triggerClassName,
  portalContainer,
  children,
}: {
  value: DueValue;
  onChange: (next: DueValue) => void;
  disabled?: boolean;
  triggerClassName: string;
  /** Contenedor de portal (Dialog.Content). Si null/undefined → document.body. */
  portalContainer?: HTMLElement | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const dueYmd = value.dueAt ? ymdInChile(new Date(value.dueAt)) : null;
  const time = value.dueAt && !value.allDay ? formatAgendaTime(new Date(value.dueAt)) : "";
  const target = portalContainer ?? (typeof document !== "undefined" ? document.body : null);
  const nested = Boolean(portalContainer && portalContainer !== document.body);

  const close = useCallback(() => setOpen(false), []);
  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const menuH = menuRef.current?.offsetHeight ?? 380;
    const container = portalContainer && portalContainer !== document.body ? portalContainer : null;
    const containerRect = container?.getBoundingClientRect();

    if (container && containerRect) {
      const left = Math.max(
        MARGIN,
        Math.min(r.left - containerRect.left, containerRect.width - POPOVER_W - MARGIN),
      );
      const spaceBelow = containerRect.bottom - r.bottom - GAP - MARGIN;
      const spaceAbove = r.top - containerRect.top - GAP - MARGIN;
      const openUp = spaceBelow < menuH && spaceAbove > spaceBelow;
      const top = openUp
        ? Math.max(MARGIN, r.top - containerRect.top - GAP - menuH)
        : r.bottom - containerRect.top + GAP;
      setCoords({ top, left });
      return;
    }

    const left = Math.max(MARGIN, Math.min(r.left, window.innerWidth - POPOVER_W - MARGIN));
    const navH = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--bottom-nav-height")) || 0;
    const spaceBelow = window.innerHeight - r.bottom - GAP - MARGIN - navH;
    const spaceAbove = r.top - GAP - MARGIN;
    const openUp = spaceBelow < menuH && spaceAbove > spaceBelow;
    setCoords({ top: openUp ? Math.max(MARGIN, r.top - GAP - menuH) : r.bottom + GAP, left });
  }, [portalContainer]);

  useEffect(() => {
    if (!open) return;
    place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className={triggerClassName}
      >
        {children}
      </button>

      {open && target &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: nested ? "absolute" : "fixed",
              top: coords?.top ?? -9999,
              left: coords?.left ?? -9999,
              width: POPOVER_W,
            }}
            className={cn(
              "z-[80] max-h-[80vh] overflow-y-auto rounded-2xl border border-ds-border-default bg-ds-surface-2 p-2 shadow-ds-lg",
              !coords && "pointer-events-none opacity-0",
            )}
            role="dialog"
            aria-label="Elegir fecha y hora"
          >
            <Calendar
              mode="single"
              selected={dueYmd ? ymdToLocalDate(dueYmd) : undefined}
              onSelect={(d) => d && onChange(dueFromYmd(pickedYmd(d), time ? minuteOf(time) : DEFAULT_MINUTE, !time))}
            />
            <div className="mt-1 border-t border-ds-border-subtle px-1 pt-2">
              <TareaTimeGrid
                value={time}
                onPick={(t) => onChange(dueFromYmd(dueYmd ?? todayInChile(new Date()), minuteOf(t), false))}
                onClear={() => onChange(dueFromYmd(dueYmd ?? todayInChile(new Date()), DEFAULT_MINUTE, true))}
              />
            </div>
          </div>,
          target,
        )}
    </>
  );
}
