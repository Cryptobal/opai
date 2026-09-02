"use client";

import { Surface } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";

export function PlatformError({
  message,
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <Surface accent="danger" padding="md">
      <p className="text-[13px] text-status-danger-fg">{message ?? "No se pudo cargar."}</p>
      <Button type="button" variant="secondary" className="mt-3 h-10 sm:h-9" onClick={onRetry}>
        Reintentar
      </Button>
    </Surface>
  );
}
