"use client";

import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { usePlatform } from "@/lib/capacitor/usePlatform";

/**
 * Floating "back to hub" button for the Terreno (shared device) app.
 *
 * Visible when either:
 *   - The page was navigated from the Terreno hub (`?from=terreno`), OR
 *   - The page is running inside a Capacitor native shell.
 *
 * Returns the user to `/portal/terreno`, which then shows the portal
 * selector (or auto-redirects if only one portal is enabled).
 *
 * Reads `from` directly from `window.location.search` instead of
 * `useSearchParams` to avoid forcing the parent layout into a Suspense
 * boundary.
 */
export function BackToHubButton() {
  const { isNative } = usePlatform();
  const [fromTerreno, setFromTerreno] = useState(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("from") === "terreno") {
        setFromTerreno(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const visible = fromTerreno || isNative;
  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => {
        window.location.href = "/portal/terreno";
      }}
      className="fixed top-4 left-4 z-50 bg-white/10 backdrop-blur-sm rounded-full p-2 text-white hover:bg-white/20 transition-colors"
      style={{ top: "calc(var(--safe-area-top, 0px) + 1rem)" }}
      aria-label="Volver a Terreno"
    >
      <ChevronLeft className="w-6 h-6" />
    </button>
  );
}
