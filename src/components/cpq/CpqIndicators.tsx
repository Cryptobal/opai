"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, RefreshCw } from "lucide-react";

interface FxData {
  value: number;
  date?: string;
  month?: string;
  monthShort?: string;
  updatedAt?: string;
}

interface IndicatorsData {
  uf: FxData | null;
  utm: FxData | null;
}

const formatCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);

/**
 * CpqIndicators — Widget de UF/UTM exclusivo para módulo CPQ.
 *
 * Muestra los valores actuales de UF y UTM en un formato compacto,
 * útil al cotizar. Se actualiza cada 5 minutos.
 *
 * Patrón: Solo visible en páginas de cotizaciones/CPQ, no en todo el sistema.
 */
export function CpqIndicators({ className }: { className?: string }) {
  const [data, setData] = useState<IndicatorsData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchIndicators = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/fx/indicators", { cache: "no-store" });
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      }
    } catch (error) {
      console.error("Error fetching FX indicators:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIndicators();
    const interval = setInterval(fetchIndicators, 5 * 60 * 1000); // cada 5 min
    return () => clearInterval(interval);
  }, [fetchIndicators]);

  if (!data?.uf && !data?.utm) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5",
        className
      )}
    >
      <div className="flex items-center gap-1 text-muted-foreground">
        <TrendingUp className="h-3.5 w-3.5" />
        <span className="text-xs font-medium uppercase">Indicadores</span>
      </div>

      {/* UF */}
      {data?.uf && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">UF</span>
          <span className="text-sm font-mono font-semibold tabular-nums">
            {formatCLP(data.uf.value)}
          </span>
          {data.uf.date && (
            <span className="hidden lg:inline text-[10px] text-muted-foreground/70">
              {data.uf.date}
            </span>
          )}
        </div>
      )}

      {/* UTM */}
      {data?.utm && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">UTM</span>
          <span className="text-sm font-mono font-semibold tabular-nums">
            {formatCLP(data.utm.value)}
          </span>
          {data.utm.monthShort && (
            <span className="hidden lg:inline text-[10px] text-muted-foreground/70">
              {data.utm.monthShort}
            </span>
          )}
        </div>
      )}

      {/* Refresh button */}
      <button
        type="button"
        onClick={fetchIndicators}
        disabled={loading}
        className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        aria-label="Actualizar indicadores"
        title="Actualizar UF/UTM"
      >
        <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
      </button>
    </div>
  );
}
