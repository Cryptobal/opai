"use client";

import { useEffect, useState } from "react";
import { Zap } from "lucide-react";

/**
 * Chip "⚡ Respuesta media: {h/min}" en el header de la bandeja: mediana del
 * tiempo de respuesta de los últimos 30 días. Se auto-oculta si no hay datos.
 */
export function ResponseKpiChip() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/crm/correos/kpi")
      .then((r) => r.json())
      .then((d) => {
        if (d.formatted) setLabel(d.formatted);
      })
      .catch(() => {});
  }, []);

  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-tint-violet px-2.5 py-1 text-[12px] font-medium text-tint-violet-fg">
      <Zap className="h-3.5 w-3.5" /> Respuesta media: {label}
    </span>
  );
}
