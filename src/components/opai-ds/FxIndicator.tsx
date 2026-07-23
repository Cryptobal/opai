"use client";

/**
 * FxIndicator — indicador global UF/UTM para la barra superior del ERP.
 *
 * Muestra `UF $40.845 · UTM $71.649` en formato compacto y monoespaciado.
 * Solo lectura: consume `/api/fx/indicators` (que se auto-corrige contra la
 * CMF vía cron); NO expone el botón de refresh forzado — ese caso vive en
 * `CpqIndicators` dentro del módulo de cotizaciones.
 *
 * Revalidación suave: al montar, cada 6 h y al recuperar el foco de la
 * pestaña. Tolera respuestas nulas (render "UF —" sin romper la barra).
 */

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface FxData {
  value: number;
  date?: string;
  monthShort?: string;
}

interface IndicatorsData {
  uf: FxData | null;
  utm: FxData | null;
}

const REVALIDATE_MS = 6 * 60 * 60 * 1000; // 6 h

const formatCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);

export function FxIndicator({ className }: { className?: string }) {
  const [data, setData] = useState<IndicatorsData | null>(null);
  const [loaded, setLoaded] = useState(false);

  const fetchIndicators = useCallback(async () => {
    try {
      const res = await fetch("/api/fx/indicators", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && json.data) setData(json.data);
    } catch {
      // silencioso: el indicador es informativo, no crítico
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchIndicators();
    const interval = setInterval(fetchIndicators, REVALIDATE_MS);
    const onFocus = () => fetchIndicators();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchIndicators]);

  // Skeleton corto mientras carga la primera lectura.
  if (!loaded && !data) {
    return (
      <div
        className={cn("hidden xl:flex items-center", className)}
        aria-hidden
      >
        <div className="h-3.5 w-32 animate-pulse rounded bg-ds-surface-3" />
      </div>
    );
  }

  const uf = data?.uf?.value;
  const utm = data?.utm?.value;

  return (
    <div
      className={cn(
        "hidden xl:flex items-center gap-1.5 whitespace-nowrap font-mono text-[12px] tabular-nums text-ds-text-3",
        className,
      )}
      title="Indicadores UF / UTM"
    >
      <span className="text-ds-text-3">UF</span>
      <span className="font-semibold text-ds-text-1">
        {typeof uf === "number" ? formatCLP(uf) : "—"}
      </span>
      <span className="text-ds-text-4">·</span>
      <span className="text-ds-text-3">UTM</span>
      <span className="font-semibold text-ds-text-1">
        {typeof utm === "number" ? formatCLP(utm) : "—"}
      </span>
    </div>
  );
}
