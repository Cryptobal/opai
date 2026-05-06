"use client";

/**
 * FoliosKpiCards
 *
 * Grid de 3 cards con KPIs agregados de folios CAF: total disponibles,
 * cantidad de tipos con stock crítico (<50) y cantidad de CAFs próximos a
 * vencer (≤90 días). Reusa los tonos OPAI DS.
 */

import { Card } from "@/components/ui/card";
import { AlertCircle, CalendarClock, Hash } from "lucide-react";

export interface FoliosKpiCardsProps {
  totalDisponibles: number;
  tiposConCAF: number;
  lowStockCount: number;
  expiringCount: number;
  /** Días restantes mínimos hasta el próximo CAF a vencer (null si no hay). */
  minDiasRestantes: number | null;
}

const EYEBROW =
  "text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-3 mb-1 flex items-center gap-1.5";

export function FoliosKpiCards({
  totalDisponibles,
  tiposConCAF,
  lowStockCount,
  expiringCount,
  minDiasRestantes,
}: FoliosKpiCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <Card className="p-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-status-ok-soft rounded-full -mr-8 -mt-8 opacity-60" />
        <div className="relative">
          <div className={EYEBROW}>
            <Hash className="h-3 w-3" />
            <span>Folios disponibles</span>
          </div>
          <div className="font-display text-2xl font-bold tracking-tight text-ds-text-1 ds-num">
            {totalDisponibles.toLocaleString("es-CL")}
          </div>
          <div className="text-[12px] text-ds-text-3 mt-1.5">
            en {tiposConCAF} tipo{tiposConCAF === 1 ? "" : "s"} de DTE
          </div>
        </div>
      </Card>

      <Card className="p-4 relative overflow-hidden">
        <div
          className={
            lowStockCount > 0
              ? "absolute top-0 right-0 w-24 h-24 bg-status-danger-soft rounded-full -mr-8 -mt-8 opacity-60"
              : "absolute top-0 right-0 w-24 h-24 bg-status-ok-soft rounded-full -mr-8 -mt-8 opacity-60"
          }
        />
        <div className="relative">
          <div className={EYEBROW}>
            <AlertCircle className="h-3 w-3" />
            <span>Stock crítico</span>
          </div>
          <div className="font-display text-2xl font-bold tracking-tight text-ds-text-1 ds-num">
            {lowStockCount}
          </div>
          <div
            className={
              lowStockCount > 0
                ? "text-[12px] text-status-danger-fg mt-1.5"
                : "text-[12px] text-status-ok-fg mt-1.5"
            }
          >
            {lowStockCount > 0
              ? `Tipo${lowStockCount === 1 ? "" : "s"} con menos de 50 folios`
              : "Stock OK en todos los tipos"}
          </div>
        </div>
      </Card>

      <Card className="p-4 relative overflow-hidden">
        <div
          className={
            expiringCount > 0
              ? "absolute top-0 right-0 w-24 h-24 bg-status-warn-soft rounded-full -mr-8 -mt-8 opacity-60"
              : "absolute top-0 right-0 w-24 h-24 bg-tint-violet rounded-full -mr-8 -mt-8 opacity-60"
          }
        />
        <div className="relative">
          <div className={EYEBROW}>
            <CalendarClock className="h-3 w-3" />
            <span>Próximos a vencer</span>
          </div>
          <div className="font-display text-2xl font-bold tracking-tight text-ds-text-1 ds-num">
            {expiringCount}
          </div>
          <div
            className={
              expiringCount > 0
                ? "text-[12px] text-status-warn-fg mt-1.5"
                : "text-[12px] text-ds-text-3 mt-1.5"
            }
          >
            {expiringCount > 0 && minDiasRestantes !== null
              ? `CAF${expiringCount === 1 ? "" : "s"} en ${minDiasRestantes}d o menos`
              : "Sin CAFs por vencer"}
          </div>
        </div>
      </Card>
    </div>
  );
}
