"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

type ToneKey = "ok" | "info" | "warn";
type IconKey = "wallet" | "up" | "down" | "alert" | "ok";

export interface KpiData {
  label: string;
  value: string;
  tone: ToneKey;
  icon: IconKey;
  sub: string;
}

const TONE: Record<ToneKey, { bg: string; fg: string; border: string }> = {
  ok: { bg: "bg-status-ok-soft", fg: "text-status-ok-fg", border: "border-status-ok-fg/20" },
  info: { bg: "bg-status-info-soft", fg: "text-status-info-fg", border: "border-status-info-fg/20" },
  warn: { bg: "bg-status-warn-soft", fg: "text-status-warn-fg", border: "border-status-warn-fg/20" },
};

const ICONS = {
  wallet: Wallet,
  up: TrendingUp,
  down: TrendingDown,
  alert: AlertTriangle,
  ok: CheckCircle2,
};

/**
 * KPIs del Flujo de Caja en una sola fila horizontal — desktop y mobile.
 *
 * Modo colapsado (default): chips compactos con label en una línea y valor
 * en otra. Scroll horizontal en mobile si no caben.
 *
 * Modo expandido: agrega íconos a la izquierda y la línea de subtítulo.
 *
 * Toggle a la derecha controla el modo. El estado vive en este componente,
 * no se persiste — la próxima visita arranca colapsado para minimizar el
 * espacio ocupado arriba de la matriz.
 */
export function CashflowKpis({ kpis }: { kpis: KpiData[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-1">
      <div className="flex items-stretch gap-2">
        <div className="flex-1 min-w-0 overflow-x-auto">
          <div className="flex items-stretch gap-2">
            {kpis.map((k) => {
              const Icon = ICONS[k.icon];
              const tone = TONE[k.tone];
              return (
                <div
                  key={k.label}
                  className={`shrink-0 rounded-ds-md border bg-card ${tone.border} ${
                    expanded ? "px-3 py-2 min-w-[170px]" : "px-2.5 py-1.5 min-w-[120px]"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {expanded && (
                      <div className={`p-1 rounded-ds-sm shrink-0 ${tone.bg} ${tone.fg}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-[10px] font-mono uppercase tracking-[0.06em] text-ds-text-3 truncate">
                        {k.label}
                      </p>
                      <p className={`tabular-nums truncate ${tone.fg} ${
                        expanded ? "text-[15px] font-semibold" : "text-[13px] font-semibold"
                      }`}>
                        {k.value}
                      </p>
                      {expanded && (
                        <p className="text-[10px] text-ds-text-3 truncate">{k.sub}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Toggle */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 flex items-center gap-1 px-2 rounded-ds-md text-[11px] text-ds-text-3 hover:text-ds-text-1 hover:bg-muted/30 transition-colors"
          aria-label={expanded ? "Colapsar KPIs" : "Expandir KPIs"}
          title={expanded ? "Colapsar KPIs" : "Expandir KPIs"}
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>
    </div>
  );
}
