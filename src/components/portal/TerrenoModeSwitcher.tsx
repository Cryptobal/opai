"use client";

import { useEffect, useState } from "react";
import { Clock, Shield, DoorOpen } from "lucide-react";
import { usePlatform } from "@/lib/capacitor/usePlatform";

/**
 * Top-bar mode switcher for the Terreno sub-apps (marcación, rondas, acceso).
 *
 * Renders a small translucent pill fixed at the top of the screen with three
 * icon buttons. The currently-active mode is highlighted in amber (Terreno
 * accent). Tapping another icon jumps directly to that sub-app, keeping the
 * same paired device token — no round-trip through the hub.
 *
 * Visible when:
 *   - the page is running inside a Capacitor native shell, OR
 *   - the page was navigated from the Terreno hub (`?from=terreno`).
 *
 * Reads the `from` query param via window.location.search (not
 * `useSearchParams`) to avoid forcing the parent layout into a Suspense
 * boundary.
 */

type Mode = "marcacion" | "rondas" | "acceso";

const MODES: Array<{
  id: Mode;
  label: string;
  href: string;
  Icon: typeof Clock;
}> = [
  { id: "marcacion", label: "Marcación", href: "/portal/marcacion", Icon: Clock },
  { id: "rondas", label: "Rondas", href: "/portal/rondas", Icon: Shield },
  { id: "acceso", label: "Acceso", href: "/portal/acceso", Icon: DoorOpen },
];

const ACCENT = "#f59e0b"; // amber-500 — Terreno color

interface TerrenoModeSwitcherProps {
  active: Mode;
}

export function TerrenoModeSwitcher({ active }: TerrenoModeSwitcherProps) {
  const { isNative } = usePlatform();
  const [fromTerreno, setFromTerreno] = useState(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("from") === "terreno") setFromTerreno(true);
    } catch {
      /* ignore */
    }
  }, []);

  if (!fromTerreno && !isNative) return null;

  function switchTo(href: string) {
    // Preserve the from=terreno flag so the next screen also shows the switcher.
    window.location.href = `${href}?from=terreno`;
  }

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 rounded-full border backdrop-blur-md"
      style={{
        top: "calc(var(--safe-area-top, 0px) + 0.75rem)",
        background: "rgba(6,10,19,0.72)",
        borderColor: "rgba(255,255,255,0.08)",
        padding: "4px",
        boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
      }}
      role="tablist"
      aria-label="Cambiar de modo"
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
            aria-label={mode.label}
            onClick={() => {
              if (!isActive) switchTo(mode.href);
            }}
            className="flex items-center gap-1.5 rounded-full transition-all"
            style={{
              padding: isActive ? "7px 14px" : "7px 9px",
              background: isActive ? `${ACCENT}18` : "transparent",
              color: isActive ? ACCENT : "#9ca3af",
              border: isActive
                ? `1px solid ${ACCENT}35`
                : "1px solid transparent",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: isActive ? 600 : 500,
              fontSize: "12px",
              letterSpacing: "-0.01em",
            }}
          >
            <Icon className="w-4 h-4" strokeWidth={2} />
            {isActive ? <span>{mode.label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
