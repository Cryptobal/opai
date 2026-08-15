"use client";

import { useEffect, useRef } from "react";
import { Clock, Shield, DoorOpen } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Barra de modos Terreno (marcación / rondas / acceso).
 * Siempre visible en los tres portales: vive en el layout, en flujo (sticky),
 * sin gates de Capacitor / query / localStorage que la ocultaban.
 *
 * Publica `--terreno-switcher-h` para que TruthBar se ancle debajo al scrollear.
 */

type Mode = "marcacion" | "rondas" | "acceso";

const MODES: Array<{
  id: Mode;
  label: string;
  shortLabel: string;
  href: string;
  Icon: typeof Clock;
}> = [
  { id: "marcacion", label: "Marcación", shortLabel: "Marca", href: "/portal/marcacion", Icon: Clock },
  { id: "rondas", label: "Rondas", shortLabel: "Rondas", href: "/portal/rondas", Icon: Shield },
  { id: "acceso", label: "Acceso", shortLabel: "Acceso", href: "/portal/acceso", Icon: DoorOpen },
];

interface TerrenoModeSwitcherProps {
  active: Mode;
}

export function TerrenoModeSwitcher({ active }: TerrenoModeSwitcherProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const publish = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--terreno-switcher-h", `${h}px`);
    };

    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--terreno-switcher-h");
    };
  }, []);

  function switchTo(href: string) {
    // Full navigation keeps each portal's own shell/SW scope clean.
    window.location.href = href;
  }

  return (
    <div
      ref={rootRef}
      className="sticky top-0 z-50 border-b border-ds-border-subtle bg-ds-surface-1/95 px-3 py-2 backdrop-blur-sm"
      data-terreno-mode-switcher=""
    >
      <div
        role="tablist"
        aria-label="Cambiar de portal Terreno"
        className="mx-auto flex w-full max-w-md items-center gap-1 rounded-full border border-ds-border-default bg-ds-surface-2 p-1"
      >
        {MODES.map((mode) => {
          const Icon = mode.Icon;
          const isActive = mode.id === active;
          return (
            <button
              key={mode.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? "page" : undefined}
              aria-label={mode.label}
              onClick={() => {
                if (!isActive) switchTo(mode.href);
              }}
              className={cn(
                "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-[12px] font-semibold transition-colors",
                isActive
                  ? "bg-status-warn-soft text-status-warn-fg shadow-sm"
                  : "text-ds-text-3 active:bg-ds-surface-3",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={isActive ? 2.5 : 2} aria-hidden />
              <span className="truncate">{mode.shortLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
