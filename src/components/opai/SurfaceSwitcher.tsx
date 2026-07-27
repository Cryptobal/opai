"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronDown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions-context";
import { useTenantModules } from "@/contexts/TenantModulesContext";
import {
  resolveProductividadLanding,
  type Surface,
} from "@/lib/surface";

interface SurfaceSwitcherProps {
  surface: Surface;
  /** Compacto para sidebar colapsado o bottom nav. */
  compact?: boolean;
  /** Abre el panel hacia arriba (BottomNav). */
  dropUp?: boolean;
  className?: string;
  onSwitched?: () => void;
}

const SURFACES: Array<{
  key: Surface;
  label: string;
  description: string;
  icon: typeof Sparkles;
}> = [
  {
    key: "productividad",
    label: "Productividad",
    description: "Correos, tareas y agenda",
    icon: Sparkles,
  },
  {
    key: "erp",
    label: "ERP",
    description: "Hub, comercial y operaciones",
    icon: Building2,
  },
];

export function SurfaceSwitcher({
  surface,
  compact = false,
  dropUp = false,
  className,
  onSwitched,
}: SurfaceSwitcherProps) {
  const router = useRouter();
  const permissions = usePermissions();
  const { isModuleEnabled } = useTenantModules();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [switching, setSwitching] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const active = SURFACES.find((s) => s.key === surface) ?? SURFACES[1];
  const ActiveIcon = active.icon;
  const busy = pending || switching;

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const select = async (next: Surface) => {
    if (next === surface || busy) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    try {
      const res = await fetch("/api/me/surface", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surface: next }),
      });
      if (!res.ok) return;

      const target =
        next === "productividad"
          ? resolveProductividadLanding(permissions, isModuleEnabled) ?? "/productividad"
          : "/hub";

      setOpen(false);
      onSwitched?.();
      startTransition(() => {
        router.push(target);
        router.refresh();
      });
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center rounded-lg text-ds-text-2 transition-colors",
          "hover:bg-ds-surface-2 hover:text-ds-text-1",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          "disabled:opacity-60",
          compact
            ? "h-11 w-11 justify-center"
            : "h-11 w-full gap-2 px-2.5 text-left",
        )}
        title={`Superficie: ${active.label}`}
      >
        <ActiveIcon className="h-4 w-4 shrink-0 text-primary" />
        {!compact && (
          <>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
              {active.label}
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-ds-text-4 transition-transform motion-reduce:transition-none",
                open && "rotate-180",
              )}
            />
          </>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="listbox"
          aria-label="Cambiar superficie"
          className={cn(
            "absolute z-50 min-w-[220px] overflow-hidden rounded-xl border border-ds-border-default",
            "bg-ds-surface-1 p-1 shadow-lg",
            "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150",
            dropUp ? "bottom-full mb-1" : "top-full mt-1",
            compact ? "left-0" : "left-0 right-0",
          )}
        >
          {SURFACES.map((item) => {
            const Icon = item.icon;
            const selected = item.key === surface;
            return (
              <button
                key={item.key}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={busy}
                onClick={() => void select(item.key)}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors",
                  "min-h-11",
                  selected
                    ? "bg-primary/10 text-ds-text-1"
                    : "text-ds-text-2 hover:bg-ds-surface-2 hover:text-ds-text-1",
                )}
              >
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", selected ? "text-primary" : "text-ds-text-3")} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium">{item.label}</span>
                  <span className="block text-[12px] text-ds-text-3">{item.description}</span>
                </span>
                {selected && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
