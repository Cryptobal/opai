"use client";

import { Plus } from "lucide-react";

/**
 * FAB crear (spec §3): 56px, sobre la BottomNav (usa --bottom-nav-height que
 * ya publica el nav) y bajo los sheets (z-40 < z-50).
 */
export function AgendaFab({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Nuevo evento"
      className="fixed right-[18px] z-40 flex h-14 w-14 items-center justify-center rounded-[20px] bg-primary text-primary-foreground shadow-lg shadow-primary/45 ds-tap active:scale-95 motion-safe:transition-transform lg:hidden"
      style={{
        bottom: "calc(env(safe-area-inset-bottom) + var(--bottom-nav-height, 76px) + 10px)",
      }}
    >
      <Plus className="h-6 w-6" />
    </button>
  );
}
