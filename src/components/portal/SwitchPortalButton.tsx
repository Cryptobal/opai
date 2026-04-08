"use client";

import { ArrowLeftRight } from "lucide-react";
import { usePlatform } from "@/lib/capacitor/usePlatform";

/**
 * "Cambiar portal" button for the personal (Opai) app.
 *
 * Renders only inside the Capacitor native shell. Navigating to
 * `/portal/personal` returns the user to the hub, which then re-detects
 * active sessions and shows the portal selector.
 *
 * Mount inside profile / settings screens — NOT as a floating button.
 */
export function SwitchPortalButton() {
  const { isNative } = usePlatform();

  if (!isNative) return null;

  return (
    <button
      type="button"
      onClick={() => {
        window.location.href = "/portal/personal";
      }}
      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-300 transition-colors"
      aria-label="Cambiar de portal"
    >
      <ArrowLeftRight className="w-3.5 h-3.5" />
      <span>Cambiar portal</span>
    </button>
  );
}
