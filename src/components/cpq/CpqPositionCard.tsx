/**
 * Tarjeta de puesto de trabajo CPQ - Layout compacto tipo fila
 */

"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EditPositionModal } from "@/components/cpq/EditPositionModal";
import { CostBreakdownModal } from "@/components/cpq/CostBreakdownModal";
import { formatCurrency, formatWeekdaysShort, getShiftType } from "@/components/cpq/utils";
import { cn } from "@/lib/utils";
import type { CpqPosition } from "@/types/cpq";
import { Copy, Moon, Pencil, RefreshCw, Sun, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface CpqPositionCardProps {
  quoteId: string;
  position: CpqPosition;
  onUpdated?: () => void;
  readOnly?: boolean;
  salePriceMonthlyForPosition?: number;
  clientHourlyRate?: number;
}

export function CpqPositionCard({
  quoteId,
  position,
  onUpdated,
  readOnly = false,
  salePriceMonthlyForPosition: _salePriceMonthlyForPosition = 0,
  clientHourlyRate: _clientHourlyRate = 0,
}: CpqPositionCardProps) {
  const [openEdit, setOpenEdit] = useState(false);
  const [openBreakdown, setOpenBreakdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleRecalculate = async () => {
    setLoading(true);
    try {
      await fetch(`/api/cpq/quotes/${quoteId}/positions/${position.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceRecalculate: true }),
      });
      onUpdated?.();
    } catch (err) {
      console.error("Error recalculating position:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("¿Eliminar este puesto?")) return;
    setLoading(true);
    try {
      await fetch(`/api/cpq/quotes/${quoteId}/positions/${position.id}`, {
        method: "DELETE",
      });
      onUpdated?.();
    } catch (err) {
      console.error("Error deleting position:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleClone = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cpq/quotes/${quoteId}/positions/${position.id}/clone`, {
        method: "POST",
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("Puesto clonado");
      onUpdated?.();
    } catch (err) {
      console.error("Error cloning position:", err);
      toast.error("No se pudo clonar el puesto");
    } finally {
      setLoading(false);
    }
  };

  const title = position.customName
    || position.puestoTrabajo?.name
    || "Puesto";
  const shiftType = getShiftType(position.startTime);
  const badgeBase = "h-5 rounded-md border px-1.5 text-[10px] font-semibold leading-none";

  const totalGuards = position.numGuards * (position.numPuestos || 1);
  const rotationLabel =
    position.rol?.name ??
    ((position.weekdays?.length ?? 7) >= 6 ? "6x1" : (position.weekdays?.length ?? 5) === 5 ? "5x2" : `${position.weekdays?.length ?? 0}x${7 - (position.weekdays?.length ?? 0)}`);

  return (
    <Card className="overflow-hidden border border-muted/40 group hover:border-muted/60 transition-colors">
      {/* ── Collapsed row: always visible ── */}
      <div
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/5 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Center: title + badges */}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-foreground truncate">{title}</div>
          <div className="flex items-center gap-1 flex-wrap mt-1">
            <Badge
              variant="outline"
              className={cn(badgeBase, "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400")}
            >
              {totalGuards} {totalGuards === 1 ? "guardia" : "guardias"}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                badgeBase,
                shiftType === "night"
                  ? "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-400"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
              )}
            >
              {shiftType === "night" ? <Moon className="mr-0.5 h-2.5 w-2.5 inline" /> : <Sun className="mr-0.5 h-2.5 w-2.5 inline" />}
              {shiftType === "night" ? "Nocturno" : "Diurno"}
            </Badge>
            <Badge variant="outline" className={cn(badgeBase, "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400")}>
              {formatWeekdaysShort(position.weekdays)}
            </Badge>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {position.startTime}-{position.endTime} · {rotationLabel}{position.cargo?.name ? ` · ${position.cargo.name}` : ""}
          </div>
        </div>

        {/* Right: total monthly cost */}
        <span className="text-[14px] font-bold tabular-nums text-foreground shrink-0">
          {formatCurrency(Number(position.monthlyPositionCost))}
        </span>
      </div>

      {/* ── Expanded section ── */}
      {expanded && (
        <div className="border-t border-border/40">
          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-2 px-3 py-2 text-[11px]">
            <div>
              <span className="text-muted-foreground block">Puestos</span>
              <span className="font-semibold text-foreground">{position.numPuestos || 1}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Guard/puesto</span>
              <span className="font-semibold text-foreground">{position.numGuards}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Rotacion</span>
              <span className="font-semibold text-foreground">{rotationLabel}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Costo Cia</span>
              <span className="font-mono font-semibold text-foreground">{formatCurrency(Number(position.employerCost))}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Liquido</span>
              <span className="font-mono font-semibold text-foreground">{formatCurrency(Number(position.netSalary || 0))}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Base</span>
              <span className="font-mono font-semibold text-foreground">{formatCurrency(Number(position.baseSalary))}</span>
            </div>
          </div>

          {/* Action buttons */}
          {!readOnly && (
            <div className="flex items-center gap-1 px-3 py-1.5 border-t border-border/40">
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); handleRecalculate(); }} disabled={loading}>
                <RefreshCw className={cn("h-3 w-3 mr-1", loading && "animate-spin")} /> Recalcular
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); setOpenEdit(true); }}>
                <Pencil className="h-3 w-3 mr-1" /> Editar
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); handleClone(); }} disabled={loading}>
                <Copy className="h-3 w-3 mr-1" /> Duplicar
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(); }} disabled={loading}>
                <Trash2 className="h-3 w-3 mr-1" /> Eliminar
              </Button>
            </div>
          )}
        </div>
      )}

      <EditPositionModal
        quoteId={quoteId}
        position={position}
        open={openEdit}
        onOpenChange={setOpenEdit}
        onUpdated={onUpdated}
      />
      <CostBreakdownModal
        open={openBreakdown}
        onOpenChange={setOpenBreakdown}
        position={position}
      />
    </Card>
  );
}
