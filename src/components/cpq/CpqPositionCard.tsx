/**
 * Tarjeta de puesto de trabajo CPQ - Layout compacto tipo fila
 */

"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EditPositionModal } from "@/components/cpq/EditPositionModal";
import { CostBreakdownModal } from "@/components/cpq/CostBreakdownModal";
import { formatCurrency, formatWeekdaysShort, getShiftType, getShiftLabel } from "@/components/cpq/utils";
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

function getTintedBadgeStyle(colorHex?: string | null): CSSProperties | undefined {
  if (!colorHex || !/^#[0-9a-f]{6}$/i.test(colorHex)) return undefined;
  return {
    backgroundColor: `${colorHex}1a`,
    borderColor: `${colorHex}5e`,
    color: colorHex,
  };
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

  const title = position.customName || position.puestoTrabajo?.name || "Puesto";
  const puestoName = position.puestoTrabajo?.name || "Puesto";
  const roleName = position.rol?.name || "—";
  const shiftType = getShiftType(position.startTime);
  const compactBadge = "h-5 rounded-full border px-1.5 text-[10px] font-medium leading-none truncate max-w-[120px]";

  return (
    <Card className="overflow-hidden border border-muted/40 group">
      {/* ── Row 1: Title + badges + actions ── */}
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <div
          className={cn("flex-1 min-w-0", !readOnly && "cursor-pointer hover:text-primary transition-colors")}
          onClick={readOnly ? undefined : () => setOpenEdit(true)}
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-foreground truncate">{title}</span>
            <Badge
              variant="outline"
              className={cn(compactBadge, "text-foreground/80")}
              style={getTintedBadgeStyle(position.puestoTrabajo?.colorHex)}
            >
              {puestoName}
            </Badge>
            <Badge
              variant="outline"
              className={cn(compactBadge, "text-foreground/80")}
              style={getTintedBadgeStyle(position.rol?.colorHex)}
            >
              {roleName}
            </Badge>
            <Badge variant="outline" className={cn(compactBadge, "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400")}>
              {position.numGuards}x{position.numPuestos || 1}
            </Badge>
            <Badge variant="outline" className={cn(compactBadge, "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400")}>
              {(position.weekdays?.length ?? 7) >= 6 ? "6x1" : (position.weekdays?.length ?? 5) === 5 ? "5x2" : `${position.weekdays?.length ?? 0}x${7 - (position.weekdays?.length ?? 0)}`}
            </Badge>
            <Badge variant="outline" className={cn(compactBadge, "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400")}>
              {formatWeekdaysShort(position.weekdays)}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                compactBadge,
                shiftType === "night"
                  ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400"
                  : "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
              )}
            >
              {shiftType === "night" ? <Moon className="mr-0.5 h-2.5 w-2.5 inline" /> : <Sun className="mr-0.5 h-2.5 w-2.5 inline" />}
              {position.startTime}-{position.endTime}
            </Badge>
          </div>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-0.5 shrink-0 rounded-md border border-transparent group-hover:border-border/40 group-hover:bg-muted/20 p-0.5 transition-colors">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setOpenEdit(true)} title="Editar">
              <Pencil className="h-3 w-3" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleClone} disabled={loading} title="Clonar">
              <Copy className="h-3 w-3" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleRecalculate} disabled={loading} title="Recalcular">
              <RefreshCw className="h-3 w-3" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={handleDelete} disabled={loading} title="Eliminar">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* ── Row 2: Costs inline ── */}
      <div
        className="flex items-center gap-3 px-2.5 py-1.5 border-t border-border/40 bg-muted/10 text-[11px] overflow-x-auto cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => setOpenBreakdown(true)}
      >
        <span className="text-muted-foreground">
          Costo c/u <span className="font-mono font-semibold text-foreground">{formatCurrency(Number(position.employerCost))}</span>
        </span>
        <span className="text-muted-foreground">
          Líquido <span className="font-mono font-semibold text-foreground">{formatCurrency(Number(position.netSalary || 0))}</span>
        </span>
        <span className="text-muted-foreground">
          Base <span className="font-mono font-semibold text-foreground">{formatCurrency(Number(position.baseSalary))}</span>
        </span>
        <span className="text-muted-foreground/60">·</span>
        <span className="font-semibold text-foreground">
          Total: <span className="font-mono">{formatCurrency(Number(position.monthlyPositionCost))}</span>
        </span>
      </div>

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
