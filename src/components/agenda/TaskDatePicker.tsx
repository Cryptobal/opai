"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

const MENU_WIDTH = 288;
const GAP = 4;
const MARGIN = 8;

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISODate(value: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) left -= 1;
  }
  return d;
}

function formatLabel(value: string): string {
  const d = parseISODate(value);
  if (!d) return "Sin fecha";
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Selector de fecha no nativo (gemelo de TaskTimePicker): portal a body,
 * posición fixed, cierre por click-outside y Escape, atajos Hoy / Mañana / T-5.
 * `value` = "YYYY-MM-DD" (cadena vacía = sin fecha).
 */
export function TaskDatePicker({
  value,
  onChange,
  className,
  ariaLabel = "Fecha",
  menuAlign = "left",
  allowEmpty = true,
}: {
  value: string;
  onChange: (date: string) => void;
  className?: string;
  ariaLabel?: string;
  menuAlign?: "left" | "right";
  /** Si false, no muestra «Sin fecha». */
  allowEmpty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setCoords(null);
  }, []);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const menuH = menuRef.current?.offsetHeight ?? 360;
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
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, place, close]);

  useEffect(() => {
    if (open) place();
  }, [open, place]);

  const pick = (iso: string) => {
    onChange(iso);
    close();
  };

  const today = new Date();
  const selected = parseISODate(value);

  const menu = (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: coords?.top ?? -9999,
        left: coords?.left ?? -9999,
        width: MENU_WIDTH,
      }}
      className={cn(
        "z-[60] rounded-xl border border-ds-border-default bg-ds-surface-1 p-2 shadow-ds-lg",
        !coords && "pointer-events-none opacity-0",
      )}
    >
      <div className="mb-2 flex flex-wrap gap-1">
        <Shortcut
          label="Hoy"
          onClick={() => pick(toISODate(today))}
          active={value === toISODate(today)}
        />
        <Shortcut
          label="Mañana"
          onClick={() => {
            const t = new Date(today);
            t.setDate(t.getDate() + 1);
            pick(toISODate(t));
          }}
          active={(() => {
            const t = new Date(today);
            t.setDate(t.getDate() + 1);
            return value === toISODate(t);
          })()}
        />
        <Shortcut
          label="T-5"
          title="5 días hábiles"
          onClick={() => pick(toISODate(addBusinessDays(today, 5)))}
          active={value === toISODate(addBusinessDays(today, 5))}
        />
        {allowEmpty && (
          <Shortcut
            label="Sin fecha"
            onClick={() => {
              onChange("");
              close();
            }}
            active={!value}
          />
        )}
      </div>
      <Calendar
        mode="single"
        selected={selected}
        onSelect={(d) => {
          if (!d) {
            if (allowEmpty) {
              onChange("");
              close();
            }
            return;
          }
          pick(toISODate(d));
        }}
        className="rounded-lg"
      />
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
        className="flex h-10 min-h-[44px] w-full min-w-[8rem] items-center gap-2 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1 sm:h-9 sm:min-h-0"
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-ds-text-4" />
        <span className={cn("truncate", !value && "text-ds-text-4")}>{formatLabel(value)}</span>
      </button>
      {open && typeof document !== "undefined" && createPortal(menu, document.body)}
    </div>
  );
}

function Shortcut({
  label,
  onClick,
  active,
  title,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center rounded-lg px-2.5 text-[12px] font-medium ds-tap",
        active ? "bg-primary/10 text-primary" : "bg-ds-surface-2 text-ds-text-2 hover:bg-ds-surface-3",
      )}
    >
      {label}
    </button>
  );
}
