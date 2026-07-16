"use client";

import { cn } from "@/lib/utils";

/** Skeleton sutil para columnas aún no cacheadas (navegación sin bloqueo). */
export function PendingColumnPulse({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mx-auto block h-3 w-10 rounded-ds-sm bg-ds-surface-3 motion-safe:animate-pulse",
        className,
      )}
    />
  );
}
