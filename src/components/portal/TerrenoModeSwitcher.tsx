"use client";

import { useEffect, useState } from "react";
import { Clock, Shield, DoorOpen } from "lucide-react";
import { usePlatform } from "@/lib/capacitor/usePlatform";
import { DEVICE_TOKEN_KEY, safeStorage } from "@/lib/device-constants";

/**
 * Top-bar mode switcher for the Terreno sub-apps (marcación, rondas, acceso).
 *
 * Renders a small translucent pill fixed at the top of the screen with three
 * icon buttons. The currently-active mode is highlighted in amber (Terreno
 * accent). Tapping another icon jumps directly to that sub-app, keeping the
 * same paired device token — no round-trip through the hub.
 *
 * Visible when ANY of the following is true:
 *   1. The page is running inside a Capacitor native shell (isNative).
 *   2. The page was navigated from the Terreno hub (`?from=terreno`).
 *   3. The browser has the persisted `opai_terreno_mode` flag in localStorage
 *      (set the first time we detect 1 or 2, never auto-cleared).
 *   4. There is a paired device token in safeStorage — a paired device is, by
 *      definition, a Terreno installation device.
 *
 * The first detection of (1) or (2) writes the persistent flag, so subsequent
 * refreshes / cold-starts / shortcut launches continue to show the switcher
 * even if the `?from=terreno` query gets dropped by the browser or by an
 * internal navigation that rewrites the URL.
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
const TERRENO_MODE_FLAG = "opai_terreno_mode";

interface TerrenoModeSwitcherProps {
  active: Mode;
}

export function TerrenoModeSwitcher({ active }: TerrenoModeSwitcherProps) {
  const { isNative } = usePlatform();
  // Start as `null` to avoid SSR/hydration flicker. The first client-side
  // effect resolves the real visibility.
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    let fromQuery = false;
    try {
      const params = new URLSearchParams(window.location.search);
      fromQuery = params.get("from") === "terreno";
    } catch {
      /* ignore */
    }

    // Persisted flag — once true, stays true until explicit logout clears
    // safeStorage. We use plain localStorage here (not safeStorage) because
    // this flag is a UX-only hint, not an auth token, and we want it scoped
    // strictly to this browser/PWA install (no cookie mirror).
    let persistedFlag = false;
    try {
      persistedFlag = window.localStorage.getItem(TERRENO_MODE_FLAG) === "1";
    } catch {
      /* ignore */
    }

    // A paired device is definitionally a Terreno device.
    let hasDeviceToken = false;
    try {
      hasDeviceToken = !!safeStorage.getItem(DEVICE_TOKEN_KEY);
    } catch {
      /* ignore */
    }

    const shouldShow = isNative || fromQuery || persistedFlag || hasDeviceToken;

    // Write-through: the first time we detect a strong terreno signal
    // (isNative or fromQuery or paired token), persist the flag so future
    // cold-starts / refreshes / shortcut launches keep showing the switcher
    // even if `?from=terreno` was dropped.
    if (shouldShow && !persistedFlag) {
      try {
        window.localStorage.setItem(TERRENO_MODE_FLAG, "1");
      } catch {
        /* ignore quota / privacy mode */
      }
    }

    setVisible(shouldShow);
  }, [isNative]);

  if (!visible) return null;

  function switchTo(href: string) {
    // Preserve the from=terreno flag so the next screen also shows the switcher
    // immediately on the first render — the persistent flag will be set on
    // mount anyway, but this keeps the existing-tab behavior identical.
    window.location.href = `${href}?from=terreno`;
  }

  return (
    <>
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
      {/* Spacer to push content below the fixed switcher */}
      <div className="h-11" aria-hidden="true" />
    </>
  );
}
